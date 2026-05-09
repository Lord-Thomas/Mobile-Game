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
