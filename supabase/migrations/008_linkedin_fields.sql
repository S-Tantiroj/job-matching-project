-- LinkedIn scraper ingest support. Additive: adds nullable columns + a partial
-- unique index for dedup. Does NOT drop/alter the jobs table or existing columns.
alter table candidates add column if not exists linkedin_url text;
alter table candidates add column if not exists professional_email text;
alter table candidates add column if not exists refreshed_at timestamptz;

create unique index if not exists candidates_linkedin_url_key
  on candidates (linkedin_url) where linkedin_url is not null;
