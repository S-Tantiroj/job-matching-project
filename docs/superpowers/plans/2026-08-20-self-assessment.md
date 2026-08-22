# Self-assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้ที่ล็อกอินอยู่อัปโหลด resume เป็น PDF แล้วได้ผลประเมินตัวเอง — จุดแข็ง/จุดอ่อน/สิ่งที่ควรพัฒนา, รายการงานในระบบที่เหมาะเรียงตามลำดับ, และคะแนน 0–100 เทียบกับตำแหน่งที่พิมพ์เอง

**Architecture:** PDF ส่งเข้า Gemini โดยตรงเป็น inline data (ไม่มีไลบรารีอ่าน PDF) ได้โปรไฟล์เชิงโครงสร้าง เก็บในตาราง `self_profiles` ที่ผู้ใช้เป็นเจ้าของและแยกจาก candidate pool โดยสิ้นเชิง จัดอันดับงานด้วย vector ในสเปซ 768 มิติร่วมกับ `jobs` ส่วน LLM เรียกเฉพาะตอนอัปโหลดและตอนขอคะแนนรายตำแหน่ง (มี cache)

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + pgvector), `@google/genai` 1.52.0 (`gemini-flash-latest`, `gemini-embedding-001`), plain CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-08-20-self-assessment-design.md`

## Global Constraints

- ไม่เพิ่ม dependency ใหม่ ใช้ plain CSS และคลาสจาก `app/globals.css`
- ไม่แตะ `lib/ingest/normalize.ts`, `lib/ingest/upsert.ts`, `lib/gemini/analyze.ts`, `lib/search/*`, `lib/jobs/*`
- **ไฟล์ PDF ที่อัปโหลดเป็นภาษาอะไรก็ได้** — ไทย อังกฤษ หรือปนกัน ห้ามเพิ่มการตรวจภาษาตอนอัปโหลด
- โปรไฟล์เชิงโครงสร้างที่เก็บลง DB ต้องเป็น **ภาษาอังกฤษ** (Gemini แปล/ถอดอักษรโรมันให้) เพราะ embedding ต้องอยู่สเปซเดียวกับ `jobs` ที่เป็นอังกฤษ
- `raw_text` เก็บข้อความ **ตามต้นฉบับ** ไม่แปล
- บทวิเคราะห์ เหตุผล และข้อความ UI ทั้งหมดเป็น **ภาษาไทย**
- ข้อมูลที่ผู้ใช้อัปโหลด **ห้ามเข้า `candidates`** และห้ามปรากฏในผลค้นหาของ recruiter
- คะแนนเป็นจำนวนเต็ม 0–100 ทุกที่
- Embedding: `gemini-embedding-001`, 768 มิติ, taskType `RETRIEVAL_DOCUMENT`
- Generation: `gemini-flash-latest`
- **ทุก API route ใช้ service-role client ซึ่ง bypass RLS — `.eq('owner_id', session.userId)` คือกลไกป้องกันตัวจริง ไม่ใช่ชั้นสอง**
- ทุก route ที่รับ `id` จาก URL ต้องตรวจความเป็นเจ้าของก่อน ไม่ใช่เจ้าของตอบ **404** (ไม่ใช่ 403)
- Server component ยังเป็น server, client component ยังเป็น client
- ห้ามแสดง error ดิบจาก Postgres หรือ Gemini ให้ผู้ใช้เห็น
- เทสต์เดิมทั้งหมดต้องยังเขียว
- Gemini free tier — ห้ามเรียก generation ต่อรายการงาน

## File Structure

**สร้างใหม่:**

- `supabase/migrations/011_self_profiles.sql` — drop ตารางกำพร้า + สร้าง `self_profiles`/`resume_assessments` + RLS
- `supabase/migrations/012_match_jobs.sql` — RPC `match_jobs`
- `lib/self/validateUpload.ts` (+ test) — ตรวจชนิด/ขนาดไฟล์ ฟังก์ชันบริสุทธิ์
- `lib/self/assessmentShape.ts` (+ test) — ตรวจ/ทำให้เป็นมาตรฐาน JSON ที่ Gemini คืน
- `lib/self/score.ts` (+ test) — แปลง similarity เป็นคะแนน 0–100
- `lib/gemini/parsePdf.ts` — PDF → โปรไฟล์ + raw_text
- `lib/gemini/assess.ts` — โปรไฟล์ → บทวิเคราะห์ไทย
- `lib/self/matchJobs.ts` — จัดอันดับงานจาก embedding ที่เก็บไว้
- `app/api/self-assessment/route.ts` — POST อัปโหลด
- `app/api/self-assessment/[id]/score/route.ts` — POST คะแนนรายตำแหน่ง
- `app/(app)/self-assessment/page.tsx` — หน้าแสดงผล (server)
- `components/SelfAssessmentUpload.tsx`, `components/RoleScorePanel.tsx` (client)
- `docs/manual-tests/self-assessment.md`

**แก้ไข:** `app/(app)/layout.tsx`, `middleware.ts`, `CLAUDE.md`

---

### Task S1: Migrations — schema และ RPC

**Files:**
- Create: `supabase/migrations/011_self_profiles.sql`, `supabase/migrations/012_match_jobs.sql`

**Interfaces:**
- Produces: ตาราง `self_profiles` (id, owner_id, file_name, raw_text, parsed_data jsonb, assessment jsonb, embedding vector(768), created_at, updated_at) และ `resume_assessments` (id, profile_id, requirement_text, requirement_hash, score, reasoning, created_at) และ RPC `match_jobs(query_embedding vector(768), match_count int) returns table (id uuid, similarity float)`

- [ ] **Step 1: สร้าง migration 011**

สร้าง `supabase/migrations/011_self_profiles.sql`:

```sql
-- v3 Self-assessment: ตารางโปรไฟล์ที่ผู้ใช้อัปโหลดเอง แยกจาก candidate pool
--
-- ไฟล์นี้ DROP ตาราง ซึ่งขัดกติกา "migration ต้อง additive" ของโปรเจกต์อย่างจงใจ
-- เหตุผลที่ปลอดภัยเฉพาะกรณีนี้ (ห้ามใช้เป็นบรรทัดฐานว่า drop ได้ตามใจ):
--   1. ตาราง resumes และ matches ว่างทั้งคู่ (0 แถว ตรวจเมื่อ 2026-08-20)
--   2. ไม่มีโค้ดใดในรีโปอ้างถึง (grep 'resumes' ไม่พบผลลัพธ์ในไฟล์ .ts/.tsx/.sql)
--   3. ไม่ได้ถูกสร้างโดย migration ใดในรีโปนี้ (มาจากยุค import_jobs.py ซึ่งไม่อยู่ในรีโป)
--   4. ไม่แตะตาราง jobs ซึ่งเป็นสิ่งที่กติกาตั้งใจปกป้อง
--   5. ทั้งคู่เปิด public โดยไม่มี RLS (Supabase advisor ระดับ ERROR) การลบจึงปิดช่องโหว่ไปด้วย

drop table if exists public.resumes;
drop table if exists public.matches;

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
      where p.id = profile_id and p.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: สร้าง migration 012**

สร้าง `supabase/migrations/012_match_jobs.sql`:

```sql
-- กระจกเงาของ match_candidates แต่ยิงไปตาราง jobs
-- ใช้จัดอันดับงานที่เหมาะกับโปรไฟล์ของผู้ใช้ ไม่มีต้นทุน LLM
-- Additive: เพิ่มฟังก์ชันใหม่ ไม่แตะ jobs หรือฟังก์ชันเดิม
create or replace function match_jobs(query_embedding vector(768), match_count int)
returns table (id uuid, similarity float)
language sql stable as $$
  select j.id, 1 - (j.embedding <=> query_embedding) as similarity
  from jobs j
  where j.embedding is not null
  order by j.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 3: รัน migration บน Supabase**

เปิด Supabase SQL editor รัน `011_self_profiles.sql` แล้วตามด้วย `012_match_jobs.sql`

ตรวจว่าสำเร็จ:

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in ('self_profiles','resume_assessments','resumes','matches');
```
Expected: ได้ 2 แถว — `self_profiles` และ `resume_assessments` เท่านั้น (`resumes`/`matches` ต้องหายไป)

```sql
select * from match_jobs((select embedding from jobs where embedding is not null limit 1), 3);
```
Expected: คืนสูงสุด 3 แถว มีคอลัมน์ `id` กับ `similarity` โดยไม่มี error

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_self_profiles.sql supabase/migrations/012_match_jobs.sql
git commit -m "feat(self): migrations for self_profiles, resume_assessments, and match_jobs RPC"
```

---

### Task S2: ฟังก์ชันบริสุทธิ์ + เทสต์

**Files:**
- Create: `lib/self/validateUpload.ts`, `lib/self/validateUpload.test.ts`, `lib/self/assessmentShape.ts`, `lib/self/assessmentShape.test.ts`, `lib/self/score.ts`, `lib/self/score.test.ts`

**Interfaces:**
- Produces:
  - `MAX_UPLOAD_BYTES: number` (= 4194304)
  - `validateUpload(input: { type?: string; size?: number } | null): string | null` — คืน `null` เมื่อผ่าน หรือข้อความไทยเมื่อไม่ผ่าน
  - `type Assessment = { strengths: string[]; weaknesses: string[]; development: string[]; summary: string }`
  - `normalizeAssessment(raw: unknown): Assessment | null`
  - `similarityToScore(similarity: number): number`
- Task S3, S4, S5, S6 ใช้ทั้งหมดนี้

- [ ] **Step 1: เขียนเทสต์ validateUpload ที่ต้องแดง**

สร้าง `lib/self/validateUpload.test.ts`:

```ts
import { validateUpload, MAX_UPLOAD_BYTES } from './validateUpload'

test('a valid PDF passes', () => {
  expect(validateUpload({ type: 'application/pdf', size: 1000 })).toBeNull()
})

test('missing input is rejected', () => {
  expect(validateUpload(null)).toBe('กรุณาเลือกไฟล์ PDF')
})

test('a non-PDF type is rejected', () => {
  expect(validateUpload({ type: 'image/png', size: 1000 })).toBe('รองรับเฉพาะไฟล์ PDF เท่านั้น')
  expect(validateUpload({ type: 'text/csv', size: 1000 })).toBe('รองรับเฉพาะไฟล์ PDF เท่านั้น')
  expect(validateUpload({ size: 1000 })).toBe('รองรับเฉพาะไฟล์ PDF เท่านั้น')
})

test('an empty file is rejected', () => {
  expect(validateUpload({ type: 'application/pdf', size: 0 })).toBe('ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่')
  expect(validateUpload({ type: 'application/pdf' })).toBe('ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่')
})

test('exactly the size limit passes', () => {
  expect(validateUpload({ type: 'application/pdf', size: MAX_UPLOAD_BYTES })).toBeNull()
})

test('one byte over the limit is rejected', () => {
  expect(validateUpload({ type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })).toBe(
    'ไฟล์ใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 4MB'
  )
})

test('MAX_UPLOAD_BYTES is 4MB', () => {
  expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024)
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/self/validateUpload.test.ts`
Expected: FAIL — ไม่พบโมดูล `./validateUpload`

- [ ] **Step 3: เขียน validateUpload**

สร้าง `lib/self/validateUpload.ts`:

```ts
// ตรวจไฟล์ที่อัปโหลดก่อนส่งเข้า Gemini ฟังก์ชันบริสุทธิ์
//
// รับค่าพื้นฐาน { type, size } แทน object File เพื่อให้เขียนเทสต์ได้โดยไม่ต้องสร้าง
// File จำลองใน Node — route เป็นคนดึงสองฟิลด์นี้จาก File มาส่งให้
//
// 4MB เพราะ Vercel จำกัด request body ที่ 4.5MB การกันไว้ที่ 4MB ทำให้ผู้ใช้เห็น
// ข้อความที่เข้าใจได้ แทนที่จะโดน platform ตัดทิ้งแบบไม่มีสัญญาณ

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export function validateUpload(
  input: { type?: string; size?: number } | null
): string | null {
  if (!input) return 'กรุณาเลือกไฟล์ PDF'
  if (input.type !== 'application/pdf') return 'รองรับเฉพาะไฟล์ PDF เท่านั้น'
  if (typeof input.size !== 'number' || input.size <= 0) return 'ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่'
  if (input.size > MAX_UPLOAD_BYTES) return 'ไฟล์ใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 4MB'
  return null
}
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run lib/self/validateUpload.test.ts`
Expected: PASS ทั้ง 7 เทสต์

- [ ] **Step 5: เขียนเทสต์ assessmentShape ที่ต้องแดง**

สร้าง `lib/self/assessmentShape.test.ts`:

```ts
import { normalizeAssessment } from './assessmentShape'

test('a complete assessment passes through', () => {
  expect(
    normalizeAssessment({
      strengths: ['มีประสบการณ์ Python'],
      weaknesses: ['ยังไม่มีประสบการณ์ทีมใหญ่'],
      development: ['เรียน SQL เพิ่ม'],
      summary: 'โดยรวมเหมาะกับสายข้อมูล',
    })
  ).toEqual({
    strengths: ['มีประสบการณ์ Python'],
    weaknesses: ['ยังไม่มีประสบการณ์ทีมใหญ่'],
    development: ['เรียน SQL เพิ่ม'],
    summary: 'โดยรวมเหมาะกับสายข้อมูล',
  })
})

test('missing arrays become empty arrays as long as something remains', () => {
  expect(normalizeAssessment({ summary: 'ภาพรวม' })).toEqual({
    strengths: [],
    weaknesses: [],
    development: [],
    summary: 'ภาพรวม',
  })
})

test('blank and non-string array entries are dropped', () => {
  const r = normalizeAssessment({ strengths: ['ดี', '', '   ', null, 5], summary: 'x' })
  expect(r?.strengths).toEqual(['ดี', '5'])
})

test('a non-array in an array field becomes an empty array', () => {
  const r = normalizeAssessment({ strengths: 'ไม่ใช่ array', summary: 'x' })
  expect(r?.strengths).toEqual([])
})

test('completely empty content returns null', () => {
  // Gemini parse ผ่านแต่ไม่ได้เนื้อหาอะไรเลย ต้องถือว่าใช้ไม่ได้
  expect(normalizeAssessment({})).toBeNull()
  expect(normalizeAssessment({ strengths: [], weaknesses: [], development: [], summary: '   ' })).toBeNull()
})

test('non-object input returns null', () => {
  expect(normalizeAssessment(null)).toBeNull()
  expect(normalizeAssessment(undefined)).toBeNull()
  expect(normalizeAssessment('a string')).toBeNull()
  expect(normalizeAssessment(42)).toBeNull()
})
```

- [ ] **Step 6: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/self/assessmentShape.test.ts`
Expected: FAIL — ไม่พบโมดูล `./assessmentShape`

- [ ] **Step 7: เขียน assessmentShape**

สร้าง `lib/self/assessmentShape.ts`:

```ts
// รูปร่างของบทวิเคราะห์ที่ Gemini คืนมา ทุกข้อความเป็นภาษาไทย
export type Assessment = {
  strengths: string[]
  weaknesses: string[]
  development: string[]
  summary: string
}

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []

// ทำให้เป็นมาตรฐานและตรวจว่าใช้ได้จริง คืน null เมื่อไม่มีเนื้อหาเลย
//
// จำเป็นเพราะ JSON.parse สำเร็จไม่ได้แปลว่าได้ของที่ใช้ได้ — โมเดลอาจคืน {} หรือ
// คืนฟิลด์ที่เป็นชนิดผิด ถ้าปล่อยผ่านจะได้แถวในฐานข้อมูลที่หน้าเว็บแสดงเป็นช่องว่าง
// โดยไม่มีใครรู้ว่าพังตรงไหน
export function normalizeAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const a: Assessment = {
    strengths: toStringArray(r.strengths),
    weaknesses: toStringArray(r.weaknesses),
    development: toStringArray(r.development),
    summary: String(r.summary ?? '').trim(),
  }
  if (!a.strengths.length && !a.weaknesses.length && !a.development.length && !a.summary) {
    return null
  }
  return a
}
```

- [ ] **Step 8: รันให้เขียว**

Run: `npx vitest run lib/self/assessmentShape.test.ts`
Expected: PASS ทั้ง 6 เทสต์

- [ ] **Step 9: เขียนเทสต์ score ที่ต้องแดง**

สร้าง `lib/self/score.test.ts`:

```ts
import { similarityToScore } from './score'

test('similarity maps to a 0-100 integer', () => {
  expect(similarityToScore(0.87)).toBe(87)
  expect(similarityToScore(0.5)).toBe(50)
  expect(similarityToScore(0)).toBe(0)
  expect(similarityToScore(1)).toBe(100)
})

test('values outside 0-1 are clamped', () => {
  expect(similarityToScore(-0.3)).toBe(0)
  expect(similarityToScore(1.4)).toBe(100)
})

test('the result is always a rounded integer', () => {
  expect(similarityToScore(0.876)).toBe(88)
  expect(similarityToScore(0.874)).toBe(87)
})

test('non-finite input becomes 0', () => {
  // pgvector อาจคืนค่ามาเป็นสตริง ถ้าแปลงพลาดจะได้ NaN
  expect(similarityToScore(NaN)).toBe(0)
  expect(similarityToScore(Infinity)).toBe(0)
})
```

- [ ] **Step 10: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/self/score.test.ts`
Expected: FAIL — ไม่พบโมดูล `./score`

- [ ] **Step 11: เขียน score**

สร้าง `lib/self/score.ts`:

```ts
// แปลงค่า cosine similarity (0–1) เป็นคะแนน 0–100
//
// นี่เป็นฟังก์ชันเล็กตัวใหม่ ไม่ใช่การ refactor ของเดิม — ห้ามไปแก้ตรรกะคิดคะแนน
// ที่ฝังอยู่ใน lib/jobs/match.ts หรือ lib/search/query.ts เพราะกติกาห้ามแตะ
// search/matching ที่มีอยู่ ยอมให้สูตรเดียวกันอยู่สองที่ในเฟสนี้
export function similarityToScore(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0
  return Math.max(0, Math.min(100, Math.round(similarity * 100)))
}
```

- [ ] **Step 12: รันให้เขียว**

Run: `npx vitest run lib/self/score.test.ts`
Expected: PASS ทั้ง 4 เทสต์

- [ ] **Step 13: Commit**

```bash
git add lib/self/validateUpload.ts lib/self/validateUpload.test.ts lib/self/assessmentShape.ts lib/self/assessmentShape.test.ts lib/self/score.ts lib/self/score.test.ts
git commit -m "feat(self): pure helpers for upload validation, assessment shape, and scoring"
```

---

### Task S3: Gemini — อ่าน PDF และสร้างบทวิเคราะห์

**Files:**
- Create: `lib/gemini/parsePdf.ts`, `lib/gemini/assess.ts`

**Interfaces:**
- Consumes: `getGemini()` จาก `lib/gemini/client.ts`, `CandidateInput` จาก `lib/ingest/normalize.ts`, `Assessment` และ `normalizeAssessment` จาก `lib/self/assessmentShape.ts` (Task S2)
- Produces:
  - `parsePdfProfile(pdfBase64: string): Promise<{ profile: CandidateInput; raw_text: string }>`
  - `assessProfile(profile: CandidateInput): Promise<Assessment>`
  - ทั้งคู่ throw `Error` เมื่อ Gemini คืนของที่ใช้ไม่ได้ — Task S4 เป็นคนแปลงเป็น HTTP 502

- [ ] **Step 1: เขียน parsePdf**

สร้าง `lib/gemini/parsePdf.ts`:

```ts
import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

export type ParsedPdf = { profile: CandidateInput; raw_text: string }

// อ่าน resume PDF ด้วย Gemini โดยตรง (ไม่ต้องมีไลบรารีอ่าน PDF) รองรับไฟล์ที่สแกน
// มาเป็นรูปด้วย เพราะโมเดลมองเห็นหน้ากระดาษจริง
//
// ไฟล์ต้นทางเป็นภาษาอะไรก็ได้ แต่ค่าในโปรไฟล์ต้องออกมาเป็นภาษาอังกฤษ เพราะ embedding
// ต้องอยู่สเปซเดียวกับตาราง jobs ที่เก็บเป็นอังกฤษ ส่วน raw_text เก็บตามต้นฉบับ
export async function parsePdfProfile(pdfBase64: string): Promise<ParsedPdf> {
  const prompt = `Read this resume PDF and return JSON only, matching this schema:
{"profile":{"full_name":"","headline":"","location":"","summary":"","skills":[],"education":[{"institution":"","country":"","degree":"","field_of_study":"","start_year":0,"end_year":0}],"experience":[{"company":"","title":"","start_date":"","end_date":"","description":""}]},"raw_text":""}

Rules:
- The source document may be in Thai, English, or a mix. Handle any language.
- Output ALL values inside "profile" in ENGLISH. Translate or romanize Thai (e.g. a Thai name becomes "Somchai Jaidee", a Thai university becomes its English name).
- "raw_text" must be the text of the document AS IT APPEARS, in its original language. Do NOT translate raw_text.
- Dates in "experience" must be strict ISO "YYYY-MM-DD". Use null for end_date of a current role.
- Omit a field or use null when the resume does not state it. Never invent facts.`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [
          // เอกสาร Gemini แนะนำให้วาง part ของไฟล์ก่อนข้อความ prompt
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: { responseMimeType: 'application/json' },
  })

  const text = (res.text ?? '').replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let parsed: any
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text)
  } catch {
    throw new Error('gemini returned unparseable JSON for the PDF')
  }

  const profile = parsed?.profile
  if (!profile || typeof profile !== 'object' || !String(profile.full_name ?? '').trim()) {
    throw new Error('gemini could not extract a profile from the PDF')
  }

  return {
    profile: { ...profile, source: 'upload' } as CandidateInput,
    raw_text: String(parsed.raw_text ?? ''),
  }
}
```

- [ ] **Step 2: เขียน assess**

สร้าง `lib/gemini/assess.ts`:

```ts
import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'
import { normalizeAssessment, type Assessment } from '@/lib/self/assessmentShape'

// วิเคราะห์โปรไฟล์เป็นจุดแข็ง จุดอ่อน และสิ่งที่ควรพัฒนา ผลลัพธ์เป็นภาษาไทย
// ตามกติกาว่า reasoning/advice ที่ผู้ใช้อ่านเป็นไทย ขณะที่ข้อมูลใน DB เป็นอังกฤษ
//
// แยกจาก parsePdfProfile เพราะคนละธรรมชาติ — อันนั้นสกัดข้อเท็จจริง อันนี้ตัดสิน
// แยกแล้วปรับ prompt ทีละตัวได้ และประเมินใหม่ได้จาก parsed_data ที่เก็บไว้
// โดยไม่ต้องให้ผู้ใช้อัปโหลด PDF ซ้ำ
export async function assessProfile(profile: CandidateInput): Promise<Assessment> {
  const prompt = `วิเคราะห์โปรไฟล์ผู้สมัครต่อไปนี้ ตอบเป็น JSON เท่านั้น ทุกข้อความเป็นภาษาไทย

{"strengths":["จุดแข็ง"],"weaknesses":["จุดที่ยังขาด"],"development":["สิ่งที่ควรพัฒนาต่อ"],"summary":"ภาพรวมสั้นๆ 1-2 ประโยค"}

เงื่อนไข:
- strengths, weaknesses, development อย่างละ 2-4 ข้อ สั้นและเจาะจง
- อ้างอิงจากข้อมูลในโปรไฟล์เท่านั้น ห้ามสมมติสิ่งที่ไม่ปรากฏ
- ใช้น้ำเสียงให้กำลังใจและสร้างสรรค์ ไม่ตัดสินคุณค่าของบุคคล

โปรไฟล์: ${JSON.stringify(profile)}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  })

  const text = (res.text ?? '').replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let parsed: unknown
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text)
  } catch {
    throw new Error('gemini returned unparseable JSON for the assessment')
  }

  const assessment = normalizeAssessment(parsed)
  if (!assessment) throw new Error('gemini returned an empty assessment')
  return assessment
}
```

- [ ] **Step 3: ตรวจ build**

Run: `npm run build`
Expected: คอมไพล์ผ่าน ไม่มี type error

- [ ] **Step 4: Commit**

```bash
git add lib/gemini/parsePdf.ts lib/gemini/assess.ts
git commit -m "feat(self): read resume PDFs and generate Thai assessments with Gemini"
```

---

### Task S4: API อัปโหลด

**Files:**
- Create: `app/api/self-assessment/route.ts`

**Interfaces:**
- Consumes: `getSession()` จาก `lib/auth/session.ts`, `getServerClient()` จาก `lib/supabase/server.ts`, `validateUpload` (S2), `parsePdfProfile`/`assessProfile` (S3), `buildEmbedText` จาก `lib/ingest/normalize.ts`, `embedText` จาก `lib/gemini/embed.ts`
- Produces: `POST /api/self-assessment` รับ FormData ฟิลด์ `file` คืน `{ id }` หรือ `{ error }`

- [ ] **Step 1: เขียน route**

สร้าง `app/api/self-assessment/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { validateUpload } from '@/lib/self/validateUpload'
import { parsePdfProfile } from '@/lib/gemini/parsePdf'
import { assessProfile } from '@/lib/gemini/assess'
import { buildEmbedText } from '@/lib/ingest/normalize'
import { embedText } from '@/lib/gemini/embed'

// POST /api/self-assessment  — FormData { file: <PDF> }
// ทุก role ที่ล็อกอินใช้ได้ ไม่ต้อง gate ด้วย hasRole เพราะเป็นฟีเจอร์สำหรับทุกคน
//
// รับเป็น FormData ไม่ใช่ base64 ใน JSON แบบ route อื่นในแอป เพราะ base64 ทำให้ขนาด
// โตขึ้น ~33% และ Vercel จำกัด request body ที่ 4.5MB — PDF 3.5MB ที่ควรส่งได้
// จะกลายเป็น 4.7MB แล้วพังโดยไม่มีสัญญาณที่เดาถูก
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    file = f instanceof File ? f : null
  } catch {
    return NextResponse.json({ error: 'กรุณาเลือกไฟล์ PDF' }, { status: 400 })
  }

  const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const pdfBase64 = Buffer.from(await file!.arrayBuffer()).toString('base64')

  // ถ้าขั้นตอนใดล้ม ไม่เขียนอะไรลงฐานข้อมูลเลย — การเก็บ profile ที่ไม่มี embedding
  // จะกลายเป็นข้อมูลเสียแบบเงียบที่ไม่โผล่ในการจัดอันดับงานโดยไม่มีใครรู้สาเหตุ
  let profile, raw_text, assessment, embedding
  try {
    const parsed = await parsePdfProfile(pdfBase64)
    profile = parsed.profile
    raw_text = parsed.raw_text
    assessment = await assessProfile(profile)
    embedding = await embedText(buildEmbedText(profile), 'RETRIEVAL_DOCUMENT')
  } catch {
    return NextResponse.json(
      { error: 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจว่าไฟล์ไม่เสียหายแล้วลองใหม่' },
      { status: 502 }
    )
  }

  const { data, error } = await getServerClient()
    .from('self_profiles')
    .insert({
      owner_id: session.userId,
      file_name: file!.name,
      raw_text,
      parsed_data: profile,
      assessment,
      embedding,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
  return NextResponse.json({ id: (data as any).id })
}
```

- [ ] **Step 2: ตรวจ build**

Run: `npm run build`
Expected: คอมไพล์ผ่าน

- [ ] **Step 3: Commit**

```bash
git add app/api/self-assessment/route.ts
git commit -m "feat(self): upload API that parses a resume PDF and stores the profile"
```

---

### Task S5: จัดอันดับงาน + คะแนนรายตำแหน่ง

**Files:**
- Create: `lib/self/matchJobs.ts`, `app/api/self-assessment/[id]/score/route.ts`

**Interfaces:**
- Consumes: `getServerClient()`, `similarityToScore` (S2), `requirementHash` จาก `lib/gemini/cache.ts`, `analyzeCandidate` จาก `lib/gemini/analyze.ts`, RPC `match_jobs` (S1)
- Produces:
  - `type JobFit = { id: string; title: string; company: string | null; location: string | null; score: number }`
  - `matchJobsForProfile(profileId: string, ownerId: string, matchCount?: number): Promise<JobFit[]>`
  - `POST /api/self-assessment/[id]/score` รับ `{ requirement }` คืน `{ score, reasoning, cached }`

- [ ] **Step 1: เขียน matchJobs**

สร้าง `lib/self/matchJobs.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { similarityToScore } from './score'

export type JobFit = {
  id: string
  title: string
  company: string | null
  location: string | null
  score: number // 0–100 vector similarity ในสเปซ 768 มิติร่วมกับ candidates
}

// จัดอันดับงานที่เหมาะกับโปรไฟล์ ใช้ embedding ที่เก็บไว้แล้ว ไม่ embed ใหม่ ไม่เรียก LLM
// เป็นภาพสะท้อนของ matchCandidatesForJob ใน lib/jobs/match.ts แต่กลับทิศ
//
// ownerId เป็นพารามิเตอร์บังคับ ไม่ใช่ทางเลือก — service-role client bypass RLS
// การกรอง owner_id ที่นี่คือกลไกป้องกันตัวจริง
export async function matchJobsForProfile(
  profileId: string,
  ownerId: string,
  matchCount = 20
): Promise<JobFit[]> {
  const db = getServerClient()

  const { data: profile } = await db
    .from('self_profiles')
    .select('embedding')
    .eq('id', profileId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  const rawEmbedding = (profile as any)?.embedding
  if (!rawEmbedding) return []

  // pgvector อาจคืนค่ามาเป็นสตริง JSON แต่ RPC ต้องการ array
  const embedding = typeof rawEmbedding === 'string' ? JSON.parse(rawEmbedding) : rawEmbedding

  const { data: matches, error } = await db.rpc('match_jobs', {
    query_embedding: embedding,
    match_count: matchCount,
  })
  if (error) {
    console.error('match_jobs RPC failed:', error)
    return []
  }

  const sims = new Map<string, number>(
    (matches ?? []).map((m: any) => [m.id, Number(m.similarity)])
  )
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows } = await db
    .from('jobs')
    .select('id, title, company, location')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  return (ids.map((id) => byId.get(id)).filter(Boolean) as any[])
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company ?? null,
      location: j.location ?? null,
      score: similarityToScore(sims.get(j.id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 2: เขียน score route**

สร้าง `app/api/self-assessment/[id]/score/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { requirementHash } from '@/lib/gemini/cache'
import { analyzeCandidate } from '@/lib/gemini/analyze'

// POST /api/self-assessment/[id]/score  body: { requirement: string }
// ให้คะแนนโปรไฟล์เทียบกับตำแหน่งที่ผู้ใช้พิมพ์ พร้อม cache ตาม requirement_hash
//
// ใช้ analyzeCandidate() ที่มีอยู่ซ้ำ ไม่เขียนฟังก์ชันใหม่ — มันรับ CandidateInput
// กับ requirement แล้วคืนคะแนน 0–100 พร้อมเหตุผลไทย ซึ่งตรงกับที่ต้องการพอดี
// และ parsed_data ที่เก็บไว้ก็เป็นโครงเดียวกัน
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  const { id } = await params

  let requirement = ''
  try {
    requirement = String((await req.json())?.requirement ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  if (!requirement) {
    return NextResponse.json({ error: 'กรุณากรอกตำแหน่งที่สนใจ' }, { status: 400 })
  }

  const db = getServerClient()

  // ตรวจความเป็นเจ้าของก่อนทำอะไรทั้งสิ้น ตอบ 404 ไม่ใช่ 403 เพื่อไม่เปิดเผยว่า id นี้มีอยู่จริง
  const { data: profile } = await db
    .from('self_profiles')
    .select('id, parsed_data')
    .eq('id', id)
    .eq('owner_id', session.userId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'ไม่พบข้อมูลนี้' }, { status: 404 })

  const hash = requirementHash(requirement)

  const { data: cached } = await db
    .from('resume_assessments')
    .select('score, reasoning')
    .eq('profile_id', id)
    .eq('requirement_hash', hash)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      score: (cached as any).score,
      reasoning: (cached as any).reasoning ?? '',
      cached: true,
    })
  }

  let result
  try {
    result = await analyzeCandidate((profile as any).parsed_data, requirement)
  } catch {
    return NextResponse.json(
      { error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502 }
    )
  }

  await db.from('resume_assessments').insert({
    profile_id: id,
    requirement_text: requirement,
    requirement_hash: hash,
    score: result.score,
    reasoning: result.reasoning,
  })

  return NextResponse.json({ score: result.score, reasoning: result.reasoning, cached: false })
}
```

- [ ] **Step 3: ตรวจ build**

Run: `npm run build`
Expected: คอมไพล์ผ่าน

- [ ] **Step 4: Commit**

```bash
git add lib/self/matchJobs.ts "app/api/self-assessment/[id]/score/route.ts"
git commit -m "feat(self): rank jobs by vector and score against a typed role with caching"
```

---

### Task S6: UI, nav และ middleware

**Files:**
- Create: `app/(app)/self-assessment/page.tsx`, `components/SelfAssessmentUpload.tsx`, `components/RoleScorePanel.tsx`, `docs/manual-tests/self-assessment.md`
- Modify: `app/(app)/layout.tsx`, `middleware.ts`, `CLAUDE.md`

**Interfaces:**
- Consumes: `matchJobsForProfile`/`JobFit` (S5), `Assessment` (S2), `getSession`, `getServerClient`, `ScoreBadge` จาก `components/ScoreBadge.tsx`

- [ ] **Step 1: เขียน component อัปโหลด**

สร้าง `components/SelfAssessmentUpload.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateUpload } from '@/lib/self/validateUpload'

export default function SelfAssessmentUpload({ label }: { label: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (busy) return
    setError('')
    const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
    if (invalid) return setError(invalid)

    setBusy(true)
    const form = new FormData()
    form.append('file', file!)
    const res = await fetch('/api/self-assessment', { method: 'POST', body: form })
    setBusy(false)

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    setFile(null)
    router.refresh()
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setError('')
            setFile(e.target.files?.[0] ?? null)
          }}
        />
        <button className="btn btn-primary" onClick={submit} disabled={busy || !file}>
          {busy ? 'กำลังวิเคราะห์…' : label}
        </button>
      </div>
      {busy && (
        <p className="faint" style={{ fontSize: 13 }}>
          กำลังอ่านไฟล์และวิเคราะห์ด้วย AI อาจใช้เวลา 10–20 วินาที กรุณาอย่าปิดหน้านี้
        </p>
      )}
      {error && <p style={{ color: 'var(--bad)', marginBottom: 0 }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: เขียน component คะแนนรายตำแหน่ง**

สร้าง `components/RoleScorePanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import ScoreBadge from './ScoreBadge'

type Result = { score: number; reasoning: string; cached?: boolean }

export default function RoleScorePanel({ profileId }: { profileId: string }) {
  const [requirement, setRequirement] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (busy || !requirement.trim()) return
    setBusy(true)
    setError('')
    setResult(null)
    const res = await fetch(`/api/self-assessment/${profileId}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement }),
    })
    setBusy(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    setResult(json)
  }

  return (
    <div className="card">
      <h3>ประเมินกับตำแหน่งที่สนใจ</h3>
      <div className="row">
        <input
          className="input"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="เช่น Data Scientist สาย Python"
        />
        <button className="btn btn-primary" onClick={run} disabled={busy || !requirement.trim()}>
          {busy ? 'กำลังประเมิน…' : 'ประเมิน'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {result && (
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
          <ScoreBadge score={result.score} />
          <div>
            {result.cached && (
              <span className="faint" style={{ fontSize: 12 }}>(จาก cache)</span>
            )}
            <p style={{ margin: 0 }}>{result.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: เขียนหน้า self-assessment**

สร้าง `app/(app)/self-assessment/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { matchJobsForProfile } from '@/lib/self/matchJobs'
import type { Assessment } from '@/lib/self/assessmentShape'
import ScoreBadge from '@/components/ScoreBadge'
import SelfAssessmentUpload from '@/components/SelfAssessmentUpload'
import RoleScorePanel from '@/components/RoleScorePanel'

export const dynamic = 'force-dynamic'

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="faint" style={{ fontSize: 12, marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  )
}

export default async function SelfAssessmentPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const db = getServerClient()
  const { data: profile } = await db
    .from('self_profiles')
    .select('id, file_name, parsed_data, assessment, created_at')
    .eq('owner_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!profile) {
    return (
      <main>
        <h1>ประเมินตัวเอง</h1>
        <p className="muted">
          อัปโหลด resume เป็นไฟล์ PDF แล้ว AI จะช่วยวิเคราะห์จุดแข็ง จุดอ่อน
          สิ่งที่ควรพัฒนา และงานในระบบที่เหมาะกับคุณ (ไฟล์เป็นภาษาไทยหรืออังกฤษก็ได้)
        </p>
        <p className="faint" style={{ fontSize: 13 }}>
          ข้อมูลนี้เป็นของคุณคนเดียว ผู้ดูแลระบบและผู้ใช้คนอื่นมองไม่เห็น
          และจะไม่ถูกนำไปรวมกับฐานข้อมูลผู้สมัคร
        </p>
        <SelfAssessmentUpload label="อัปโหลดและวิเคราะห์" />
      </main>
    )
  }

  const p = profile as any
  const parsed = p.parsed_data ?? {}
  const assessment: Assessment | null = p.assessment ?? null
  const skills: string[] = Array.isArray(parsed.skills) ? parsed.skills : []
  const jobs = await matchJobsForProfile(p.id, session.userId)

  return (
    <main>
      <h1>ประเมินตัวเอง</h1>

      <div className="card">
        <h2>{parsed.full_name ?? 'โปรไฟล์ของคุณ'}</h2>
        {parsed.headline && <p className="muted" style={{ margin: '2px 0' }}>{parsed.headline}</p>}
        {parsed.location && (
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>{parsed.location}</p>
        )}
        {parsed.summary && <p style={{ marginTop: 10 }}>{parsed.summary}</p>}
        {skills.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            {skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        )}
        {p.file_name && (
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            จากไฟล์: {p.file_name}
          </p>
        )}
      </div>

      {assessment && (
        <>
          <div className="section-header"><h2>บทวิเคราะห์</h2></div>
          <div className="card">
            {assessment.summary && <p style={{ marginTop: 0 }}>{assessment.summary}</p>}
            <Bullets title="จุดแข็ง" items={assessment.strengths} />
            <Bullets title="จุดที่ยังขาด" items={assessment.weaknesses} />
            <Bullets title="สิ่งที่ควรพัฒนา" items={assessment.development} />
          </div>
        </>
      )}

      <div className="section-header"><h2>งานที่เหมาะกับคุณ</h2></div>
      {jobs.length === 0 ? (
        <p className="faint">ยังไม่มีงานในระบบที่เข้าเกณฑ์</p>
      ) : (
        <div className="stack">
          {jobs.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="result-row" style={{ color: 'inherit' }}>
              <ScoreBadge score={j.score} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{j.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {[j.company, j.location].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="faint">›</span>
            </Link>
          ))}
        </div>
      )}

      <div className="section-header"><h2>ประเมินเพิ่มเติม</h2></div>
      <RoleScorePanel profileId={p.id} />

      <div className="section-header"><h2>อัปโหลดใหม่</h2></div>
      <SelfAssessmentUpload label="อัปโหลดไฟล์ใหม่" />
    </main>
  )
}
```

- [ ] **Step 4: เพิ่มลิงก์ใน nav**

ใน `app/(app)/layout.tsx` แทรกบรรทัดนี้ต่อจาก `<Link href="/shortlists" className="nav-link">Shortlist</Link>`:

```tsx
        <Link href="/self-assessment" className="nav-link">ประเมินตัวเอง</Link>
```

ไม่ต้องห่อด้วย `isDataManager` หรือ `isAdmin` — ทุกคนที่ล็อกอินเห็นได้

- [ ] **Step 5: เพิ่ม matcher ใน middleware**

ใน `middleware.ts` เพิ่มบรรทัดนี้เข้าไปใน array `matcher` ของ `config` ต่อจาก `'/settings/:path*',`:

```ts
    '/self-assessment/:path*',
```

- [ ] **Step 6: อัปเดต CLAUDE.md**

ใน `CLAUDE.md` หัวข้อ "Not done / deliberately deferred" ให้**ลบ** bullet นี้ทั้งข้อ เพราะสองตารางถูก drop ไปแล้วใน migration 011:

```
- Tables `public.resumes` and `public.matches` have RLS DISABLED and are exposed
  through PostgREST (Supabase advisor, ERROR level). Not created by any migration
  in this repo.
```

- [ ] **Step 7: เขียน checklist ทดสอบด้วยมือ**

สร้าง `docs/manual-tests/self-assessment.md`:

```markdown
# คู่มือทดสอบด้วยมือ — ประเมินตัวเองจาก resume PDF

ส่วนที่เป็น logic ล้วนมี unit test คลุมแล้ว (`lib/self/*.test.ts`)
เอกสารนี้คือส่วนที่ต้องมี PDF จริงกับ Gemini จริง

## A. เส้นทางปกติ

1. เข้า `/self-assessment` ครั้งแรก → เห็นสถานะว่างพร้อมคำอธิบายและปุ่มอัปโหลด
2. อัปโหลด resume PDF **ภาษาอังกฤษ** → ระหว่างรอเห็นข้อความ "กำลังวิเคราะห์…"
   และคำเตือนว่าอาจใช้เวลา 10–20 วินาที
3. เสร็จแล้วเห็นครบสี่ส่วน: โปรไฟล์ · บทวิเคราะห์ · งานที่เหมาะ · ช่องประเมินเพิ่มเติม

## B. PDF ภาษาไทย (สำคัญที่สุด)

อัปโหลด resume **ภาษาไทย**

**ผลที่ต้องได้:** อัปโหลดผ่านปกติ ไม่มี error เรื่องภาษา และ

- ชื่อกับข้อมูลในส่วนโปรไฟล์แสดงเป็น **อังกฤษ** (ชื่อไทยถอดเป็นอักษรโรมัน)
- บทวิเคราะห์ยังเป็น **ไทย**

ตรวจใน Supabase ว่า `parsed_data` เป็นอังกฤษ แต่ `raw_text` ยังเป็นไทยตามต้นฉบับ:

```sql
select parsed_data->>'full_name', left(raw_text, 80) from self_profiles
order by created_at desc limit 1;
```

กลุ่มผู้ใช้เป้าหมายของแอปคือคนไทย resume ภาษาไทยจึงเป็นกรณีปกติ ไม่ใช่กรณีขอบ

## C. PDF ที่สแกนมาเป็นรูป

อัปโหลด PDF ที่เป็นภาพสแกน (ไม่มี text layer)

**ผลที่ต้องได้:** ยังอ่านได้ เพราะ Gemini มองเห็นหน้ากระดาษจริง ไม่ได้อ่านแค่ text layer

## D. กรณีผิดพลาด

| ทำอะไร | ผลที่ต้องได้ |
|---|---|
| เลือกไฟล์ .png หรือ .csv | "รองรับเฉพาะไฟล์ PDF เท่านั้น" (ไม่ยิง API เลย) |
| เลือก PDF ที่ใหญ่กว่า 4MB | "ไฟล์ใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 4MB" |
| อัปโหลด PDF ว่างหรือไฟล์เสีย | "อ่านไฟล์ไม่สำเร็จ…" และ **ต้องไม่มีแถวใหม่ใน `self_profiles`** |

ตรวจข้อสุดท้ายด้วย: `select count(*) from self_profiles;` ก่อนและหลัง ต้องเท่ากัน

## E. ความเป็นส่วนตัว (ต้องผ่าน)

1. ล็อกอินด้วยบัญชี A อัปโหลด resume แล้วจด `id` ของ profile
   (`select id from self_profiles order by created_at desc limit 1;`)
2. ล็อกอินด้วยบัญชี B แล้วยิง:

```
POST /api/self-assessment/<id-ของ-A>/score   body {"requirement":"test"}
```

**ผลที่ต้องได้: 404** พร้อมข้อความ "ไม่พบข้อมูลนี้" — ไม่ใช่ 403 และต้องไม่คืนข้อมูลใดๆ ของ A

3. ตรวจว่าข้อมูลไม่รั่วเข้า candidate pool — ค้นชื่อของ A ที่หน้า `/search`
   และเปิด `/candidates` ต้องไม่พบโปรไฟล์ที่อัปโหลด

## F. Cache

พิมพ์ตำแหน่งเดียวกันซ้ำสองครั้งในช่อง "ประเมินกับตำแหน่งที่สนใจ"

**ผลที่ต้องได้:** ครั้งที่สองขึ้นป้าย "(จาก cache)" และตอบเร็วกว่าชัดเจน

## G. อัปโหลดใหม่

อัปโหลดไฟล์ที่สองทับ

**ผลที่ต้องได้:** หน้าแสดงผลของไฟล์ใหม่ และแถวเดิมยังอยู่ในฐานข้อมูล
(`select count(*) from self_profiles;` เพิ่มขึ้นเป็น 2)

## ข้อควรระวัง

**โควตา Gemini** — free tier จำกัด generation 5 ครั้ง/นาที การอัปโหลดหนึ่งครั้งใช้
2 generation + 1 embedding ถ้าทดสอบรัวๆ จะเจอ error จากโควตา ไม่ใช่โค้ดพัง
เว้นระยะสัก 30 วินาทีระหว่างการอัปโหลดแต่ละครั้ง
```

- [ ] **Step 8: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run`
Expected: build ผ่าน เทสต์เขียวทั้งหมด (รวม 17 เทสต์ใหม่จาก Task S2)

- [ ] **Step 9: ตรวจด้วยตา**

`npm run dev` แล้วเดินตาม `docs/manual-tests/self-assessment.md` อย่างน้อยหัวข้อ A, B, D และ E

หัวข้อ E เป็นข้อบังคับ ห้ามข้าม — เป็นการยืนยันว่าความเป็นส่วนตัวทำงานจริง

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/self-assessment/page.tsx" components/SelfAssessmentUpload.tsx components/RoleScorePanel.tsx "app/(app)/layout.tsx" middleware.ts CLAUDE.md docs/manual-tests/self-assessment.md
git commit -m "feat(self): self-assessment page, nav entry, and manual test guide"
```

---

## Self-Review

**Spec coverage:**

| ข้อกำหนดใน spec | Task |
|---|---|
| drop `resumes`/`matches` พร้อมเหตุผลในหัวไฟล์ | S1 Step 1 |
| ตาราง `self_profiles` + `resume_assessments` + RLS | S1 Step 1 |
| RPC `match_jobs` | S1 Step 2 |
| `validateUpload` รับ `{type, size}` ไม่ใช่ `File` | S2 Steps 1–3 |
| ตัวตรวจรูปร่าง JSON ของ Gemini | S2 Steps 5–7 |
| แปลง similarity เป็นคะแนน (ไม่ refactor ของเดิม) | S2 Steps 9–11 |
| PDF ภาษาอะไรก็ได้ / โปรไฟล์เป็นอังกฤษ / raw_text ตามต้นฉบับ | S3 Step 1 (prompt) + S6 Step 7 (เทสต์ B) |
| บทวิเคราะห์เป็นไทย | S3 Step 2 |
| แยกสอง Gemini call พร้อมเหตุผล | S3 Steps 1–2 |
| FormData ไม่ใช่ base64 พร้อมเหตุผล | S4 Step 1 |
| ล้มแล้วไม่เขียนอะไรลง DB | S4 Step 1 (try/catch ก่อน insert) |
| ตารางข้อความ error ครบทุกกรณี | S4 Step 1, S5 Step 2 |
| จัดอันดับงานโดยไม่เรียก LLM | S5 Step 1 |
| cache คะแนนด้วย `requirementHash` | S5 Step 2 |
| ใช้ `analyzeCandidate()` ซ้ำ | S5 Step 2 |
| IDOR — ตอบ 404 ไม่ใช่ 403 | S5 Step 2 + S6 Step 7 (เทสต์ E) |
| หน้า UI สี่ส่วน + สถานะว่าง | S6 Step 3 |
| nav ไม่ gate ด้วย role | S6 Step 4 |
| middleware matcher | S6 Step 5 |
| ลบข้อความค้างใน CLAUDE.md | S6 Step 6 |
| checklist ทดสอบด้วยมือ | S6 Step 7 |

**Placeholder scan:** ไม่มี — ทุก step มีโค้ดจริงหรือคำสั่งจริงครบ

**Type consistency:**

- `MAX_UPLOAD_BYTES`, `validateUpload` (S2) → ใช้ใน S4 Step 1 และ S6 Step 1 — ลายเซ็นตรงกัน
- `Assessment`, `normalizeAssessment` (S2) → ใช้ใน S3 Step 2 และ S6 Step 3 — ตรงกัน
- `similarityToScore` (S2) → ใช้ใน S5 Step 1 — ตรงกัน
- `parsePdfProfile` คืน `{ profile, raw_text }` (S3) → S4 destructure ตรงกัน
- `assessProfile` คืน `Assessment` (S3) → S4 เก็บลงคอลัมน์ `assessment` → S6 อ่านเป็น `Assessment` — ตรงกัน
- `JobFit` และ `matchJobsForProfile(profileId, ownerId, matchCount?)` (S5) → S6 Step 3 เรียกด้วยสองอาร์กิวเมนต์ — ตรงกัน
- คอลัมน์ที่ S4/S5 เขียน (`owner_id`, `file_name`, `raw_text`, `parsed_data`, `assessment`, `embedding` / `profile_id`, `requirement_text`, `requirement_hash`, `score`, `reasoning`) ตรงกับ schema ใน S1 ทุกตัว
- `analyzeCandidate(profile, requirement)` คืน `{ score, reasoning }` — ตรงกับที่ S5 เก็บและคืน
- `ScoreBadge({ score })` จาก `components/ScoreBadge.tsx` เดิม — ใช้ใน S6 สองที่ ตรงกัน
- `inlineData: { mimeType, data }` ตรวจกับ `@google/genai@1.52.0` type `Blob_2` แล้วว่าเป็น camelCase และ `data` เป็น base64 string

**หมายเหตุสำหรับผู้ implement:** S1 ต้องทำก่อนเสมอ และ **ต้องรัน migration ทั้งสองไฟล์บน Supabase ให้เสร็จก่อน** ทดสอบ S4–S6 ไม่งั้นจะเจอ error ว่าไม่มีตาราง S2 เป็นอิสระ ทำเมื่อไหร่ก็ได้ S3 ต้องมาก่อน S4 และ S5 ต้องมาก่อน S6

**ข้อสังเกตเรื่องความคาดหวัง:** ขณะเขียนแผนนี้ระบบมีงานเพียง 4 งาน การจัดอันดับใน Task S5/S6 จึงจะแสดงผลได้อย่างมาก 4 รายการ ไม่ใช่ข้อผิดพลาด
