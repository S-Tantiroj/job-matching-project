-- Allow a user to update their own profile row (e.g. settings, display_name).
-- Role changes are still restricted: this policy only permits a user to edit
-- their OWN row; it does not grant editing other users' roles.

create policy "update own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
