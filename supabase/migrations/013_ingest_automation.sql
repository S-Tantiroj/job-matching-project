-- v4 Scraper automation: ตามรอยที่มาของข้อมูล คิวรอตรวจ และรายชื่อระงับตามคำขอ (PDPA)
-- Additive ทั้งหมด: เพิ่มตารางใหม่และคอลัมน์ใหม่ ไม่ drop ไม่ alter ของเดิม

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,                    -- 'scheduled' | 'manual'
  source text not null,                     -- 'phantombuster' | 'csv_upload'
  criteria jsonb,                           -- agent id / search URL ที่ใช้ดึง (หลักฐาน PDPA)
  status text not null,                     -- 'running' | 'success' | 'partial' | 'failed'
  imported int not null default 0,
  updated int not null default 0,
  pending int not null default 0,
  skipped_unchanged int not null default 0, -- ข้ามเพราะ embed_hash ตรง
  skipped_suppressed int not null default 0,-- ข้ามเพราะอยู่ในรายชื่อระงับ
  errors jsonb,
  started_at timestamptz default now(),
  finished_at timestamptz
);

create index ingest_runs_started_idx on public.ingest_runs (started_at desc);

create table public.pending_candidates (
  id uuid primary key default gen_random_uuid(),
  ingest_run_id uuid references public.ingest_runs(id) on delete set null,
  linkedin_url text unique,
  full_name text not null,
  headline text,                 -- denormalize ไว้แสดงในคิว จะได้ไม่ต้องดึง payload ทั้งก้อนมาเรนเดอร์
  payload jsonb not null,        -- CandidateInput ทั้งก้อน ส่งเข้า upsertCandidate ตอนอนุมัติ
  missing text[] not null,
  status text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create index pending_candidates_status_idx on public.pending_candidates (status);

create table public.suppressed_profiles (
  id uuid primary key default gen_random_uuid(),
  linkedin_url text not null unique,
  full_name text,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.candidates add column if not exists ingest_run_id uuid
  references public.ingest_runs(id) on delete set null;
alter table public.candidates add column if not exists embed_hash text;
create index if not exists candidates_embed_hash_idx on public.candidates (embed_hash);

-- RLS เปิดแต่ไม่มี policy โดยตั้งใจ: เข้าถึงได้เฉพาะผ่าน service-role client ฝั่ง server
-- ซึ่ง gate ด้วย role ในโค้ดอยู่แล้ว ไม่มีเส้นทางที่ anon key ควรแตะข้อมูลเหล่านี้
-- รูปแบบเดียวกับ analyses/education/experience ที่มีอยู่
-- Supabase advisor จะขึ้น INFO rls_enabled_no_policy ซึ่งเป็นพฤติกรรมที่ตั้งใจ
alter table public.ingest_runs enable row level security;
alter table public.pending_candidates enable row level security;
alter table public.suppressed_profiles enable row level security;
