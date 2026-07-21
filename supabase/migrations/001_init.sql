-- Candidate sourcing schema. Additive: does NOT touch the existing `jobs` table.
-- Apply on Supabase (SQL editor or `supabase db push`).

create extension if not exists vector;

create type user_role as enum ('admin', 'member');
create type cand_source as enum ('synthetic', 'csv', 'upload', 'scraper');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role user_role not null default 'member',
  settings jsonb,
  created_at timestamptz default now()
);

create table candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  photo_url text,
  headline text,
  location text,
  summary text,
  source cand_source not null,
  raw_data jsonb,
  embedding vector(768),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table education (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  institution text,
  country text,
  degree text,
  field_of_study text,
  start_year int,
  end_year int
);

create table experience (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  company text,
  title text,
  start_date date,
  end_date date,
  description text
);

create table skills (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table candidate_skills (
  candidate_id uuid references candidates(id) on delete cascade,
  skill_id uuid references skills(id) on delete cascade,
  primary key (candidate_id, skill_id)
);

create table shortlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now()
);

create table shortlist_candidates (
  shortlist_id uuid references shortlists(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  note text,
  primary key (shortlist_id, candidate_id)
);

create table analyses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  requirement_text text not null,
  requirement_hash text not null,
  score int not null,
  reasoning text,
  created_at timestamptz default now(),
  unique (candidate_id, requirement_hash)
);

-- Indexes for scale (thousands–tens of thousands)
create index candidates_embedding_idx on candidates using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index education_country_idx on education (country);

-- Vector similarity search over candidates
create or replace function match_candidates(query_embedding vector(768), match_count int)
returns table (id uuid, similarity float)
language sql stable as $$
  select c.id, 1 - (c.embedding <=> query_embedding) as similarity
  from candidates c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Row Level Security
alter table candidates enable row level security;
alter table shortlists enable row level security;
alter table shortlist_candidates enable row level security;
alter table profiles enable row level security;

create policy "read candidates for authed" on candidates
  for select using (auth.role() = 'authenticated');
create policy "insert candidates for authed" on candidates
  for insert with check (auth.role() = 'authenticated');

create policy "own shortlists" on shortlists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own shortlist items" on shortlist_candidates
  for all using (
    exists (select 1 from shortlists s where s.id = shortlist_id and s.owner_id = auth.uid())
  );

create policy "read own profile" on profiles
  for select using (
    id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );
