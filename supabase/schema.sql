-- Roundhouse Tracker: per-user storage for followed bills, positions, notes and preferences.
-- Run once in the Supabase SQL editor (Project -> SQL Editor -> New query -> paste -> Run).
-- Passwords are NOT stored here. Supabase Auth stores them hashed (bcrypt) in the auth schema.

create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  -- keep one user from filling the database (512 KB is thousands of notes)
  constraint user_data_size check (pg_column_size(data) < 524288),
  constraint user_data_is_object check (jsonb_typeof(data) = 'object')
);

-- Row Level Security: every request is checked against the signed-in user, in the database itself.
alter table public.user_data enable row level security;
alter table public.user_data force row level security;

-- If the user has turned on two-step verification, require a session that passed it (aal2).
-- Users without a second factor still work (aal1).
create or replace function public.session_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;

revoke all on function public.session_ok() from public, anon;
grant execute on function public.session_ok() to authenticated;

drop policy if exists "own row select" on public.user_data;
drop policy if exists "own row insert" on public.user_data;
drop policy if exists "own row update" on public.user_data;
drop policy if exists "own row delete" on public.user_data;
create policy "own row select" on public.user_data for select to authenticated using ((select auth.uid()) = user_id and public.session_ok());
create policy "own row insert" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id and public.session_ok());
create policy "own row update" on public.user_data for update to authenticated using ((select auth.uid()) = user_id and public.session_ok()) with check ((select auth.uid()) = user_id);
create policy "own row delete" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id and public.session_ok());

-- Nobody who is not signed in can touch the table at all.
revoke all on public.user_data from anon, public;
grant select, insert, update, delete on public.user_data to authenticated;

-- updated_at is set by the database, never by the browser (used to detect two devices editing at once).
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data for each row execute function public.touch_updated_at();

-- Lets a signed-in user delete their own account and all their data (right to erasure).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.session_ok() then raise exception 'two-step verification required'; end if;
  delete from auth.users where id = auth.uid();   -- cascades to user_data
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
