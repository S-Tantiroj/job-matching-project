# Scraper Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ดึงข้อมูลผู้สมัครจาก PhantomBuster เข้าฐานข้อมูลอัตโนมัติทุกคืน ข้อมูลครบเข้า `candidates` ทันที ข้อมูลไม่ครบเข้าคิวให้ `data_manager` ตรวจ พร้อมการตามรอยที่มาและการระงับตามคำขอ

**Architecture:** สคริปต์ `scripts/sync-phantombuster.ts` รันบน GitHub Actions ตามตารางเวลา เรียก `parseLinkedInCsv` และ `upsertCandidate` ที่มีอยู่โดยตรง (ไม่ผ่าน HTTP จึงไม่มีเพดานเวลาของ serverless) คอลัมน์ `candidates.embed_hash` ทำให้ข้ามแถวที่ไม่มีอะไรเปลี่ยนได้โดยไม่เรียก Gemini — เป็นสิ่งที่ทำให้การรันทุกคืนอยู่รอดบนโควตาจำกัด และทำให้สคริปต์ resume ได้เองโดยไม่ต้องจดตำแหน่ง

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + pgvector), Gemini `gemini-embedding-001`, GitHub Actions, plain CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-08-24-scraper-automation-design.md`

## Global Constraints

- ไม่เพิ่ม dependency ใหม่ ใช้ plain CSS และคลาสจาก `app/globals.css`
- **ทุกเส้นทาง ingest ต้องลงที่ `lib/ingest/upsert.ts`** — การเช็ครายชื่อระงับอยู่ในนั้น ไม่กระจายตามผู้เรียก
- ไม่แตะ `lib/gemini/*`, `lib/search/*`, `lib/jobs/*`, `lib/candidates/*`, `lib/self/*`
- Migration เป็น additive ห้าม drop หรือ alter ตารางเดิม
- Embedding: `gemini-embedding-001`, 768 มิติ, taskType `RETRIEVAL_DOCUMENT`
- **ห้ามเรียก generation model** — ฟีเจอร์นี้ใช้แค่ embedding
- ข้อมูลใน `candidates` เป็นภาษาอังกฤษ ข้อความ UI เป็นภาษาไทย
- Server component ยังเป็น server, client component ยังเป็น client
- ห้ามแสดง error ดิบจาก Postgres, Gemini หรือ PhantomBuster ให้ผู้ใช้เห็น
- ทุกหน้าและ API gate ด้วย `hasRole(session.role, 'data_manager')` (member ไม่เห็น admin เห็น)
- API route ใช้ service-role client ซึ่ง bypass RLS — การกรองในโค้ดคือกลไกป้องกันตัวจริง
- เทสต์เดิมทั้งหมดต้องยังเขียว
- สคริปต์ใน `scripts/` ใช้ **relative import** (`../lib/...`) ตาม `scripts/test-gemini.ts` ที่มีอยู่

## File Structure

**สร้างใหม่:**

- `supabase/migrations/013_ingest_automation.sql` — สามตารางใหม่ + สองคอลัมน์บน `candidates`
- `lib/ingest/embedHash.ts` (+ test) — hash ของข้อความที่ใช้ embed ตัดสินว่าต้อง re-embed ไหม
- `lib/ingest/classify.ts` (+ test) — ตัดสินว่าแถวเข้า `candidates` เลยหรือเข้าคิว
- `lib/ingest/phantombuster.ts` — ชั้นเชื่อม API ภายนอก แยกไฟล์เดียวเพราะยังไม่ยืนยันกับของจริง
- `scripts/sync-phantombuster.ts` — ตัวเดินเรื่องทั้งหมด
- `.github/workflows/sync-candidates.yml`
- `app/api/pending/[id]/approve/route.ts`, `app/api/pending/reject/route.ts`
- `app/api/candidates/[id]/suppress/route.ts`, `app/api/suppressed/[id]/route.ts`
- `app/(app)/import/pending/page.tsx`, `app/(app)/import/suppressed/page.tsx`
- `components/PendingReviewTable.tsx`, `components/SuppressedList.tsx`, `components/SuppressButton.tsx`
- `docs/manual-tests/scraper-automation.md`

**แก้ไข:** `lib/ingest/upsert.ts`, `app/api/ingest/route.ts`, `app/(app)/import/page.tsx`, `app/(app)/candidates/[id]/page.tsx`, `CLAUDE.md`

---

### Task A1: Migration 013 — ตารางและคอลัมน์

**Files:**
- Create: `supabase/migrations/013_ingest_automation.sql`

**Interfaces:**
- Produces: ตาราง `ingest_runs`, `pending_candidates`, `suppressed_profiles` และคอลัมน์ `candidates.ingest_run_id`, `candidates.embed_hash` — ทุก task ถัดไปเขียน/อ่านจากตารางเหล่านี้

- [ ] **Step 1: สร้าง migration**

สร้าง `supabase/migrations/013_ingest_automation.sql`:

```sql
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
```

- [ ] **Step 2: รัน migration บน Supabase**

เปิด Supabase SQL editor รันไฟล์นี้ แล้วตรวจ:

```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('ingest_runs','pending_candidates','suppressed_profiles')) as new_tables,
  (select count(*) from information_schema.columns where table_schema='public'
     and table_name='candidates' and column_name in ('ingest_run_id','embed_hash')) as new_columns;
```
Expected: `3, 2`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_ingest_automation.sql
git commit -m "feat(ingest): migration for run tracking, pending queue, and suppression list"
```

---

### Task A2: ฟังก์ชันบริสุทธิ์ — embedHash และ classifyRow

**Files:**
- Create: `lib/ingest/embedHash.ts`, `lib/ingest/embedHash.test.ts`, `lib/ingest/classify.ts`, `lib/ingest/classify.test.ts`

**Interfaces:**
- Consumes: `buildEmbedText(i: CandidateInput): string` และ type `CandidateInput` จาก `lib/ingest/normalize.ts` (**ห้ามแก้ไฟล์นั้น**)
- Produces:
  - `embedHash(input: CandidateInput): string`
  - `type MissingField = 'headline' | 'experience' | 'linkedin_url' | 'education'`
  - `classifyRow(input: CandidateInput): MissingField[]` — array ว่าง = ครบ
- Task A3, A4 ใช้ทั้งสองตัว

- [ ] **Step 1: เขียนเทสต์ embedHash ที่ต้องแดง**

สร้าง `lib/ingest/embedHash.test.ts`:

```ts
import { embedHash } from './embedHash'
import type { CandidateInput } from './normalize'

const base: CandidateInput = {
  full_name: 'Somchai Jaidee',
  headline: 'Chief Technology Officer',
  summary: 'Engineering leader',
  source: 'scraper',
  location: 'Bangkok',
  linkedin_url: 'https://linkedin.com/in/somchai',
  skills: ['Python'],
  education: [{ degree: 'MSc', institution: 'MIT', country: 'USA' }],
  experience: [{ title: 'CTO', company: 'Acme' }],
}

test('the same input produces the same hash', () => {
  expect(embedHash(base)).toBe(embedHash({ ...base }))
})

test('a changed headline changes the hash', () => {
  expect(embedHash({ ...base, headline: 'CEO' })).not.toBe(embedHash(base))
})

test('changed child data changes the hash', () => {
  expect(embedHash({ ...base, skills: ['Python', 'Go'] })).not.toBe(embedHash(base))
  expect(embedHash({ ...base, education: [{ degree: 'PhD', institution: 'MIT' }] })).not.toBe(embedHash(base))
  expect(embedHash({ ...base, experience: [{ title: 'CEO', company: 'Acme' }] })).not.toBe(embedHash(base))
})

test('fields outside buildEmbedText do NOT change the hash', () => {
  // ถ้าข้อนี้ไม่ผ่าน ระบบจะ re-embed คนที่แค่ย้ายที่อยู่ — เผาโควตาเปล่า
  expect(embedHash({ ...base, location: 'Chiang Mai' })).toBe(embedHash(base))
  expect(embedHash({ ...base, linkedin_url: 'https://linkedin.com/in/other' })).toBe(embedHash(base))
  expect(embedHash({ ...base, professional_email: 'a@b.co' })).toBe(embedHash(base))
})

test('whitespace-only differences do NOT change the hash', () => {
  // CSV export ซ้ำอาจมีช่องว่างต่างกันโดยเนื้อหาเหมือนเดิม ต้องไม่นับว่าเปลี่ยน
  expect(embedHash({ ...base, headline: '  Chief   Technology  Officer  ' })).toBe(embedHash(base))
})

test('the hash is a 64-character hex string', () => {
  expect(embedHash(base)).toMatch(/^[0-9a-f]{64}$/)
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/ingest/embedHash.test.ts`
Expected: FAIL — ไม่พบโมดูล `./embedHash`

- [ ] **Step 3: เขียน embedHash**

สร้าง `lib/ingest/embedHash.ts`:

```ts
import { createHash } from 'crypto'
import { buildEmbedText, type CandidateInput } from './normalize'

// Hash ของข้อความที่จะถูกส่งไป embed จริง ใช้ตัดสินว่าแถวนี้เปลี่ยนพอที่จะต้อง
// เรียก Gemini ใหม่ไหม
//
// ทำไมต้องมี: upsertCandidate เรียก embedText เป็นบรรทัดแรกสุด ก่อนจะเช็คว่าแถวนั้น
// มีอยู่แล้วหรือยัง การรันทุกคืนกับ search เดิมจึง re-embed ทุกคนทุกครั้ง ทั้งที่คนใหม่
// จริงมีไม่กี่คน — เผาโควตาจนฟีเจอร์ใช้ไม่ได้
//
// normalize ช่องว่างก่อน hash เพราะ CSV export ซ้ำมักมีช่องว่างต่างกันโดยเนื้อหาเหมือนเดิม
// ไม่ lowercase เพราะการเปลี่ยนตัวพิมพ์เป็นการเปลี่ยนเนื้อหาจริงที่ควร re-embed
export function embedHash(input: CandidateInput): string {
  const text = buildEmbedText(input).replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(text).digest('hex')
}
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run lib/ingest/embedHash.test.ts`
Expected: PASS ทั้ง 6 เทสต์

- [ ] **Step 5: เขียนเทสต์ classify ที่ต้องแดง**

สร้าง `lib/ingest/classify.test.ts`:

```ts
import { classifyRow } from './classify'
import type { CandidateInput } from './normalize'

const complete: CandidateInput = {
  full_name: 'Somchai Jaidee',
  headline: 'Chief Technology Officer',
  source: 'scraper',
  linkedin_url: 'https://linkedin.com/in/somchai',
  education: [{ institution: 'MIT' }],
  experience: [{ title: 'CTO', company: 'Acme' }],
}

test('a complete row has nothing missing', () => {
  expect(classifyRow(complete)).toEqual([])
})

test('each missing field is reported', () => {
  expect(classifyRow({ ...complete, headline: undefined })).toEqual(['headline'])
  expect(classifyRow({ ...complete, experience: undefined })).toEqual(['experience'])
  expect(classifyRow({ ...complete, linkedin_url: undefined })).toEqual(['linkedin_url'])
  expect(classifyRow({ ...complete, education: undefined })).toEqual(['education'])
})

test('an empty array counts as missing, not present', () => {
  expect(classifyRow({ ...complete, experience: [] })).toEqual(['experience'])
  expect(classifyRow({ ...complete, education: [] })).toEqual(['education'])
})

test('a blank or whitespace-only string counts as missing', () => {
  expect(classifyRow({ ...complete, headline: '' })).toEqual(['headline'])
  expect(classifyRow({ ...complete, headline: '   ' })).toEqual(['headline'])
  expect(classifyRow({ ...complete, linkedin_url: '  ' })).toEqual(['linkedin_url'])
})

test('several missing fields come back in a stable order', () => {
  expect(
    classifyRow({ full_name: 'X', source: 'scraper' })
  ).toEqual(['headline', 'experience', 'linkedin_url', 'education'])
})
```

- [ ] **Step 6: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/ingest/classify.test.ts`
Expected: FAIL — ไม่พบโมดูล `./classify`

- [ ] **Step 7: เขียน classify**

สร้าง `lib/ingest/classify.ts`:

```ts
import type { CandidateInput } from './normalize'

export type MissingField = 'headline' | 'experience' | 'linkedin_url' | 'education'

// ตัดสินว่าแถวนี้ครบพอจะเข้า candidates เลย หรือควรเข้าคิวให้คนตรวจก่อน
// array ว่าง = ครบ
//
// เกณฑ์ทั้งสี่มาจากผลที่เกิดจริงถ้าปล่อยข้อมูลไม่ครบเข้าไป:
//   headline ว่าง      -> ข้อความสำหรับ embed น้อยเกินไป ค้นหาเจอยาก
//   experience ว่าง    -> computeYearsExperience ได้ 0 หลุดจากตัวกรองประสบการณ์ทุกครั้ง
//   linkedin_url ว่าง  -> ไม่มี dedup key ตาม migration 008 จะตกไป dedup ด้วยชื่อซึ่งชนกันได้
//   education ว่าง     -> ยืนยันเงื่อนไข "จบจากต่างประเทศ" ไม่ได้ ซึ่งเป็นแกนของแพลตฟอร์ม
//
// full_name ไม่ต้องเช็ค — parseLinkedInCsv ทิ้งแถวที่ไม่มีชื่อไปแล้ว (linkedin.ts:30)
export function classifyRow(input: CandidateInput): MissingField[] {
  const missing: MissingField[] = []
  if (!input.headline?.trim()) missing.push('headline')
  if (!input.experience?.length) missing.push('experience')
  if (!input.linkedin_url?.trim()) missing.push('linkedin_url')
  if (!input.education?.length) missing.push('education')
  return missing
}
```

- [ ] **Step 8: รันให้เขียว**

Run: `npx vitest run lib/ingest/classify.test.ts`
Expected: PASS ทั้ง 5 เทสต์

- [ ] **Step 9: Commit**

```bash
git add lib/ingest/embedHash.ts lib/ingest/embedHash.test.ts lib/ingest/classify.ts lib/ingest/classify.test.ts
git commit -m "feat(ingest): embedHash and classifyRow pure helpers"
```

---

### Task A3: `upsertCandidate` — เช็คระงับ, เขียน embed_hash, รับ run id

**Files:**
- Modify: `lib/ingest/upsert.ts` (เขียนทับทั้งไฟล์)

**Interfaces:**
- Consumes: `embedHash` จาก `./embedHash` (Task A2)
- Produces: ลายเซ็นใหม่
  ```ts
  upsertCandidate(
    input: CandidateInput,
    createdBy?: string | null,
    ingestRunId?: string | null
  ): Promise<{ id: string | null; updated: boolean; suppressed: boolean }>
  ```
  `id` เป็น `null` เมื่อ `suppressed` เป็น `true` — Task A4 และ A5 ต้องเช็ค `suppressed` ก่อนใช้ `id`

- [ ] **Step 1: เขียนทับ `lib/ingest/upsert.ts`**

```ts
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { embedHash } from './embedHash'
import { buildEmbedText, computeYearsExperience, toIsoDate, type CandidateInput } from './normalize'

// Writes a candidate (+ education, experience, skills) to the DB.
// Dedup: scraped rows dedup on linkedin_url (stable unique); otherwise on
// full_name (+ matching first-education country).
//
// คืน suppressed: true เมื่อ linkedin_url อยู่ในรายชื่อระงับ — ไม่เขียนอะไรเลยและ id เป็น null
export async function upsertCandidate(
  input: CandidateInput,
  createdBy: string | null = null,
  ingestRunId: string | null = null
): Promise<{ id: string | null; updated: boolean; suppressed: boolean }> {
  const db = getServerClient()

  // เช็ครายชื่อระงับก่อน embed เสมอ — ไม่เสียโควตากับคนที่จะไม่ถูกเขียนอยู่แล้ว
  //
  // การเช็คอยู่ที่นี่ ไม่ใช่ในสคริปต์ เพราะกติกาของโปรเจกต์คือทุกเส้นทาง ingest ลงที่ไฟล์นี้
  // ถ้าเช็คแค่ในสคริปต์ วันที่ใครเอา CSV ชุดเดิมมาวางที่ /import ด้วยมือ คนที่ขอให้ลบจะกลับเข้ามาใหม่
  if (input.linkedin_url) {
    const { data: blocked } = await db
      .from('suppressed_profiles')
      .select('id')
      .eq('linkedin_url', input.linkedin_url)
      .maybeSingle()
    if (blocked) return { id: null, updated: false, suppressed: true }
  }

  const embedding = await embedText(buildEmbedText(input))

  let existingId: string | null = null
  if (input.linkedin_url) {
    const { data } = await db
      .from('candidates')
      .select('id')
      .eq('linkedin_url', input.linkedin_url)
      .limit(1)
      .maybeSingle()
    existingId = (data as any)?.id ?? null
  } else {
    const firstCountry = input.education?.[0]?.country ?? null
    const { data: existing } = await db
      .from('candidates')
      .select('id, education(country)')
      .eq('full_name', input.full_name)
      .limit(1)
      .maybeSingle()
    const matched =
      existing &&
      (!firstCountry || (existing as any).education?.some((e: any) => e.country === firstCountry))
    existingId = matched ? (existing as any).id : null
  }

  const row = {
    full_name: input.full_name,
    headline: input.headline ?? null,
    location: input.location ?? null,
    summary: input.summary ?? null,
    source: input.source,
    years_experience: computeYearsExperience(input.experience ?? []),
    linkedin_url: input.linkedin_url ?? null,
    professional_email: input.professional_email ?? null,
    refreshed_at: input.refreshed_at ?? null,
    raw_data: input.raw ?? null,
    embedding,
    embed_hash: embedHash(input),
    ingest_run_id: ingestRunId,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  }

  let candidateId: string
  let updated = false

  if (existingId) {
    candidateId = existingId
    updated = true
    await db.from('candidates').update(row).eq('id', candidateId)
    await db.from('education').delete().eq('candidate_id', candidateId)
    await db.from('experience').delete().eq('candidate_id', candidateId)
    await db.from('candidate_skills').delete().eq('candidate_id', candidateId)
  } else {
    const { data } = await db.from('candidates').insert(row).select('id').single()
    candidateId = (data as any).id
  }

  if (input.education?.length) {
    await db
      .from('education')
      .insert(input.education.map((e) => ({ ...e, candidate_id: candidateId })))
  }
  if (input.experience?.length) {
    await db.from('experience').insert(
      input.experience.map((e) => ({
        ...e,
        start_date: toIsoDate(e.start_date),
        end_date: toIsoDate(e.end_date),
        candidate_id: candidateId,
      }))
    )
  }
  for (const name of input.skills ?? []) {
    const { data: sk } = await db
      .from('skills')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single()
    await db.from('candidate_skills').upsert({ candidate_id: candidateId, skill_id: (sk as any).id })
  }

  return { id: candidateId, updated, suppressed: false }
}
```

- [ ] **Step 2: ตรวจว่าผู้เรียกเดิมยังใช้ได้**

พารามิเตอร์ที่สามเป็น optional จึงไม่มีผู้เรียกเดิมพัง แต่ `app/api/ingest/route.ts` นับผลลัพธ์ด้วย `r.updated ? updated++ : imported++` ซึ่งตอนนี้จะนับแถวที่ถูกระงับเป็น `imported` ผิด

แก้ `app/api/ingest/route.ts` บล็อกวนลูป จากเดิม:

```ts
    try {
      const r = await upsertCandidate(input, userId)
      r.updated ? updated++ : imported++
    } catch (e: any) {
```

เป็น:

```ts
    try {
      const r = await upsertCandidate(input, userId)
      if (r.suppressed) skipped++
      else if (r.updated) updated++
      else imported++
    } catch (e: any) {
```

และเพิ่ม `let skipped = 0` ข้างๆ `let imported = 0` กับ `let updated = 0` แล้วใส่ `skipped` ลงใน JSON ที่คืน:

```ts
  return NextResponse.json({ imported, updated, skipped, errors })
```

- [ ] **Step 3: อัปเดต `components/ImportForm.tsx` ให้แสดง skipped**

ใน `components/ImportForm.tsx` แก้ type `Result` จาก:

```tsx
type Result = { imported: number; updated: number; errors: string[] }
```

เป็น:

```tsx
type Result = { imported: number; updated: number; skipped?: number; errors: string[] }
```

และแก้บรรทัดสรุปผลจาก:

```tsx
            เพิ่มใหม่ <strong>{result.imported}</strong> · อัปเดต <strong>{result.updated}</strong> · ผิดพลาด <strong>{result.errors.length}</strong>
```

เป็น:

```tsx
            เพิ่มใหม่ <strong>{result.imported}</strong> · อัปเดต <strong>{result.updated}</strong> · ข้าม (ถูกระงับ) <strong>{result.skipped ?? 0}</strong> · ผิดพลาด <strong>{result.errors.length}</strong>
```

- [ ] **Step 4: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run lib/ingest lib/self lib/auth lib/candidates`
Expected: build ผ่าน เทสต์ที่ไม่แตะเน็ตเวิร์กเขียวทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/upsert.ts app/api/ingest/route.ts components/ImportForm.tsx
git commit -m "feat(ingest): suppression check, embed_hash, and run tracking in upsertCandidate"
```

---

### Task A4: PhantomBuster fetch, สคริปต์ sync และ GitHub Actions

**Files:**
- Create: `lib/ingest/phantombuster.ts`, `scripts/sync-phantombuster.ts`, `.github/workflows/sync-candidates.yml`

**Interfaces:**
- Consumes: `parseLinkedInCsv` จาก `lib/ingest/linkedin.ts`, `upsertCandidate(input, createdBy, ingestRunId)` (A3), `embedHash` และ `classifyRow` (A2), `getServerClient` จาก `lib/supabase/server.ts`
- Produces: `fetchLatestCsv(agentId: string): Promise<string>` — คืน CSV เป็นข้อความ

- [ ] **Step 1: เขียนชั้นเชื่อม PhantomBuster**

สร้าง `lib/ingest/phantombuster.ts`:

```ts
// ชั้นเชื่อม PhantomBuster — แยกเป็นไฟล์เดียวโดยตั้งใจ
//
// ขณะเขียน ยังไม่มีบัญชี PhantomBuster จึงยังไม่ได้ยืนยันรูปร่าง endpoint และ response
// กับ API จริง เมื่อพบว่าจริงๆ มันคืนอะไร ให้แก้เฉพาะไฟล์นี้ — ผู้เรียกทั้งหมดเห็นแค่
// "ฟังก์ชันที่คืน CSV เป็นข้อความ" จึงไม่กระทบส่วนอื่น
//
// สิ่งที่ต้องตรวจกับเอกสารของผู้ให้บริการก่อนใช้จริง:
//   1. path และ query ของ endpoint ที่ดึงผลลัพธ์ล่าสุดของ agent
//   2. ชื่อ header ของ API key
//   3. ผลลัพธ์เป็น CSV ตรงๆ หรือเป็น JSON ที่มี URL ให้ไปดาวน์โหลดต่อ

const BASE = 'https://api.phantombuster.com/api/v2'

export async function fetchLatestCsv(agentId: string): Promise<string> {
  const key = process.env.PHANTOMBUSTER_API_KEY
  if (!key) throw new Error('PHANTOMBUSTER_API_KEY is not set')

  const res = await fetch(`${BASE}/agents/fetch-output?id=${encodeURIComponent(agentId)}`, {
    headers: { 'X-Phantombuster-Key': key },
  })
  if (!res.ok) {
    throw new Error(`phantombuster responded ${res.status}`)
  }

  const body = await res.json()

  // ถ้าผลลัพธ์ถูกส่งเป็นลิงก์ไปยังไฟล์ ให้ดาวน์โหลดต่อ
  const url: string | undefined = body?.resultUrl ?? body?.data?.resultUrl
  if (url) {
    const file = await fetch(url)
    if (!file.ok) throw new Error(`phantombuster result download responded ${file.status}`)
    return await file.text()
  }

  const inline: string | undefined = body?.csv ?? body?.data?.csv
  if (typeof inline === 'string' && inline.trim()) return inline

  throw new Error('phantombuster returned no usable CSV')
}
```

- [ ] **Step 2: เขียนสคริปต์ sync**

สร้าง `scripts/sync-phantombuster.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '../lib/supabase/server'
import { fetchLatestCsv } from '../lib/ingest/phantombuster'
import { parseLinkedInCsv } from '../lib/ingest/linkedin'
import { upsertCandidate } from '../lib/ingest/upsert'
import { embedHash } from '../lib/ingest/embedHash'
import { classifyRow } from '../lib/ingest/classify'

// ดึงผลลัพธ์ล่าสุดจาก PhantomBuster แล้วนำเข้าฐานข้อมูล
// รันด้วย: npx tsx scripts/sync-phantombuster.ts [--dry-run]
//
// สคริปต์นี้ idempotent โดยธรรมชาติ — การเทียบ embed_hash ทำให้แถวที่ทำไปแล้วถูกข้าม
// จึงรันซ้ำได้เสมอ และ resume ได้เองโดยไม่ต้องมีตาราง checkpoint

const DRY_RUN = process.argv.includes('--dry-run')
const MAX_ROWS = Number(process.env.MAX_ROWS_PER_RUN ?? 600)
const DELAY_MS = Number(process.env.EMBED_DELAY_MS ?? 1200)
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 3)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const isRateLimited = (e: any) => {
  const m = String(e?.message ?? e)
  return m.includes('"code":429') || m.includes('"code":503')
}

// ลองใหม่เมื่อโดนจำกัดชั่วคราว error อื่นโยนออกทันทีเพราะ retry ไม่ช่วย
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      if (!isRateLimited(e) || attempt >= MAX_RETRIES) throw e
      const wait = DELAY_MS * Math.pow(2, attempt + 1)
      console.warn(`rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await sleep(wait)
    }
  }
}

async function main() {
  const agentId = process.env.PHANTOMBUSTER_AGENT_ID
  if (!agentId) throw new Error('PHANTOMBUSTER_AGENT_ID is not set')
  const db = getServerClient()

  // ปิด run ที่ค้างสถานะ running จากรอบก่อนที่ล้มแบบไม่คาดคิด
  if (!DRY_RUN) {
    await db
      .from('ingest_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('status', 'running')
  }

  let runId: string | null = null
  if (!DRY_RUN) {
    const { data } = await db
      .from('ingest_runs')
      .insert({
        trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'scheduled' : 'manual',
        source: 'phantombuster',
        criteria: { agentId },
        status: 'running',
      })
      .select('id')
      .single()
    runId = (data as any)?.id ?? null
  }

  const counts = { imported: 0, updated: 0, pending: 0, skipped_unchanged: 0, skipped_suppressed: 0 }
  const errors: string[] = []
  let truncated = false

  try {
    const csv = await fetchLatestCsv(agentId)
    let rows = parseLinkedInCsv(csv)
    console.log(`fetched ${rows.length} rows`)

    if (rows.length > MAX_ROWS) {
      truncated = true
      rows = rows.slice(0, MAX_ROWS)
      console.warn(`truncated to MAX_ROWS_PER_RUN=${MAX_ROWS}`)
    }

    for (const input of rows) {
      try {
        const missing = classifyRow(input)

        if (missing.length) {
          counts.pending++
          if (!DRY_RUN && input.linkedin_url) {
            await db.from('pending_candidates').upsert(
              {
                ingest_run_id: runId,
                linkedin_url: input.linkedin_url,
                full_name: input.full_name,
                payload: input,
                missing,
                status: 'pending',
              },
              { onConflict: 'linkedin_url' }
            )
          }
          continue
        }

        // มาถึงตรงนี้แปลว่า classifyRow บอกว่าครบ ซึ่งรวมถึงมี linkedin_url แน่นอน
        const { data: existing } = await db
          .from('candidates')
          .select('embed_hash')
          .eq('linkedin_url', input.linkedin_url!)
          .maybeSingle()

        if ((existing as any)?.embed_hash === embedHash(input)) {
          counts.skipped_unchanged++
          continue
        }

        if (DRY_RUN) {
          existing ? counts.updated++ : counts.imported++
          continue
        }

        const r = await withRetry(() => upsertCandidate(input, null, runId))
        if (r.suppressed) counts.skipped_suppressed++
        else if (r.updated) counts.updated++
        else counts.imported++

        // คนที่เคยเข้าคิว แล้วรอบนี้ข้อมูลครบแล้ว ต้องเอาออกจากคิว
        // ไม่งั้นคิวจะสะสมรายการที่แก้ตัวเองไปแล้ว และคนตรวจเสียเวลากับของที่เข้าระบบไปแล้ว
        if (!r.suppressed) {
          await db.from('pending_candidates').delete().eq('linkedin_url', input.linkedin_url!)
        }

        await sleep(DELAY_MS)
      } catch (e: any) {
        // แถวเดียวพังไม่ควรล้มทั้งรอบ
        errors.push(`${input.full_name}: ${e?.message ?? e}`)
        console.error(`row failed: ${input.full_name}`, e?.message ?? e)
        if (isRateLimited(e)) {
          console.error('still rate limited after retries — stopping early, next run resumes')
          break
        }
      }
    }

    const status = truncated || errors.length ? 'partial' : 'success'
    console.log(JSON.stringify({ status, ...counts, errors: errors.length, truncated }, null, 2))

    if (!DRY_RUN && runId) {
      await db
        .from('ingest_runs')
        .update({ ...counts, status, errors, finished_at: new Date().toISOString() })
        .eq('id', runId)
    }
  } catch (e: any) {
    console.error('run failed:', e?.message ?? e)
    if (!DRY_RUN && runId) {
      await db
        .from('ingest_runs')
        .update({
          ...counts,
          status: 'failed',
          errors: [String(e?.message ?? e)],
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('unexpected:', e?.message ?? e)
  process.exit(1)
})
```

- [ ] **Step 3: เขียน GitHub Actions workflow**

สร้าง `.github/workflows/sync-candidates.yml`:

```yaml
name: sync-candidates

on:
  schedule:
    # GitHub ใช้ UTC ไม่ใช่เวลาไทย — 19:00 UTC = 02:00 ของวันถัดไปตามเวลากรุงเทพ
    # อย่าเปลี่ยนเป็น '0 2 * * *' เพราะนั่นคือ 09:00 เช้าตามเวลาไทย
    - cron: '0 19 * * *'
  workflow_dispatch:

concurrency:
  group: sync-candidates
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 120
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx tsx scripts/sync-phantombuster.ts
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          PHANTOMBUSTER_API_KEY: ${{ secrets.PHANTOMBUSTER_API_KEY }}
          PHANTOMBUSTER_AGENT_ID: ${{ secrets.PHANTOMBUSTER_AGENT_ID }}
          GITHUB_EVENT_NAME: ${{ github.event_name }}
```

- [ ] **Step 4: ตรวจ build**

Run: `npm run build`
Expected: คอมไพล์ผ่าน (สคริปต์ไม่อยู่ใน build ของ Next.js แต่ type ต้องถูก)

Run: `npx tsc --noEmit`
Expected: ไม่มี type error

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/phantombuster.ts scripts/sync-phantombuster.ts .github/workflows/sync-candidates.yml
git commit -m "feat(ingest): PhantomBuster sync script and nightly GitHub Actions workflow"
```

---

### Task A5: API routes

**Files:**
- Create: `app/api/pending/[id]/approve/route.ts`, `app/api/pending/reject/route.ts`, `app/api/candidates/[id]/suppress/route.ts`, `app/api/suppressed/[id]/route.ts`

**Interfaces:**
- Consumes: `getSession`, `hasRole` จาก `lib/auth/session.ts`; `getServerClient` จาก `lib/supabase/server.ts`; `upsertCandidate(input, createdBy, ingestRunId)` (A3)
- Produces: สี่ endpoint ที่ Task A6/A7 เรียก

- [ ] **Step 1: อนุมัติรายการในคิว**

สร้าง `app/api/pending/[id]/approve/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { upsertCandidate } from '@/lib/ingest/upsert'

// POST /api/pending/[id]/approve — เอาแถวในคิวเข้า candidates จริง
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  const { id } = await params
  const db = getServerClient()

  const { data: row } = await db
    .from('pending_candidates')
    .select('id, payload')
    .eq('id', id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'ไม่พบรายการนี้' }, { status: 404 })

  let result
  try {
    result = await upsertCandidate((row as any).payload, session.userId, null)
  } catch {
    return NextResponse.json(
      { error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502 }
    )
  }

  if (result.suppressed) {
    return NextResponse.json(
      { error: 'ผู้สมัครนี้อยู่ในรายชื่อระงับ ไม่สามารถนำเข้าได้' },
      { status: 409 }
    )
  }

  await db
    .from('pending_candidates')
    .update({ status: 'approved', reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true, candidateId: result.id })
}
```

- [ ] **Step 2: ปฏิเสธเป็นกลุ่ม**

สร้าง `app/api/pending/reject/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'

// POST /api/pending/reject  body: { ids: string[] }
// ปฏิเสธเป็นกลุ่มได้เพราะการปฏิเสธไม่เพิ่มข้อมูลเข้าระบบ จึงปลอดภัย
// ส่วนการอนุมัติทำทีละคนโดยตั้งใจ — ปุ่ม "อนุมัติทั้งหมด" จะทำให้คิวกลายเป็นตราประทับเปล่า
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  let ids: string[] = []
  try {
    const body = await req.json()
    ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : []
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  if (!ids.length) return NextResponse.json({ error: 'ไม่ได้เลือกรายการ' }, { status: 400 })

  const { error } = await getServerClient()
    .from('pending_candidates')
    .update({ status: 'rejected', reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .in('id', ids)

  if (error) {
    console.error('reject failed:', error.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, rejected: ids.length })
}
```

- [ ] **Step 3: ลบและระงับ**

สร้าง `app/api/candidates/[id]/suppress/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'

// POST /api/candidates/[id]/suppress  body: { reason?: string }
// ลบผู้สมัครและเพิ่มเข้ารายชื่อระงับ "ในการกระทำเดียว"
//
// ห้ามแยกเป็นสองขั้น: ถ้ามีใครทำครึ่งเดียว (ลบแต่ไม่ระงับ) cron คืนถัดไปจะพาคนนั้นกลับมา
// ทำให้การใช้สิทธิ์ขอลบของเจ้าของข้อมูลไร้ผล
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  const { id } = await params
  let reason = ''
  try {
    reason = String((await req.json())?.reason ?? '').trim()
  } catch {
    reason = ''
  }

  const db = getServerClient()

  const { data: c } = await db
    .from('candidates')
    .select('id, full_name, linkedin_url')
    .eq('id', id)
    .maybeSingle()

  if (!c) return NextResponse.json({ error: 'ไม่พบรายการนี้' }, { status: 404 })

  const url = (c as any).linkedin_url
  if (!url) {
    return NextResponse.json(
      { error: 'ผู้สมัครนี้ไม่มี LinkedIn URL จึงป้องกันการนำเข้าซ้ำไม่ได้' },
      { status: 400 }
    )
  }

  const { error: supError } = await db.from('suppressed_profiles').upsert(
    {
      linkedin_url: url,
      full_name: (c as any).full_name,
      reason: reason || null,
      created_by: session.userId,
    },
    { onConflict: 'linkedin_url' }
  )
  if (supError) {
    console.error('suppress insert failed:', supError.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }

  // ลบหลังจากบันทึกรายชื่อระงับสำเร็จแล้วเท่านั้น
  // ถ้าลบก่อนแล้วการบันทึกล้ม จะได้สถานะที่แย่ที่สุด: ข้อมูลหายแต่คืนถัดไปกลับมาใหม่
  const { error: delError } = await db.from('candidates').delete().eq('id', id)
  if (delError) {
    console.error('suppress delete failed:', delError.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }

  await db.from('pending_candidates').delete().eq('linkedin_url', url)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: ถอนออกจากรายชื่อระงับ**

สร้าง `app/api/suppressed/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'

// DELETE /api/suppressed/[id] — ถอนออกจากรายชื่อระงับ (เผื่อเพิ่มผิด)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  const { id } = await params
  const { error } = await getServerClient().from('suppressed_profiles').delete().eq('id', id)
  if (error) {
    console.error('unsuppress failed:', error.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: ตรวจ build**

Run: `npm run build`
Expected: คอมไพล์ผ่าน

- [ ] **Step 6: Commit**

```bash
git add "app/api/pending/[id]/approve/route.ts" app/api/pending/reject/route.ts "app/api/candidates/[id]/suppress/route.ts" "app/api/suppressed/[id]/route.ts"
git commit -m "feat(ingest): API routes for pending review and suppression"
```

---

### Task A6: UI — ศูนย์รวม `/import` และคิวรอตรวจ

**Files:**
- Modify: `app/(app)/import/page.tsx`
- Create: `app/(app)/import/pending/page.tsx`, `components/PendingReviewTable.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `POST /api/pending/[id]/approve`, `POST /api/pending/reject` (A5); ตาราง `ingest_runs`, `pending_candidates` (A1)
- Produces: `type PendingRow` ที่ Task A7 ไม่ต้องใช้ — self-contained

- [ ] **Step 1: เพิ่มคลาส CSS สำหรับ badge เตือน**

ต่อท้าย `app/globals.css`:

```css
.badge-warn { display: inline-block; font-size: 11px; border-radius: 6px; padding: 2px 7px; margin-right: 4px; background: #fef3c7; color: #92400e; }
.status-pill { display: inline-block; font-size: 11px; border-radius: 999px; padding: 2px 9px; }
.status-pill--ok { background: var(--success-bg); color: var(--success-text); }
.status-pill--warn { background: #fff7ed; color: #b45309; }
.status-pill--bad { background: #fef2f2; color: #b91c1c; }
```

- [ ] **Step 2: เขียนตารางคิวรอตรวจ**

สร้าง `components/PendingReviewTable.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type PendingRow = {
  id: string
  full_name: string
  headline: string | null
  linkedin_url: string | null
  missing: string[]
  created_at: string
}

const LABELS: Record<string, string> = {
  headline: 'ไม่มีตำแหน่งย่อ',
  experience: 'ไม่มีประสบการณ์',
  linkedin_url: 'ไม่มี LinkedIn URL',
  education: 'ไม่มีการศึกษา',
}

export default function PendingReviewTable({ rows }: { rows: PendingRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const approve = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/pending/${id}/approve`, { method: 'POST' })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    router.refresh()
  }

  const rejectSelected = async () => {
    if (busy || !selected.size) return
    setBusy(true)
    setError('')
    const res = await fetch('/api/pending/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    setSelected(new Set())
    router.refresh()
  }

  if (!rows.length) return <p className="faint">ไม่มีรายการรอตรวจ</p>

  return (
    <div>
      <div className="row" style={{ margin: '12px 0' }}>
        <button className="btn" onClick={rejectSelected} disabled={busy || !selected.size}>
          ปฏิเสธที่เลือก ({selected.size})
        </button>
        <span className="faint" style={{ fontSize: 12 }}>
          อนุมัติทีละคนโดยตั้งใจ — ปฏิเสธเป็นกลุ่มได้เพราะไม่เพิ่มข้อมูลเข้าระบบ
        </span>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>ชื่อ</th>
              <th>ตำแหน่งย่อ</th>
              <th>ขาดอะไร</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`เลือก ${r.full_name}`}
                  />
                </td>
                <td>
                  {r.linkedin_url ? (
                    <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>
                      {r.full_name} ↗
                    </a>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{r.full_name}</span>
                  )}
                </td>
                <td className="muted">{r.headline ?? '—'}</td>
                <td>
                  {r.missing.map((m) => (
                    <span key={m} className="badge-warn">{LABELS[m] ?? m}</span>
                  ))}
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => approve(r.id)} disabled={busy}>
                    อนุมัติ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: เขียนหน้าคิวรอตรวจ**

สร้าง `app/(app)/import/pending/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import PendingReviewTable, { type PendingRow } from '@/components/PendingReviewTable'

export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const { data, error } = await getServerClient()
    .from('pending_candidates')
    .select('id, full_name, headline, linkedin_url, missing, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) console.error('pending query failed:', error.message)

  const rows: PendingRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    headline: r.headline ?? null,
    linkedin_url: r.linkedin_url ?? null,
    missing: r.missing ?? [],
    created_at: r.created_at ?? '',
  }))

  return (
    <main>
      <h1>คิวรอตรวจ</h1>
      <p className="muted">
        ผู้สมัครที่ระบบดึงมาได้แต่ข้อมูลไม่ครบ ตรวจแล้วอนุมัติเข้าระบบหรือปฏิเสธทิ้ง
      </p>
      <Link href="/import">← กลับไปหน้านำเข้าข้อมูล</Link>
      <PendingReviewTable rows={rows} />
    </main>
  )
}
```

- [ ] **Step 4: เขียนทับหน้า `/import` ให้เป็นศูนย์รวม**

แทนที่เนื้อหาทั้งไฟล์ `app/(app)/import/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import ImportForm from '@/components/ImportForm'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  success: 'status-pill--ok',
  partial: 'status-pill--warn',
  failed: 'status-pill--bad',
  running: 'status-pill--warn',
}

export default async function ImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const db = getServerClient()

  const { data: runs, error: runsError } = await db
    .from('ingest_runs')
    .select('id, trigger, source, status, imported, updated, pending, skipped_unchanged, skipped_suppressed, started_at')
    .order('started_at', { ascending: false })
    .limit(20)
  if (runsError) console.error('ingest_runs query failed:', runsError.message)

  const { count: pendingCount } = await db
    .from('pending_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <main>
      <h1>นำเข้าข้อมูล</h1>

      <div className="row" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
        <Link href="/import/pending" className="btn">
          คิวรอตรวจ ({pendingCount ?? 0})
        </Link>
        <Link href="/import/suppressed" className="btn">รายชื่อระงับ</Link>
      </div>

      <div className="section-header"><h2>นำเข้าด้วยตนเอง (CSV)</h2></div>
      <ImportForm />

      <div className="section-header"><h2>ประวัติการนำเข้า</h2></div>
      {(runs ?? []).length === 0 ? (
        <p className="faint">ยังไม่มีประวัติ</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ที่มา</th>
                <th>เพิ่ม</th>
                <th>อัปเดต</th>
                <th>เข้าคิว</th>
                <th>ข้าม (ไม่เปลี่ยน)</th>
                <th>ข้าม (ถูกระงับ)</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td className="muted">{String(r.started_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="muted">{r.source} · {r.trigger}</td>
                  <td>{r.imported}</td>
                  <td>{r.updated}</td>
                  <td>{r.pending}</td>
                  <td className="muted">{r.skipped_unchanged}</td>
                  <td className="muted">{r.skipped_suppressed}</td>
                  <td>
                    <span className={`status-pill ${STATUS_CLASS[r.status] ?? ''}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: ตรวจ build**

Run: `npm run build`
Expected: คอมไพล์ผ่าน

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/import/page.tsx" "app/(app)/import/pending/page.tsx" components/PendingReviewTable.tsx app/globals.css
git commit -m "feat(ingest): import hub with run history and pending review queue"
```

---

### Task A7: UI — รายชื่อระงับ, ปุ่มลบและระงับ, เอกสาร

**Files:**
- Create: `app/(app)/import/suppressed/page.tsx`, `components/SuppressedList.tsx`, `components/SuppressButton.tsx`, `docs/manual-tests/scraper-automation.md`
- Modify: `app/(app)/candidates/[id]/page.tsx`, `CLAUDE.md`

**Interfaces:**
- Consumes: `POST /api/candidates/[id]/suppress`, `DELETE /api/suppressed/[id]` (A5)

- [ ] **Step 1: เขียนรายการระงับ**

สร้าง `components/SuppressedList.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type SuppressedRow = {
  id: string
  linkedin_url: string
  full_name: string | null
  reason: string | null
  created_at: string
}

export default function SuppressedList({ rows }: { rows: SuppressedRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/suppressed/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    router.refresh()
  }

  if (!rows.length) return <p className="faint">ยังไม่มีรายชื่อระงับ</p>

  return (
    <div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>LinkedIn</th>
              <th>เหตุผล</th>
              <th>วันที่</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.full_name ?? '—'}</td>
                <td className="muted">
                  <a href={r.linkedin_url} target="_blank" rel="noreferrer">เปิด ↗</a>
                </td>
                <td className="muted">{r.reason ?? '—'}</td>
                <td className="muted">{String(r.created_at ?? '').slice(0, 10)}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => remove(r.id)} disabled={busy}>
                    ถอนออก
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: เขียนหน้ารายชื่อระงับ**

สร้าง `app/(app)/import/suppressed/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import SuppressedList, { type SuppressedRow } from '@/components/SuppressedList'

export const dynamic = 'force-dynamic'

export default async function SuppressedPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const { data, error } = await getServerClient()
    .from('suppressed_profiles')
    .select('id, linkedin_url, full_name, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) console.error('suppressed query failed:', error.message)

  const rows: SuppressedRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    linkedin_url: r.linkedin_url,
    full_name: r.full_name ?? null,
    reason: r.reason ?? null,
    created_at: r.created_at ?? '',
  }))

  return (
    <main>
      <h1>รายชื่อระงับ</h1>
      <p className="muted">
        ผู้ที่ขอให้ลบข้อมูล ระบบจะไม่นำเข้าคนเหล่านี้อีกไม่ว่าจะมาจากช่องทางใด
      </p>
      <Link href="/import">← กลับไปหน้านำเข้าข้อมูล</Link>
      <div style={{ marginTop: 12 }}>
        <SuppressedList rows={rows} />
      </div>
    </main>
  )
}
```

- [ ] **Step 3: เขียนปุ่มลบและระงับ**

สร้าง `components/SuppressButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuppressButton({
  candidateId,
  fullName,
}: {
  candidateId: string
  fullName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/candidates/${candidateId}/suppress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    router.push('/candidates')
  }

  return (
    <>
      <button
        className="btn"
        style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
        onClick={() => setOpen(true)}
      >
        ลบและห้ามนำเข้าอีก
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">ลบ {fullName} และห้ามนำเข้าอีก</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              ข้อมูลของผู้สมัครนี้จะถูกลบถาวร และระบบจะไม่นำเข้าอีกไม่ว่าจะมาจากช่องทางใด
              การกระทำนี้ย้อนกลับไม่ได้
            </p>
            <div className="field-label">เหตุผล (เก็บเป็นหลักฐานการใช้สิทธิ์)</div>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น เจ้าของข้อมูลขอให้ลบเมื่อ 24/08/2026"
            />
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="btn"
                style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
                onClick={submit}
                disabled={busy}
              >
                {busy ? 'กำลังลบ…' : 'ยืนยันลบและระงับ'}
              </button>
              <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: ใส่ปุ่มในหน้ารายละเอียดผู้สมัคร**

ใน `app/(app)/candidates/[id]/page.tsx` ทำสองจุด:

4a. เพิ่ม import ต่อจาก import เดิมที่หัวไฟล์:

```tsx
import { getSession, hasRole } from '@/lib/auth/session'
import SuppressButton from '@/components/SuppressButton'
```

4b. ในฟังก์ชัน `CandidatePage` เพิ่มการอ่าน session ต่อจากบรรทัด `const db = getServerClient()`:

```tsx
  const session = await getSession()
  const canSuppress = !!session && hasRole(session.role, 'data_manager')
```

4c. แทรกบล็อกนี้ก่อน `</main>` ปิดท้ายของหน้า:

```tsx
      {canSuppress && (
        <>
          <div className="section-header"><h2>จัดการข้อมูล</h2></div>
          <div className="card">
            <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
              ใช้เมื่อเจ้าของข้อมูลขอให้ลบ ระบบจะจำไว้และไม่นำเข้าคนนี้อีก
            </p>
            <SuppressButton candidateId={id} fullName={(c as any).full_name} />
          </div>
        </>
      )}
```

- [ ] **Step 5: อัปเดต CLAUDE.md**

ใน `CLAUDE.md` แทรกหัวข้อนี้**ก่อน**บรรทัด `### Not done / deliberately deferred`:

```markdown
### Phase 8 — v4 Scraper automation
Spec/plan: `docs/superpowers/{specs,plans}/2026-08-24-scraper-automation*`
- [x] Migration 013 — `ingest_runs` (ตามรอยที่มา, หลักฐาน PDPA), `pending_candidates`
      (คิวรอตรวจ), `suppressed_profiles` (ระงับตามคำขอ) + `candidates.ingest_run_id`
      และ `candidates.embed_hash`
- [x] **`embed_hash` คือสิ่งที่ทำให้ฟีเจอร์นี้อยู่รอด** — `upsertCandidate` เรียก `embedText`
      ก่อนเช็คว่าแถวมีอยู่แล้วไหม การรันทุกคืนกับ search เดิมจึงจะ re-embed ทุกคนทุกครั้ง
      สคริปต์เทียบ hash ก่อนเรียก Gemini จึงข้ามแถวที่ไม่เปลี่ยนได้ และ **resume ได้เอง
      โดยไม่ต้องมีตาราง checkpoint** — สคริปต์จึง idempotent รันซ้ำได้เสมอ
- [x] **เช็ครายชื่อระงับอยู่ใน `upsertCandidate` ก่อน embed** ไม่ใช่ในสคริปต์ — ถ้าเช็คแค่ใน
      สคริปต์ การวาง CSV ด้วยมือที่ `/import` จะพาคนที่ขอให้ลบกลับเข้ามา
- [x] การลบตามคำขอเป็นการกระทำเดียว (ลบ + เพิ่มรายชื่อระงับ) — แยกกันแล้วทำครึ่งเดียว
      cron คืนถัดไปจะพากลับมา
- [x] `classifyRow` คัดกรองสี่เกณฑ์ (headline, experience, linkedin_url, education)
      ครบเข้า `candidates` เลย ไม่ครบเข้าคิว — อนุมัติทีละคน ปฏิเสธเป็นกลุ่มได้
- [x] รันบน GitHub Actions ไม่ใช่ Vercel Cron เพราะ 500+ แถว × 1 embedding เกินเพดานเวลา
      ของ serverless แน่นอน — สคริปต์เรียก `upsertCandidate` ตรงๆ ไม่ผ่าน HTTP
- cron ของ GitHub เป็น **UTC** — `0 19 * * *` = 02:00 เวลาไทยของวันถัดไป
- ยังไม่ได้ยืนยัน `lib/ingest/phantombuster.ts` กับ API จริง (ยังไม่มีบัญชี) แยกไฟล์ไว้
      เพื่อให้แก้จุดเดียวเมื่อพบรูปร่างจริง
```

- [ ] **Step 6: เขียน checklist ทดสอบด้วยมือ**

สร้าง `docs/manual-tests/scraper-automation.md`:

```markdown
# คู่มือทดสอบด้วยมือ — การนำเข้าอัตโนมัติ

ส่วนที่เป็น logic ล้วนมี unit test คลุมแล้ว (`lib/ingest/embedHash.test.ts`,
`lib/ingest/classify.test.ts`) เอกสารนี้คือส่วนที่ต้องมี PhantomBuster และฐานข้อมูลจริง

## ก่อนเริ่ม

ตั้ง secret ใน GitHub → Settings → Secrets and variables → Actions:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
`PHANTOMBUSTER_API_KEY`, `PHANTOMBUSTER_AGENT_ID`

และตั้งค่าเดียวกันใน `.env` สำหรับรันบนเครื่อง

## A. dry-run ก่อนของจริง (ห้ามข้าม)

```
npx tsx scripts/sync-phantombuster.ts --dry-run
```

**ผลที่ต้องได้:** รายงานจำนวนที่**จะ**เพิ่ม/อัปเดต/เข้าคิว/ข้าม โดยไม่มีแถวใหม่ในฐานข้อมูล

ตรวจ: `select count(*) from candidates;` ก่อนและหลัง ต้องเท่ากัน
และ `select count(*) from ingest_runs;` ต้องไม่เพิ่ม

**อ่านผลว่าคนที่ได้ตรงกลุ่มเป้าหมายไหม** (C-level จบต่างประเทศ) ถ้าไม่ตรง ให้แก้ search
ใน PhantomBuster ก่อน อย่าเพิ่งรันของจริง

## B. รันจริงหนึ่งรอบ

```
npx tsx scripts/sync-phantombuster.ts
```

ตรวจ:

```sql
select status, imported, updated, pending, skipped_unchanged, skipped_suppressed
from ingest_runs order by started_at desc limit 1;
```

## C. รันซ้ำทันที — เคสสำคัญที่สุดในชุดนี้

รันคำสั่งเดิมอีกครั้งโดยไม่เปลี่ยนอะไร

**ผลที่ต้องได้:** `imported = 0`, `updated = 0`, และ `skipped_unchanged` เท่ากับจำนวนแถว
ที่ครบทั้งหมด

**ถ้าข้อนี้ไม่ผ่าน แปลว่าทุกคืนจะเผาโควตา Gemini ซ้ำทั้งหมด และฟีเจอร์นี้ใช้จริงไม่ได้**
ให้ตรวจว่า `embed_hash` ถูกเขียนลงฐานข้อมูลจริง:
`select count(*) from candidates where embed_hash is null and source = 'scraper';`

## D. รายชื่อระงับกันการนำเข้าซ้ำ

1. เปิด `/candidates` เลือกผู้สมัครที่มาจาก scraper แล้วเข้าหน้ารายละเอียด
2. กด "ลบและห้ามนำเข้าอีก" กรอกเหตุผล ยืนยัน
3. ตรวจว่าหายจาก `/candidates` และปรากฏใน `/import/suppressed`
4. รันสคริปต์ซ้ำ

**ผลที่ต้องได้:** คนนั้นไม่กลับเข้ามา และ `skipped_suppressed` เพิ่มขึ้น 1

5. ทดสอบเส้นทางด้วยมือด้วย: วาง CSV ที่มีคนนั้นอยู่ที่หน้า `/import`
   **ต้องขึ้น "ข้าม (ถูกระงับ) 1"** — พิสูจน์ว่าการเช็คอยู่ลึกถึง `upsertCandidate` จริง

## E. คิวรอตรวจ

1. เปิด `/import/pending` — ต้องเห็นรายการพร้อม badge บอกว่าขาดอะไร
2. กด "อนุมัติ" หนึ่งราย → ต้องหายจากคิว และค้นเจอที่ `/search`
3. เลือกหลายรายการแล้วกด "ปฏิเสธที่เลือก" → ต้องหายจากคิว และ**ไม่**ปรากฏใน `/candidates`

## F. คนที่เคยเข้าคิวแล้วข้อมูลครบในรอบหลัง

จำลองโดยแก้แถวในคิวให้ payload ครบ แล้วรันสคริปต์ซ้ำ (หรือรอรอบที่ PhantomBuster
ให้ข้อมูลครบขึ้น)

**ผลที่ต้องได้:** คนนั้นเข้า `candidates` และ**แถวในคิวถูกลบออก** ไม่ค้างให้คนตรวจเสียเวลา

## G. สิทธิ์

ล็อกอินด้วยบัญชี `member` แล้วเปิด `/import`, `/import/pending`, `/import/suppressed`

**ผลที่ต้องได้:** ถูกเด้งไป `/dashboard` ทั้งสามหน้า และไม่เห็นปุ่ม "ลบและห้ามนำเข้าอีก"
ในหน้ารายละเอียดผู้สมัคร

## H. GitHub Actions

ไปที่แท็บ Actions → workflow `sync-candidates` → **Run workflow** (ปุ่มนี้มาจาก
`workflow_dispatch`)

**ผลที่ต้องได้:** job เขียว และมีแถวใหม่ใน `ingest_runs` ที่ `trigger = 'manual'`
(เพราะกดเอง ไม่ใช่ตามตาราง)

## ข้อควรระวัง

**โควตา Gemini** — การรันจริงครั้งแรกจะ embed ทุกแถวที่ครบ ถ้าเป็นหลักร้อยและอยู่บน
free tier อาจโดนจำกัดกลางทาง สถานะจะเป็น `partial` ซึ่ง**ไม่ใช่ความล้มเหลว** —
รันซ้ำแล้วมันจะทำต่อจากที่ค้างเอง

**เพดานต่อรอบ** — ถ้า `MAX_ROWS_PER_RUN` ถูกชน สถานะจะเป็น `partial` และ log จะบอกว่า
ถูกตัดที่เท่าไร ปรับค่าได้ทาง env โดยไม่ต้องแก้โค้ด
```

- [ ] **Step 7: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run lib/ingest lib/self lib/auth lib/candidates`
Expected: build ผ่าน เทสต์ที่ไม่แตะเน็ตเวิร์กเขียวทั้งหมด (รวม 11 เทสต์ใหม่จาก Task A2)

- [ ] **Step 8: ตรวจด้วยตา**

`npm run dev` แล้วเปิด `/import` — ต้องเห็นปุ่มลิงก์สองอัน ฟอร์ม CSV และตารางประวัติ (ว่างได้)
เปิด `/import/pending` และ `/import/suppressed` — ต้องเรนเดอร์สถานะว่างได้โดยไม่พัง
เปิดหน้าผู้สมัครคนใดคนหนึ่ง — ต้องเห็นการ์ด "จัดการข้อมูล" พร้อมปุ่มสีแดง

- [ ] **Step 9: Commit**

```bash
git add "app/(app)/import/suppressed/page.tsx" components/SuppressedList.tsx components/SuppressButton.tsx "app/(app)/candidates/[id]/page.tsx" CLAUDE.md docs/manual-tests/scraper-automation.md
git commit -m "feat(ingest): suppression UI, delete-and-suppress action, and manual test guide"
```

---

## Self-Review

**Spec coverage:**

| ข้อกำหนดใน spec | Task |
|---|---|
| Migration 013 — สามตาราง + สองคอลัมน์ + RLS | A1 |
| `embedHash` พร้อมเหตุผลและ normalize ช่องว่าง | A2 Steps 1–4 |
| `classifyRow` สี่เกณฑ์ | A2 Steps 5–8 |
| ลายเซ็นใหม่ `upsertCandidate(input, createdBy, ingestRunId)` | A3 Step 1 |
| เช็ค suppression ก่อน embed ใน `upsertCandidate` | A3 Step 1 |
| เขียน `embed_hash` และ `ingest_run_id` | A3 Step 1 |
| ผู้เรียกเดิมไม่พัง + นับ suppressed ถูก | A3 Steps 2–3 |
| `fetchLatestCsv` แยกไฟล์พร้อมหมายเหตุว่ายังไม่ยืนยัน | A4 Step 1 |
| สคริปต์: throttle, retry, resume, dry-run, เพดาน | A4 Step 2 |
| ปิด run ที่ค้าง `running` จากรอบก่อน | A4 Step 2 |
| ลบแถวออกจากคิวเมื่อข้อมูลครบในรอบหลัง | A4 Step 2 |
| GitHub Actions + UTC + workflow_dispatch + concurrency | A4 Step 3 |
| API สี่เส้นทางพร้อมข้อความ error ภาษาไทย | A5 |
| ระงับก่อนลบ (กันสถานะที่แย่ที่สุด) | A5 Step 3 |
| `/import` ศูนย์รวม + ประวัติ | A6 Step 4 |
| คิวรอตรวจ + badge + อนุมัติเดี่ยว/ปฏิเสธกลุ่ม | A6 Steps 2–3 |
| รายชื่อระงับ + ถอนออก | A7 Steps 1–2 |
| ปุ่มลบและระงับพร้อมกล่องยืนยันและเหตุผล | A7 Steps 3–4 |
| CLAUDE.md Phase 8 | A7 Step 5 |
| checklist ทดสอบด้วยมือ | A7 Step 6 |
| gate `data_manager` ทุกหน้าและ API | A5, A6, A7 |

**Placeholder scan:** ไม่มี — ทุก step มีโค้ดจริงหรือคำสั่งจริง ส่วน `phantombuster.ts` มีการเดา
รูปร่าง response ซึ่งเขียนกำกับไว้ชัดเจนพร้อมรายการที่ต้องตรวจ ไม่ใช่ "TODO"

**Type consistency:**

- `MissingField` และ `classifyRow` (A2) → ใช้ใน A4 และแสดงผลใน A6 ผ่าน `missing: string[]` — ตรงกัน
- `embedHash(input)` (A2) → ใช้ใน A3 (เขียน) และ A4 (เทียบ) — ตรงกัน
- `upsertCandidate` คืน `{ id, updated, suppressed }` (A3) → A4 เช็ค `r.suppressed` ก่อน `r.updated`,
  A5 เช็ค `result.suppressed` ก่อนใช้ `result.id` — ตรงกัน
- `PendingRow` ประกาศใน `components/PendingReviewTable.tsx` (A6) import โดยหน้า pending — ตรงกัน
- `SuppressedRow` ประกาศใน `components/SuppressedList.tsx` (A7) import โดยหน้า suppressed — ตรงกัน
- คอลัมน์ที่ A4/A5 เขียน ตรงกับ schema ใน A1 ทุกตัว
- คลาส CSS ใหม่ (`badge-warn`, `status-pill*`) เพิ่มใน A6 Step 1 และใช้ใน A6/A7 เท่านั้น

**หมายเหตุสำหรับผู้ implement:** A1 ต้องมาก่อนเสมอและต้องรัน migration บน Supabase ให้เสร็จ
ก่อนทดสอบ A4–A7 · A2 เป็นอิสระ ทำเมื่อไหร่ก็ได้ · A3 ต้องมาก่อน A4 และ A5 · A6 ต้องมาก่อน A7
เพราะ A7 ใช้คลาส CSS ที่ A6 เพิ่ม

**ข้อจำกัดที่ต้องรู้:** `lib/ingest/phantombuster.ts` เดารูปร่าง API จากรูปแบบทั่วไป ต้องยืนยันกับ
เอกสารจริงก่อนรันของจริง — ถ้าไม่ตรง อาการจะเป็น run สถานะ `failed` พร้อมข้อความจาก
`fetchLatestCsv` ซึ่งชี้ไปที่ไฟล์เดียวที่ต้องแก้
