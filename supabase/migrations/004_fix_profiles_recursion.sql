-- Fix infinite recursion (42P17) in the profiles SELECT policy.
--
-- The original "read own profile" policy (001_init.sql) referenced the
-- profiles table inside its own USING clause:
--   or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
-- Evaluating that subquery re-triggers the same policy on profiles, so every
-- SELECT on profiles (including a user reading their OWN row) errors with
-- "infinite recursion detected in policy for relation profiles". That made
-- getSession() fall back to role 'member', which blocked admins from /admin.
--
-- Fix: read the caller's role through a SECURITY DEFINER function, which runs
-- as the function owner and bypasses RLS, so no recursion occurs.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "read own profile" on public.profiles;

create policy "read own profile" on public.profiles
  for select using (
    id = auth.uid() or public.is_admin()
  );
