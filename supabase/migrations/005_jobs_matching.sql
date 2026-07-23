-- Job-matching support. Additive: enables RLS + a read policy on the existing
-- jobs table (created by import_jobs.py). Does NOT drop or alter any jobs column.
-- Deep job-fit scores reuse the existing `analyses` table (keyed by
-- candidate_id + requirement_hash), so no new score table is needed.

alter table public.jobs enable row level security;

drop policy if exists "read jobs for authed" on public.jobs;
create policy "read jobs for authed" on public.jobs
  for select using (auth.role() = 'authenticated');

-- No insert/update policy: job writes go through the service-role server client
-- (bypasses RLS) and import_jobs.py (direct postgres connection, bypasses RLS).
