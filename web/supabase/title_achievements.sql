alter table public.player_progress
add column if not exists equipped_title_id text;

create table if not exists public.player_achievements (
  user_id uuid references auth.users(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  source text,
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id)
);

create table if not exists public.player_titles (
  user_id uuid references auth.users(id) on delete cascade,
  title_id text not null,
  unlocked_at timestamptz not null default now(),
  source text,
  metadata jsonb not null default '{}'::jsonb,
  primary key (user_id, title_id)
);

create table if not exists public.limited_title_claims (
  title_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  claim_number integer not null check (claim_number > 0),
  claimed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (title_id, user_id),
  unique (title_id, claim_number)
);

alter table public.player_achievements enable row level security;
alter table public.player_titles enable row level security;
alter table public.limited_title_claims enable row level security;

grant select, insert on public.player_achievements to authenticated;
grant select, insert on public.player_titles to authenticated;
grant select on public.limited_title_claims to authenticated;

drop policy if exists "Players can read their own achievements" on public.player_achievements;
drop policy if exists "Players can read their own titles" on public.player_titles;
drop policy if exists "Players can read limited title claims" on public.limited_title_claims;

create policy "Players can read their own achievements"
on public.player_achievements
for select
to authenticated
using (auth.uid() = user_id);

create policy "Players can read their own titles"
on public.player_titles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Players can read limited title claims"
on public.limited_title_claims
for select
to authenticated
using (true);

create or replace function public.get_player_titles(requested_scope text default 'player')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  safe_scope text := case when requested_scope = 'admin' then 'admin' else 'player' end;
  equipped_title text;
  owned_titles jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select equipped_title_id
  into equipped_title
  from public.player_progress
  where user_id = current_user_id
    and progress_scope = safe_scope;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'titleId', title_id,
        'unlockedAt', unlocked_at,
        'source', source,
        'metadata', metadata
      )
      order by unlocked_at asc
    ),
    '[]'::jsonb
  )
  into owned_titles
  from public.player_titles
  where user_id = current_user_id;

  return jsonb_build_object(
    'equippedTitleId', equipped_title,
    'ownedTitles', owned_titles
  );
end;
$$;

grant execute on function public.get_player_titles(text) to authenticated;

create or replace function public.equip_player_title(p_title_id text default null, requested_scope text default 'player')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  safe_scope text := case when requested_scope = 'admin' then 'admin' else 'player' end;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if p_title_id is not null and not exists (
    select 1
    from public.player_titles
    where user_id = current_user_id
      and player_titles.title_id = p_title_id
  ) then
    raise exception 'title_not_owned';
  end if;

  insert into public.player_progress (user_id, progress_scope, equipped_title_id)
  values (current_user_id, safe_scope, p_title_id)
  on conflict (user_id, progress_scope) do update
  set
    equipped_title_id = excluded.equipped_title_id,
    updated_at = now();

  return true;
end;
$$;

grant execute on function public.equip_player_title(text, text) to authenticated;

create or replace function public.claim_first_mob_defeat_rewards(requested_scope text default 'player')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_achievement_id constant text := 'first_mob_defeated';
  target_title_id constant text := 'first_mob_slayer_founder';
  title_limit constant integer := 50;
  existing_claim_number integer;
  current_claim_count integer;
  next_claim_number integer;
  inserted_achievement_count integer := 0;
  inserted_title_count integer := 0;
begin
  if current_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_authenticated',
      'achievementUnlocked', false,
      'titleUnlocked', false,
      'claimNumber', null
    );
  end if;

  insert into public.player_achievements (user_id, achievement_id, source)
  values (current_user_id, target_achievement_id, 'first_mob_defeat')
  on conflict (user_id, achievement_id) do nothing;
  get diagnostics inserted_achievement_count = row_count;

  select claim_number
  into existing_claim_number
  from public.limited_title_claims
  where title_id = target_title_id
    and user_id = current_user_id;

  if existing_claim_number is not null then
    return jsonb_build_object(
      'ok', true,
      'reason', 'already_claimed',
      'achievementUnlocked', inserted_achievement_count > 0,
      'titleUnlocked', false,
      'claimNumber', existing_claim_number
    );
  end if;

  perform pg_advisory_xact_lock(hashtext('limited_title:' || target_title_id));

  select claim_number
  into existing_claim_number
  from public.limited_title_claims
  where title_id = target_title_id
    and user_id = current_user_id;

  if existing_claim_number is not null then
    return jsonb_build_object(
      'ok', true,
      'reason', 'already_claimed',
      'achievementUnlocked', inserted_achievement_count > 0,
      'titleUnlocked', false,
      'claimNumber', existing_claim_number
    );
  end if;

  select count(*)
  into current_claim_count
  from public.limited_title_claims
  where title_id = target_title_id;

  if current_claim_count >= title_limit then
    return jsonb_build_object(
      'ok', true,
      'reason', 'limit_reached',
      'achievementUnlocked', inserted_achievement_count > 0,
      'titleUnlocked', false,
      'claimNumber', null
    );
  end if;

  next_claim_number := current_claim_count + 1;

  insert into public.limited_title_claims (title_id, user_id, claim_number, metadata)
  values (
    target_title_id,
    current_user_id,
    next_claim_number,
    jsonb_build_object('achievementId', target_achievement_id)
  );

  insert into public.player_titles (user_id, title_id, source, metadata)
  values (
    current_user_id,
    target_title_id,
    'limited_first_mob_defeat',
    jsonb_build_object('claimNumber', next_claim_number, 'limit', title_limit)
  )
  on conflict (user_id, title_id) do nothing;
  get diagnostics inserted_title_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'reason', 'claimed',
    'achievementUnlocked', inserted_achievement_count > 0,
    'titleUnlocked', inserted_title_count > 0,
    'claimNumber', next_claim_number
  );
end;
$$;

grant execute on function public.claim_first_mob_defeat_rewards(text) to authenticated;

notify pgrst, 'reload schema';
