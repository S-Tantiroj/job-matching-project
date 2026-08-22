-- v3 Self-assessment: ตารางโปรไฟล์ที่ผู้ใช้อัปโหลดเอง แยกจาก candidate pool
--
-- ไฟล์นี้ DROP ตาราง ซึ่งขัดกติกา "migration ต้อง additive" ของโปรเจกต์อย่างจงใจ
-- เหตุผลที่ปลอดภัยเฉพาะกรณีนี้ (ห้ามใช้เป็นบรรทัดฐานว่า drop ได้ตามใจ):
--   1. ตาราง resumes และ matches ว่างทั้งคู่ (0 แถว ตรวจเมื่อ 2026-08-20)
--   2. ไม่มีโค้ดใดในรีโปอ้างถึง (grep 'resumes' ไม่พบผลลัพธ์ในไฟล์ .ts/.tsx/.sql)
--   3. ไม่ได้ถูกสร้างโดย migration ใดในรีโปนี้ (มาจากยุค import_jobs.py ซึ่งไม่อยู่ในรีโป)
--   4. ไม่แตะตาราง jobs ซึ่งเป็นสิ่งที่กติกาตั้งใจปกป้อง
--   5. ทั้งคู่เปิด public โดยไม่มี RLS (Supabase advisor ระดับ ERROR) การลบจึงปิดช่องโหว่ไปด้วย

-- Drop matches before resumes: verified live FK matches.resume_id -> resumes(id).
-- Dropping resumes first fails ("cannot drop table resumes because other
-- objects depend on it") and rolls back the whole migration. Do not reorder
-- alphabetically.
drop table if exists public.matches;
drop table if exists public.resumes;

create table public.self_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  file_name text,
  raw_text text,
  parsed_data jsonb,
  assessment jsonb,
  embedding vector(768),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index self_profiles_owner_idx on public.self_profiles (owner_id);

create table public.resume_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.self_profiles(id) on delete cascade,
  requirement_text text not null,
  requirement_hash text not null,
  score int not null,
  reasoning text,
  created_at timestamptz default now(),
  unique (profile_id, requirement_hash)
);

alter table public.self_profiles enable row level security;
alter table public.resume_assessments enable row level security;

-- RLS คุมเส้นทางที่เข้าผ่าน anon key จากเบราว์เซอร์โดยตรง
-- ส่วน API route ของแอปใช้ service-role ซึ่ง bypass RLS จึงต้องกรอง owner_id เองในโค้ด
create policy "own self profile" on public.self_profiles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own resume assessments" on public.resume_assessments
  for all using (
    exists (
      select 1 from public.self_profiles p
      -- Qualified deliberately: an unqualified profile_id resolves to the
      -- outer resume_assessments column only because self_profiles has no
      -- column of that name today. If self_profiles ever gains one, an
      -- unqualified reference would silently become p.id = p.profile_id.
      where p.id = public.resume_assessments.profile_id and p.owner_id = auth.uid()
    )
  );
