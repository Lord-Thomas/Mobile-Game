create table if not exists public.player_progress (
  user_id uuid references auth.users(id) on delete cascade,
  progress_scope text not null default 'player' check (progress_scope in ('player', 'admin')),
  display_name text,
  coins integer not null default 0 check (coins >= 0),
  inventory jsonb not null default '{}'::jsonb,
  placed_decorations jsonb not null default '[]'::jsonb,
  owned_skins text[] not null default array['classic'],
  equipped_skin text not null default 'classic',
  world_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_progress
add column if not exists display_name text;

alter table public.player_progress
add column if not exists progress_scope text not null default 'player';

alter table public.player_progress
add column if not exists equipped_title_id text;

alter table public.player_progress
drop constraint if exists player_progress_pkey;

alter table public.player_progress
add constraint player_progress_pkey primary key (user_id, progress_scope);

alter table public.player_progress
drop constraint if exists player_progress_progress_scope_check;

alter table public.player_progress
add constraint player_progress_progress_scope_check check (progress_scope in ('player', 'admin'));

alter table public.player_progress enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.player_progress to authenticated;

drop policy if exists "Players can read their own progress" on public.player_progress;
drop policy if exists "Players can create their own progress" on public.player_progress;
drop policy if exists "Players can update their own progress" on public.player_progress;

create policy "Players can read their own progress"
on public.player_progress
for select
to authenticated
using (auth.uid() = user_id);

create policy "Players can create their own progress"
on public.player_progress
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Players can update their own progress"
on public.player_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop function if exists public.add_player_coins(integer);

create or replace function public.add_player_coins(delta integer, requested_scope text default 'player')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  safe_scope text := case when requested_scope = 'admin' then 'admin' else 'player' end;
  next_coins integer;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.player_progress (user_id, progress_scope, coins)
  values (current_user_id, safe_scope, 0)
  on conflict (user_id, progress_scope) do nothing;

  update public.player_progress
  set
    coins = coins + delta,
    updated_at = now()
  where user_id = current_user_id
    and progress_scope = safe_scope
    and coins + delta >= 0
  returning coins into next_coins;

  if next_coins is null then
    raise exception 'insufficient_coins';
  end if;

  return next_coins;
end;
$$;

grant execute on function public.add_player_coins(integer, text) to authenticated;

create or replace function public.get_player_visit_world(target_user_id uuid, requested_scope text default 'player')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_scope text := case when requested_scope = 'admin' then 'admin' else 'player' end;
  progress_row public.player_progress%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into progress_row
  from public.player_progress
  where user_id = target_user_id
    and progress_scope = safe_scope;

  if progress_row.user_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', progress_row.user_id,
    'progress_scope', progress_row.progress_scope,
    'display_name', progress_row.display_name,
    'coins', 0,
    'inventory', progress_row.inventory,
    'placed_decorations', progress_row.placed_decorations,
    'owned_skins', progress_row.owned_skins,
    'equipped_skin', progress_row.equipped_skin,
    'equipped_title_id', progress_row.equipped_title_id,
    'world_settings', progress_row.world_settings,
    'updated_at', progress_row.updated_at
  );
end;
$$;

grant execute on function public.get_player_visit_world(uuid, text) to authenticated;

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

create or replace function public.claim_boss_slime_reward(requested_scope text default 'player')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  safe_scope text := case when requested_scope = 'admin' then 'admin' else 'player' end;
  weapons jsonb;
begin
  if current_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated', 'granted', false);
  end if;

  perform pg_advisory_xact_lock(hashtext('boss_slime_reward:' || current_user_id::text || ':' || safe_scope));

  insert into public.player_progress (user_id, progress_scope, world_settings)
  values (current_user_id, safe_scope, '{}'::jsonb)
  on conflict (user_id, progress_scope) do nothing;

  select case
    when jsonb_typeof(world_settings -> 'ownedWeapons') = 'array' then world_settings -> 'ownedWeapons'
    else '[]'::jsonb
  end
  into weapons
  from public.player_progress
  where user_id = current_user_id and progress_scope = safe_scope
  for update;

  if weapons @> '["cheat_sword"]'::jsonb then
    return jsonb_build_object('ok', true, 'reason', 'already_claimed', 'granted', false);
  end if;

  update public.player_progress
  set
    world_settings = jsonb_set(world_settings, '{ownedWeapons}', weapons || '["cheat_sword"]'::jsonb, true),
    updated_at = now()
  where user_id = current_user_id and progress_scope = safe_scope;

  return jsonb_build_object('ok', true, 'reason', 'claimed', 'granted', true);
end;
$$;

grant execute on function public.claim_boss_slime_reward(text) to authenticated;
