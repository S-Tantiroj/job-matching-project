# Job Edit/Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปิดให้แก้ไขและลบงานได้ โดย embedding ตามข้อความใหม่เสมอ และไม่ทิ้งคะแนน AI กำพร้าไว้ในฐานข้อมูล

**Architecture:** เพิ่มคอลัมน์ `analyses.job_id` พร้อม FK แบบ cascade เพื่อตอบได้ว่าแถวคะแนนไหนเป็นของงานไหน จากนั้นเพิ่ม `PATCH`/`DELETE` ที่ `/api/jobs/[id]` กั้นด้วย role `data_manager` ฝั่งหน้าเว็บใช้ฟอร์มตัวเดียวกับตอนสร้างโดยรับค่าเริ่มต้นเข้ามา

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (service-role), Gemini embeddings, Vitest

**Spec:** `docs/superpowers/specs/2026-09-07-job-edit-delete-design.md`

## Global Constraints

- **`.rpc()` และ `.from()` ต้องเช็ค `error` เสมอ** ห้าม destructure เอาแต่ `data` — ข้อบังคับใน CLAUDE.md
- **ห้ามส่งข้อความดิบจาก Postgres หรือ Gemini ให้ผู้ใช้** — `console.error` ฝั่งเซิร์ฟเวอร์ได้ ฝั่ง response ต้องเป็นข้อความไทยที่เขียนเอง
- **`source` และ `external_id` แก้จากหน้าเว็บไม่ได้** ตัดทิ้งที่ route ไม่ใช่แค่ไม่แสดงในฟอร์ม
- **ห้าม stub `hasRole` ในเทสต์** — mock เฉพาะ `getSession` ผ่าน `vi.hoisted` ส่วน `hasRole` ใช้ตัวจริงผ่าน `importOriginal`
- **ประตูสิทธิ์ต้องอยู่ก่อนการทำงานทุกอย่าง** เทสต์ต้องยืนยันว่า `member` ไม่ทำให้ `updateJob`/`deleteJob` ถูกเรียก ไม่ใช่แค่ได้ status ถูก
- **migration เพิ่มอย่างเดียว ห้ามแตะตาราง `jobs`**
- **ไม่ทำ soft delete** ไม่ทำประวัติการแก้ไข ไม่แก้เป็นชุด — ตัดสินใจแล้ว
- ภาษาไทยทั้งหมดใน UI, identifier ในโค้ดเป็นอังกฤษ
- Sandbox รัน `npx vitest` / `npm run build` / ต่อ Supabase กับ Gemini ไม่ได้ — ทุก step ที่ต้องรันคำสั่งเหล่านี้ต้องให้มนุษย์รันบน Windows แล้วรายงานผลกลับ

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/migrations/018_analyses_job_id.sql` | **สร้าง** — คอลัมน์ + FK cascade + index |
| `lib/gemini/score.ts` | **แก้** — รับ `jobId` ทางเลือก เขียนลงคอลัมน์ใหม่ |
| `app/api/jobs/[id]/analyze/route.ts` | **แก้** — ส่ง `jobId` เข้าไป |
| `lib/jobs/normalize.ts` | **แก้** — เพิ่มฟังก์ชันบริสุทธิ์สองตัว |
| `lib/jobs/normalize.test.ts` | **แก้** — เทสต์สองฟังก์ชันนั้น |
| `lib/jobs/update.ts` | **สร้าง** — `updateJob` + `deleteJob` |
| `lib/jobs/upsert.ts` | **แก้** — เช็ค `error` (บั๊กพ่วง) |
| `lib/jobs/match.ts` | **แก้** — เช็ค `error` (บั๊กพ่วง) |
| `app/api/jobs/[id]/route.ts` | **สร้าง** — PATCH + DELETE |
| `app/api/jobs/[id]/route.test.ts` | **สร้าง** — ประตูสิทธิ์ + การตัด `source` |
| `app/api/jobs/route.ts` | **แก้** — เพิ่มประตู `data_manager` ให้ POST |
| `app/api/jobs/route.test.ts` | **แก้** — ครอบประตูใหม่ |
| `components/JobForm.tsx` | **สร้าง** (จาก `CreateJobForm.tsx`) — สร้าง/แก้ ใช้ตัวเดียวกัน |
| `components/CreateJobForm.tsx` | **ลบ** — ถูกแทนด้วย `JobForm` |
| `components/DeleteJobButton.tsx` | **สร้าง** — ปุ่ม + กล่องยืนยัน |
| `app/(app)/jobs/[id]/edit/page.tsx` | **สร้าง** — server component ดึงงาน + นับ cache |
| `app/(app)/jobs/[id]/page.tsx` | **แก้** — เพิ่ม `source` ใน select + ปุ่มแก้ไข/ลบ |
| `app/(app)/jobs/page.tsx` | **แก้** — เปลี่ยน import เป็น `JobForm` |
| `lib/jobs/update.int.test.ts` | **สร้าง** — พิสูจน์ cascade กับฐานจริง |

**นอกขอบเขต แต่จดไว้:** `scoreCandidateAgainst` อ่าน cache ด้วย `const { data: cached } = ...` โดยไม่เช็ค `error` ถ้าการอ่าน cache พังจะตกไปเรียก Gemini ใหม่ทุกครั้งโดยเงียบ (แพงแต่ไม่ผิด) spec อนุมัติให้แก้แค่ `upsertJob` กับ `matchCandidatesForJob` จึงไม่แตะในรอบนี้ — เสนอเป็นงานถัดไป

---

## Task 1: Migration 018 + `scoreCandidateAgainst` รับ `jobId`

**Files:**
- Create: `supabase/migrations/018_analyses_job_id.sql`
- Modify: `lib/gemini/score.ts`
- Modify: `app/api/jobs/[id]/analyze/route.ts`

**Interfaces:**
- Produces: `scoreCandidateAgainst(candidateId: string, requirement: string, jobId?: string): Promise<{ score: number; reasoning: string; cached: boolean }>` — Task 6 พึ่งคอลัมน์ `analyses.job_id` ที่ task นี้สร้าง

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/018_analyses_job_id.sql`:

```sql
-- ผูกแถวคะแนนกลับไปหางานที่ทำให้เกิดมัน
--
-- เดิม `analyses` คีย์ด้วย (candidate_id, requirement_hash) เท่านั้น โดย hash มาจาก
-- ข้อความความต้องการของงาน ไม่มีอะไรชี้กลับไปหางานเลย ผลคือสองอย่าง:
--
--   1. แก้งานหนึ่งครั้ง คะแนนที่ cache ไว้ทั้งหมดเข้าไม่ถึงอีก (hash เปลี่ยน)
--      แต่แถวยังอยู่ และไม่มีทางค้นเจอเพื่อกวาดทิ้ง
--   2. ลบงานแล้วแถวเหล่านั้นค้างถาวร ไม่มี FK ให้ cascade
--
-- **nullable โดยตั้งใจ** — การให้คะแนนจากหน้าผู้สมัคร (/api/analyze) ไม่มีงานผูกอยู่
-- และหน้าประเมินตัวเองใช้ requirementHash ตรงๆ ไม่ผ่าน scoreCandidateAgainst
--
-- **แถวที่มีอยู่แล้วจะเป็น NULL ตลอดไป** กวาดย้อนหลังไม่ได้เพราะไม่รู้ว่าแถวไหน
-- เคยเป็นของงานไหน ยอมรับข้อจำกัดนี้
alter table public.analyses
  add column job_id uuid references public.jobs(id) on delete cascade;

create index analyses_job_id_idx on public.analyses (job_id);
```

- [ ] **Step 2: มนุษย์รัน migration**

เปิด Supabase → SQL Editor → วางเนื้อหาไฟล์ข้างบน → Run

ตรวจว่าสำเร็จด้วยคำสั่งนี้ใน SQL Editor:

```sql
select column_name, is_nullable
from information_schema.columns
where table_name = 'analyses' and column_name = 'job_id';
```

Expected: หนึ่งแถว `job_id | YES`

**หยุดตรงนี้จนกว่าจะเห็นแถวนั้น** — task ที่เหลือเขียนลงคอลัมน์นี้

- [ ] **Step 3: แก้ `scoreCandidateAgainst`**

ใน `lib/gemini/score.ts` เปลี่ยนลายเซ็นและการ insert:

```ts
export async function scoreCandidateAgainst(
  candidateId: string,
  requirement: string,
  jobId?: string
): Promise<{ score: number; reasoning: string; cached: boolean }> {
```

แล้วเปลี่ยนบล็อก insert ท้ายฟังก์ชันเป็น:

```ts
  const result = await analyzeCandidate(profile as any, requirement)
  // job_id ทำให้ลบงานแล้ว cascade กวาดแถวนี้ให้เอง และทำให้นับได้ว่างานนี้มีคะแนน
  // cache ไว้กี่คน ผู้เรียกจากหน้าผู้สมัครไม่มีงานผูกอยู่จึงส่ง undefined มา
  const { error: insertError } = await db.from('analyses').insert({
    candidate_id: candidateId,
    requirement_text: requirement,
    requirement_hash: hash,
    score: result.score,
    reasoning: result.reasoning,
    job_id: jobId ?? null,
  })
  if (insertError) console.error('analyses cache write failed:', insertError)
  return { ...result, cached: false }
```

**ไม่โยน error ตอนเขียน cache ล้ม** — คะแนนคำนวณเสร็จแล้วและถูกต้อง การเขียน cache
เป็นผลพลอยได้ ถ้าโยนออกไปผู้ใช้จะเห็นว่าล้มเหลวทั้งที่ได้คำตอบแล้ว (เหตุผลเดียวกับ
`logActivity` ใน `lib/activity/log.ts`)

- [ ] **Step 4: ส่ง `jobId` จาก route ของงาน**

ใน `app/api/jobs/[id]/analyze/route.ts` เปลี่ยนบรรทัดเรียกเป็น:

```ts
    const result = await scoreCandidateAgainst(candidateId, requirement, id)
```

- [ ] **Step 5: ตรวจชนิดข้อมูล**

```
npx tsc --noEmit
```

Expected: ไม่มี error นอกไฟล์ `*.test.ts`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/018_analyses_job_id.sql lib/gemini/score.ts "app/api/jobs/[id]/analyze/route.ts"
git commit -m "feat(db): link analyses rows back to the job that produced them"
```

---

## Task 2: ฟังก์ชันบริสุทธิ์สองตัว

**Files:**
- Modify: `lib/jobs/normalize.ts`
- Test: `lib/jobs/normalize.test.ts`

**Interfaces:**
- Consumes: `buildJobEmbedText`, `buildJobRequirementText`, `type JobInput` (มีอยู่แล้วในไฟล์เดียวกัน)
- Produces:
  - `embedTextChanged(before: JobInput, after: JobInput): boolean`
  - `requirementTextChanged(before: JobInput, after: JobInput): boolean`

- [ ] **Step 1: เขียนเทสต์ที่ยังแดง**

ต่อท้าย `lib/jobs/normalize.test.ts`:

```ts
import { embedTextChanged, requirementTextChanged } from './normalize'

const BASE = {
  title: 'Data Scientist',
  company: 'Acme',
  description: 'Build models',
  required_skills: ['Python', 'SQL'],
  min_experience_years: 3,
  location: 'Bangkok',
  category: 'Technology',
}

test('ไม่แก้อะไรเลย ทั้งสองตัวคืน false', () => {
  expect(embedTextChanged(BASE, { ...BASE })).toBe(false)
  expect(requirementTextChanged(BASE, { ...BASE })).toBe(false)
})

test('แก้ category กระทบ embedding แต่ไม่กระทบ cache คะแนน', () => {
  // **นี่คือเทสต์ที่สำคัญที่สุดในไฟล์นี้** — category อยู่ใน buildJobEmbedText
  // แต่ไม่อยู่ใน buildJobRequirementText ถ้าใครยุบสองฟังก์ชันเป็นตัวเดียว
  // (เพราะดูเผินๆ เหมือนทำงานซ้ำกัน) เทสต์นี้จะแดง
  const after = { ...BASE, category: 'Finance' }
  expect(embedTextChanged(BASE, after)).toBe(true)
  expect(requirementTextChanged(BASE, after)).toBe(false)
})

test('แก้ description กระทบทั้งสองอย่าง', () => {
  const after = { ...BASE, description: 'Build better models' }
  expect(embedTextChanged(BASE, after)).toBe(true)
  expect(requirementTextChanged(BASE, after)).toBe(true)
})

test('แก้ source อย่างเดียวไม่กระทบอะไรเลย', () => {
  // source ไม่ได้อยู่ในข้อความทั้งสองแบบ — ไม่ควรทำให้เสียเงินค่า embedding
  const after = { ...BASE, source: 'manual' }
  expect(embedTextChanged(BASE, after)).toBe(false)
  expect(requirementTextChanged(BASE, after)).toBe(false)
})

test('แก้แล้วเปลี่ยนกลับเป็นค่าเดิม ถือว่าไม่เปลี่ยน', () => {
  const after = { ...BASE, title: 'Data Scientist' }
  expect(embedTextChanged(BASE, after)).toBe(false)
  expect(requirementTextChanged(BASE, after)).toBe(false)
})

test('แก้ location กระทบทั้งสองอย่าง', () => {
  // location อยู่ในทั้งสองข้อความ — ยืนยันว่าไม่ได้มีแค่ category ที่ต่างกัน
  const after = { ...BASE, location: 'Chiang Mai' }
  expect(embedTextChanged(BASE, after)).toBe(true)
  expect(requirementTextChanged(BASE, after)).toBe(true)
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าแดง**

```
npx vitest run lib/jobs/normalize.test.ts
```

Expected: FAIL — `embedTextChanged is not a function` (หรือ import error)

- [ ] **Step 3: เขียนฟังก์ชัน**

ต่อท้าย `lib/jobs/normalize.ts`:

```ts
// เทียบว่าการแก้งานครั้งนี้กระทบอะไรบ้าง ใช้ตัดสินสองเรื่องคนละเรื่อง:
//
//   embedTextChanged      -> ต้องเรียก Gemini คำนวณ embedding ใหม่ไหม (เสียเงิน)
//   requirementTextChanged -> คะแนนเชิงลึกที่ cache ไว้ใช้ไม่ได้แล้วไหม
//
// **ทั้งสองตัวไม่ซ้ำซ้อนกัน** — `category` อยู่ใน buildJobEmbedText แต่ไม่อยู่ใน
// buildJobRequirementText แก้หมวดงานจึงต้อง re-embed แต่ cache ยังใช้ได้
// อย่ายุบเป็นฟังก์ชันเดียว
export function embedTextChanged(before: JobInput, after: JobInput): boolean {
  return buildJobEmbedText(before) !== buildJobEmbedText(after)
}

export function requirementTextChanged(before: JobInput, after: JobInput): boolean {
  return buildJobRequirementText(before) !== buildJobRequirementText(after)
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```
npx vitest run lib/jobs/normalize.test.ts
```

Expected: PASS ทั้งไฟล์ (เทสต์เดิม + 6 อันใหม่)

- [ ] **Step 5: พิสูจน์ว่าเทสต์ category จับได้จริง**

แก้ `lib/jobs/normalize.ts` ชั่วคราว ทำให้สองฟังก์ชันเหมือนกัน:

```ts
export function requirementTextChanged(before: JobInput, after: JobInput): boolean {
  return buildJobEmbedText(before) !== buildJobEmbedText(after)
}
```

รัน `npx vitest run lib/jobs/normalize.test.ts`

Expected: FAIL 1 อัน — `แก้ category กระทบ embedding แต่ไม่กระทบ cache คะแนน`

**ถ้ายังเขียว ให้หยุดแล้วรายงาน** จากนั้นแก้กลับเป็นของเดิม

- [ ] **Step 6: Commit**

```bash
git add lib/jobs/normalize.ts lib/jobs/normalize.test.ts
git commit -m "feat(jobs): tell apart edits that need re-embedding from edits that void cached scores"
```

---

## Task 3: `lib/jobs/update.ts` + แก้บั๊ก error check

**Files:**
- Create: `lib/jobs/update.ts`
- Modify: `lib/jobs/upsert.ts`
- Modify: `lib/jobs/match.ts`

**Interfaces:**
- Consumes: `embedTextChanged`, `requirementTextChanged`, `buildJobEmbedText`, `type JobInput` (Task 2) · คอลัมน์ `analyses.job_id` (Task 1)
- Produces:
  - `updateJob(id: string, patch: Partial<JobInput>): Promise<{ reembedded: boolean; staleScoresRemoved: number } | null>` — คืน `null` เมื่อไม่มีงานนั้น
  - `deleteJob(id: string): Promise<{ deleted: boolean }>`

- [ ] **Step 1: เขียน `lib/jobs/update.ts`**

```ts
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import {
  buildJobEmbedText,
  embedTextChanged,
  requirementTextChanged,
  type JobInput,
} from './normalize'

// ทุกคอลัมน์ที่ป้อน buildJobEmbedText หรือ buildJobRequirementText ต้องอยู่ที่นี่
// ลืมสักตัว แล้วการเทียบ before/after จะคิดว่าค่านั้นเป็น undefined เสมอ
// -> ตัดสินผิดว่าต้อง re-embed ทั้งที่ไม่ต้อง หรือแย่กว่าคือ embed ข้อความที่ขาดค่านั้นไป
const JOB_COLUMNS =
  'title, company, description, required_skills, min_experience_years, location, category'

export type JobUpdateResult = {
  reembedded: boolean
  staleScoresRemoved: number
}

// แก้งานที่มีอยู่แล้ว คืน null เมื่อไม่มีงานนั้น (ผู้เรียกแปลงเป็น 404)
export async function updateJob(
  id: string,
  patch: Partial<JobInput>
): Promise<JobUpdateResult | null> {
  const db = getServerClient()

  const { data: before, error: readError } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (readError) {
    console.error('updateJob read failed:', readError)
    throw new Error('job read failed')
  }
  if (!before) return null

  // source/external_id เป็นข้อมูลที่มาของแถว ไม่ใช่เนื้อหา route ตัดทิ้งไปแล้ว
  // ตัดซ้ำที่นี่เพราะฟังก์ชันนี้อาจถูกเรียกจากที่อื่นในอนาคต
  const { source: _source, external_id: _externalId, ...safe } = patch
  const after = { ...(before as unknown as JobInput), ...safe }

  const reembedded = embedTextChanged(before as unknown as JobInput, after)
  const row: Record<string, unknown> = { ...safe }
  if (reembedded) row.embedding = await embedText(buildJobEmbedText(after))

  const { error: writeError } = await db.from('jobs').update(row).eq('id', id)
  if (writeError) {
    console.error('updateJob write failed:', writeError)
    throw new Error('job update failed')
  }

  // **ลบหลังบันทึกสำเร็จเท่านั้น** — ถ้าลบก่อนแล้วการบันทึกล้ม จะเสีย cache ไปฟรีๆ
  // ทั้งที่งานยังเป็นข้อความเดิม ลำดับนี้เลือกจากว่าความล้มเหลวแบบไหนแย่น้อยกว่า
  let staleScoresRemoved = 0
  if (requirementTextChanged(before as unknown as JobInput, after)) {
    const { data: removed, error: delError } = await db
      .from('analyses')
      .delete()
      .eq('job_id', id)
      .select('id')
    if (delError) {
      // ไม่โยนออกไป — งานถูกบันทึกสำเร็จแล้ว บอกผู้ใช้ว่า "ล้มเหลว" ตอนนี้จะผิด
      // แถวที่เหลือไม่มีใครอ่านได้อยู่แล้ว (hash ไม่ตรง) จึงไม่ทำอันตรายอะไร
      console.error('stale analyses cleanup failed:', delError)
    } else {
      staleScoresRemoved = (removed ?? []).length
    }
  }

  return { reembedded, staleScoresRemoved }
}

// ลบงานจริง แถว analyses ที่มี job_id ตรงกันหายไปเองด้วย FK cascade (migration 018)
// จึงไม่มีโค้ดกวาดที่ต้องจำไปเรียกทุกจุดที่ลบงาน
export async function deleteJob(id: string): Promise<{ deleted: boolean }> {
  const db = getServerClient()
  const { data, error } = await db.from('jobs').delete().eq('id', id).select('id')
  if (error) {
    console.error('deleteJob failed:', error)
    throw new Error('job delete failed')
  }
  return { deleted: (data ?? []).length > 0 }
}
```

- [ ] **Step 2: แก้ `upsertJob` ให้เช็ค `error`**

ใน `lib/jobs/upsert.ts` แทนสองบล็อกท้ายฟังก์ชัน:

```ts
  if (input.external_id) {
    const { data: existing, error: findError } = await db
      .from('jobs')
      .select('id')
      .eq('source', source)
      .eq('external_id', input.external_id)
      .maybeSingle()
    if (findError) {
      console.error('upsertJob lookup failed:', findError)
      throw new Error('job lookup failed')
    }

    const { data, error } = await db
      .from('jobs')
      .upsert(row, { onConflict: 'source,external_id' })
      .select('id')
      .single()
    if (error) {
      console.error('upsertJob upsert failed:', error)
      throw new Error('job upsert failed')
    }
    return { id: (data as any).id, updated: !!existing }
  }

  const { data, error } = await db.from('jobs').insert(row).select('id').single()
  if (error) {
    console.error('upsertJob insert failed:', error)
    throw new Error('job insert failed')
  }
  return { id: (data as any).id, updated: false }
```

เดิมอ่าน `(data as any).id` ทันทีโดยไม่เช็ค `error` — insert พังเมื่อไรจะได้
`TypeError: Cannot read properties of null` แทนข้อความที่บอกว่าเกิดอะไรขึ้น

- [ ] **Step 3: แก้ `matchCandidatesForJob` ให้เช็ค `error`**

ใน `lib/jobs/match.ts` แทนสามบล็อก:

```ts
  const { data: job, error: jobError } = await db
    .from('jobs')
    .select('embedding')
    .eq('id', jobId)
    .maybeSingle()
  if (jobError) {
    console.error('matchCandidatesForJob job read failed:', jobError)
    throw new Error('job read failed')
  }
  if (!job || !(job as any).embedding) return []
```

```ts
  const { data: matches, error: rpcError } = await db.rpc('match_candidates', {
    query_embedding: embedding,
    match_count: matchCount,
  })
  if (rpcError) {
    console.error('match_candidates failed:', rpcError)
    throw new Error('job match rpc failed')
  }
```

```ts
  const { data: rows, error: rowsError } = await db
    .from('candidates')
    .select('id, full_name, headline')
    .in('id', ids)
  if (rowsError) {
    console.error('candidates fetch after job ranking failed:', rowsError)
    throw new Error('job match fetch failed')
  }
```

เดิมไม่เช็คเลย — RPC พังแล้วหน้า job จะขึ้นว่า "ไม่มีผู้สมัครเข้าเกณฑ์" แทนที่จะบอกว่าพัง
อาการเดียวกับที่หน้าค้นหาเคยเป็นเมื่อ 2026-09-07 และใช้เวลาไล่หาสาเหตุนาน

- [ ] **Step 4: ตรวจชนิดข้อมูล**

```
npx tsc --noEmit
```

Expected: ไม่มี error นอกไฟล์ `*.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/update.ts lib/jobs/upsert.ts lib/jobs/match.ts
git commit -m "feat(jobs): updateJob and deleteJob; check errors in upsertJob and match"
```

---

## Task 4: Route + ประตูสิทธิ์

**Files:**
- Create: `app/api/jobs/[id]/route.ts`
- Create: `app/api/jobs/[id]/route.test.ts`
- Modify: `app/api/jobs/route.ts`
- Modify: `app/api/jobs/route.test.ts`

**Interfaces:**
- Consumes: `updateJob`, `deleteJob` (Task 3) · `getSession`, `hasRole` จาก `@/lib/auth/session`
- Produces: `PATCH /api/jobs/[id]` และ `DELETE /api/jobs/[id]` — Task 5 เรียกจากหน้าเว็บ

- [ ] **Step 1: เขียนเทสต์ที่ยังแดง**

สร้าง `app/api/jobs/[id]/route.test.ts`:

```ts
import { vi } from 'vitest'

const updateMock = vi.fn(async (_id: string, _patch: any) => ({
  reembedded: true,
  staleScoresRemoved: 2,
}))
const deleteMock = vi.fn(async (_id: string) => ({ deleted: true }))
vi.mock('@/lib/jobs/update', () => ({
  updateJob: (id: string, patch: any) => updateMock(id, patch),
  deleteJob: (id: string) => deleteMock(id),
}))

// role เป็น string ไม่ใช่ Role เพราะมีเทสต์ที่จงใจป้อนค่าที่ enum ไม่รู้จัก
const h = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
}))

// **hasRole ต้องเป็นตัวจริง** — stub เป็น true เมื่อไรประตูสิทธิ์ก็ไม่ถูกทดสอบเลย
// (บทเรียนจาก app/api/ingest/route.test.ts)
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSession: async () => h.session as any,
}))

import { PATCH, DELETE } from './route'

const ctx = { params: Promise.resolve({ id: 'job1' }) }

function patch(body: unknown) {
  return PATCH(
    new Request('http://x/api/jobs/job1', { method: 'PATCH', body: JSON.stringify(body) }) as any,
    ctx as any
  )
}
function del() {
  return DELETE(new Request('http://x/api/jobs/job1', { method: 'DELETE' }) as any, ctx as any)
}

beforeEach(() => {
  h.session = { userId: 'u1', role: 'data_manager' }
  updateMock.mockClear()
  deleteMock.mockClear()
  updateMock.mockImplementation(async () => ({ reembedded: true, staleScoresRemoved: 2 }))
  deleteMock.mockImplementation(async () => ({ deleted: true }))
})

test('data_manager แก้งานได้', async () => {
  const res = await patch({ title: 'New title' })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ reembedded: true, staleScoresRemoved: 2 })
})

test('admin ผ่านด้วย เพราะสิทธิ์เป็นลำดับชั้น', async () => {
  h.session = { userId: 'u1', role: 'admin' }
  expect((await patch({ title: 'x' })).status).toBe(200)
  expect((await del()).status).toBe(200)
})

test('ไม่มีเซสชันได้ 401 และไม่มีการเขียนอะไรเลย', async () => {
  h.session = null
  expect((await patch({ title: 'x' })).status).toBe(401)
  expect((await del()).status).toBe(401)
  expect(updateMock).not.toHaveBeenCalled()
  expect(deleteMock).not.toHaveBeenCalled()
})

test('member ได้ 403 ทั้งแก้และลบ', async () => {
  h.session = { userId: 'u1', role: 'member' }
  expect((await patch({ title: 'x' })).status).toBe(403)
  expect((await del()).status).toBe(403)
})

test('member ถูกปฏิเสธก่อนแตะข้อมูล ไม่ใช่หลังแก้ไปแล้ว', async () => {
  // ประตูที่อยู่หลังการทำงานคืนสถานะถูกแต่ข้อมูลเปลี่ยนไปแล้ว
  h.session = { userId: 'u1', role: 'member' }
  await patch({ title: 'x' })
  await del()
  expect(updateMock).not.toHaveBeenCalled()
  expect(deleteMock).not.toHaveBeenCalled()
})

test('role ที่ไม่รู้จักจากฐานข้อมูลถูกปฏิเสธ', async () => {
  // getSession cast ค่าจาก profiles.role ด้วย `as Role` โดยไม่ตรวจ
  h.session = { userId: 'u1', role: 'superuser' }
  expect((await patch({ title: 'x' })).status).toBe(403)
  expect(updateMock).not.toHaveBeenCalled()
})

test('PATCH ตัด source และ external_id ทิ้งจาก body', async () => {
  // ทั้งคู่เป็นข้อมูลที่มาของแถว ไม่ใช่เนื้อหา และการเปลี่ยน external_id
  // อาจชนกับ unique constraint (source, external_id) แล้วพังแบบอธิบายยาก
  await patch({ title: 'New', source: 'scraper', external_id: 'hijack' })
  const sent = updateMock.mock.calls[0][1]
  expect(sent).not.toHaveProperty('source')
  expect(sent).not.toHaveProperty('external_id')
  expect(sent).toHaveProperty('title', 'New')
})

test('PATCH ปฏิเสธ title ว่าง', async () => {
  const res = await patch({ title: '   ' })
  expect(res.status).toBe(400)
  expect(updateMock).not.toHaveBeenCalled()
})

test('PATCH ปฏิเสธ description ว่าง', async () => {
  const res = await patch({ description: '' })
  expect(res.status).toBe(400)
  expect(updateMock).not.toHaveBeenCalled()
})

test('ไม่พบงานได้ 404 ไม่ใช่ 200 เปล่าๆ', async () => {
  updateMock.mockImplementation(async () => null as any)
  expect((await patch({ title: 'x' })).status).toBe(404)
  deleteMock.mockImplementation(async () => ({ deleted: false }))
  expect((await del()).status).toBe(404)
})

test('ความล้มเหลวของฐานข้อมูลได้ 500 และไม่หลุดข้อความดิบออกไป', async () => {
  updateMock.mockImplementation(async () => {
    throw new Error('duplicate key value violates unique constraint "jobs_source_external_id_key"')
  })
  const res = await patch({ title: 'x' })
  expect(res.status).toBe(500)
  const json = await res.json()
  expect(json.error).not.toContain('constraint')
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าแดง**

```
npx vitest run "app/api/jobs/[id]/route.test.ts"
```

Expected: FAIL — resolve `./route` ไม่ได้

- [ ] **Step 3: เขียน route**

สร้าง `app/api/jobs/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { updateJob, deleteJob } from '@/lib/jobs/update'
import type { JobInput } from '@/lib/jobs/normalize'

// ประตูสิทธิ์ต้องอยู่ก่อนการทำงานทุกอย่าง — ประตูที่อยู่หลัง updateJob
// คืนสถานะถูกแต่ข้อมูลเปลี่ยนไปแล้ว
// คืน Response เมื่อถูกปฏิเสธ คืน null เมื่อผ่าน (สร้าง Response ใหม่ทุกครั้ง
// เพราะ Response ใช้ซ้ำข้ามคำขอไม่ได้)
async function denyIfNotAllowed(): Promise<NextResponse | null> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์แก้ไขหรือลบงาน' }, { status: 403 })
  }
  return null
}

// PATCH /api/jobs/[id]  body: Partial<JobInput>
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyIfNotAllowed()
  if (denied) return denied

  const { id } = await params
  const body = (await req.json()) as Record<string, unknown>

  // **ตัดที่นี่ ไม่ใช่แค่ไม่แสดงในฟอร์ม** — body มาจาก client ที่เชื่อไม่ได้
  const { source: _source, external_id: _externalId, ...patch } = body

  if ('title' in patch && !String(patch.title ?? '').trim()) {
    return NextResponse.json({ error: 'ตำแหน่งงานห้ามว่าง' }, { status: 400 })
  }
  if ('description' in patch && !String(patch.description ?? '').trim()) {
    return NextResponse.json({ error: 'รายละเอียดงานห้ามว่าง' }, { status: 400 })
  }

  try {
    const result = await updateJob(id, patch as Partial<JobInput>)
    if (!result) return NextResponse.json({ error: 'ไม่พบงานนี้' }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: any) {
    // log ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งข้อความดิบจาก Postgres ให้ผู้ใช้
    console.error('PATCH /api/jobs/[id] failed:', e?.message ?? e)
    return NextResponse.json(
      { error: 'บันทึกไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่' },
      { status: 500 }
    )
  }
}

// DELETE /api/jobs/[id] — แถว analyses ที่ผูกกับงานนี้หายไปเองด้วย FK cascade
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyIfNotAllowed()
  if (denied) return denied

  const { id } = await params
  try {
    const { deleted } = await deleteJob(id)
    if (!deleted) return NextResponse.json({ error: 'ไม่พบงานนี้' }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error('DELETE /api/jobs/[id] failed:', e?.message ?? e)
    return NextResponse.json(
      { error: 'ลบไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```
npx vitest run "app/api/jobs/[id]/route.test.ts"
```

Expected: PASS ทั้ง 11 เทสต์

- [ ] **Step 5: เพิ่มประตูให้ POST /api/jobs**

ใน `app/api/jobs/route.ts` เปลี่ยน import และเพิ่มการตรวจ:

```ts
import { getSession, hasRole } from '@/lib/auth/session'
```

```ts
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // **เปลี่ยนพฤติกรรมของของเดิม** — เดิมมีแค่ getSession() ใครที่ล็อกอินก็สร้างงานได้
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์เพิ่มงาน' }, { status: 403 })
  }
```

- [ ] **Step 6: แก้เทสต์ของ POST ให้ครอบประตูใหม่**

แทนทั้งไฟล์ `app/api/jobs/route.test.ts`:

```ts
import { vi } from 'vitest'

const upsertMock = vi.fn(async (_input: any) => ({ id: 'job1', updated: false }))
vi.mock('@/lib/jobs/upsert', () => ({ upsertJob: (input: any) => upsertMock(input) }))

const h = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
}))
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSession: async () => h.session as any,
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/jobs', { method: 'POST', body: JSON.stringify(body) }) as any)
}

beforeEach(() => {
  h.session = { userId: 'u1', role: 'data_manager' }
  upsertMock.mockClear()
})

test('creates a job from a valid body', async () => {
  const res = await post({ title: 'Data Scientist', description: 'Build models' })
  const json = await res.json()
  expect(json.id).toBe('job1')
})

test('rejects a body missing title or description', async () => {
  const res = await post({ title: 'No description' })
  expect(res.status).toBe(400)
})

test('ไม่มีเซสชันได้ 401', async () => {
  h.session = null
  const res = await post({ title: 'x', description: 'y' })
  expect(res.status).toBe(401)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('member สร้างงานไม่ได้อีกต่อไป', async () => {
  // เปลี่ยนพฤติกรรมโดยตั้งใจ — เดิม route นี้มีแค่ getSession()
  h.session = { userId: 'u1', role: 'member' }
  const res = await post({ title: 'x', description: 'y' })
  expect(res.status).toBe(403)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('admin สร้างได้', async () => {
  h.session = { userId: 'u1', role: 'admin' }
  expect((await post({ title: 'x', description: 'y' })).status).toBe(200)
})
```

- [ ] **Step 7: รันเทสต์ทั้งสองไฟล์**

```
npx vitest run app/api/jobs
```

Expected: PASS ทั้งหมด

- [ ] **Step 8: พิสูจน์ว่าประตูถูกทดสอบจริง**

ใน `app/api/jobs/[id]/route.ts` เปลี่ยนเงื่อนไขในฟังก์ชัน `denyIfNotAllowed` ชั่วคราว:

```ts
  if (false && !hasRole(session.role, 'data_manager')) {
```

รัน `npx vitest run "app/api/jobs/[id]/route.test.ts"`

Expected: FAIL 3 อัน — `member ได้ 403 ทั้งแก้และลบ`, `member ถูกปฏิเสธก่อนแตะข้อมูล ไม่ใช่หลังแก้ไปแล้ว`, `role ที่ไม่รู้จักจากฐานข้อมูลถูกปฏิเสธ`

**ถ้ายังเขียว ให้หยุดแล้วรายงาน** จากนั้นแก้กลับด้วย `git checkout -- "app/api/jobs/[id]/route.ts"`

- [ ] **Step 9: Commit**

```bash
git add "app/api/jobs/[id]/route.ts" "app/api/jobs/[id]/route.test.ts" app/api/jobs/route.ts app/api/jobs/route.test.ts
git commit -m "feat(api): PATCH and DELETE jobs behind a data_manager gate"
```

---

## Task 5: หน้าจอ

**Files:**
- Create: `components/JobForm.tsx`
- Delete: `components/CreateJobForm.tsx`
- Create: `components/DeleteJobButton.tsx`
- Create: `app/(app)/jobs/[id]/edit/page.tsx`
- Modify: `app/(app)/jobs/[id]/page.tsx`
- Modify: `app/(app)/jobs/page.tsx`

**Interfaces:**
- Consumes: `PATCH`/`DELETE /api/jobs/[id]` (Task 4) · `requirementTextChanged`, `type JobInput` (Task 2)
- Produces: `JobForm` รับ `{ job?: JobInput & { id: string; source: string }; cachedScoreCount?: number }`

- [ ] **Step 1: เขียน `components/JobForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requirementTextChanged, type JobInput } from '@/lib/jobs/normalize'

export type EditableJob = JobInput & { id: string; source: string }

// ฟอร์มเดียวใช้ทั้งสร้างและแก้ ต่างกันแค่ค่าเริ่มต้นกับปลายทางที่ยิง
// (แบบเดียวกับที่ ProfileForm ใช้ทั้งตรวจ draft และกรอกเองในฟีเจอร์ประเมินตัวเอง)
export default function JobForm({
  job,
  cachedScoreCount = 0,
}: {
  job?: EditableJob
  cachedScoreCount?: number
}) {
  const router = useRouter()
  const editing = !!job
  const [title, setTitle] = useState(job?.title ?? '')
  const [company, setCompany] = useState(job?.company ?? '')
  const [skills, setSkills] = useState((job?.required_skills ?? []).join(', '))
  const [minExp, setMinExp] = useState(
    job?.min_experience_years != null ? String(job.min_experience_years) : ''
  )
  const [location, setLocation] = useState(job?.location ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const payload = (): Partial<JobInput> => ({
    title,
    company: company || undefined,
    description,
    required_skills: skills
      ? skills.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    min_experience_years: minExp ? Number(minExp) : undefined,
    location: location || undefined,
  })

  // คำเตือนแบบสด ไม่ใช่ขึ้นตลอด — โผล่เฉพาะตอนที่การแก้นั้นทำให้ requirement_hash
  // เปลี่ยนจริง แก้แล้วเปลี่ยนกลับเป็นค่าเดิมจะไม่เตือน คำเตือนที่ขึ้นทุกครั้ง
  // คือคำเตือนที่คนเลิกอ่าน
  const willVoidCache =
    editing &&
    cachedScoreCount > 0 &&
    requirementTextChanged(job as JobInput, { ...(job as JobInput), ...payload() })

  const save = async () => {
    if (!title.trim() || !description.trim() || saving) return
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const res = editing
        ? await fetch(`/api/jobs/${job!.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload()),
          })
        : await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload()),
          })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErr(
          res.status === 403
            ? 'คุณไม่มีสิทธิ์ทำรายการนี้'
            : json.error ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่'
        )
        return
      }
      if (editing) {
        router.push(`/jobs/${job!.id}`)
        router.refresh()
        return
      }
      setTitle('')
      setCompany('')
      setSkills('')
      setMinExp('')
      setLocation('')
      setDescription('')
      setMsg('เพิ่มงานแล้ว')
      router.refresh()
    } catch {
      setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 8, marginBottom: 24 }}>
      {editing && job!.source === 'synthetic' && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          งานนี้มาจากสคริปต์ตัวอย่าง — รัน <code>npx tsx scripts/seed-jobs.ts</code> อีกครั้ง
          แล้วค่าที่แก้จะกลับคืนเป็นค่าเดิม
        </p>
      )}
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ตำแหน่งงาน (เช่น Data Scientist)" />
      <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="บริษัท (ไม่บังคับ)" />
      <input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="สกิลที่ต้องการ คั่นด้วยจุลภาค เช่น Python, SQL" />
      <input className="input" value={minExp} onChange={(e) => setMinExp(e.target.value)} placeholder="ประสบการณ์ขั้นต่ำ (ปี)" type="number" />
      <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="สถานที่ (ไม่บังคับ)" />
      <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" rows={4} />
      {willVoidCache && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          การแก้นี้ทำให้คะแนนเชิงลึกที่เคยคำนวณไว้ {cachedScoreCount} รายการใช้ไม่ได้
          และจะถูกลบทิ้ง กดดูใหม่จะต้องให้ AI คำนวณอีกครั้ง
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={saving || !title || !description}>
          {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}
        </button>
        {editing && (
          <button className="btn" onClick={() => router.back()} disabled={saving}>ยกเลิก</button>
        )}
        {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ลบ `CreateJobForm` แล้วเปลี่ยน import ในหน้ารายการ**

```bash
git rm components/CreateJobForm.tsx
```

ใน `app/(app)/jobs/page.tsx` เปลี่ยนสองบรรทัด:

```tsx
import JobForm from '@/components/JobForm'
```

```tsx
      <JobForm />
```

- [ ] **Step 3: เขียน `components/DeleteJobButton.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteJobButton({
  jobId,
  title,
  seeded,
}: {
  jobId: string
  title: string
  seeded: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(
          res.status === 403 ? 'คุณไม่มีสิทธิ์ลบงาน' : json.error ?? 'ลบไม่สำเร็จ กรุณาลองใหม่'
        )
        return
      }
      router.push('/jobs')
      router.refresh()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn"
        style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
        onClick={() => setOpen(true)}
      >
        ลบงาน
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">ลบงาน “{title}” ?</p>
            <p style={{ fontSize: 14 }}>
              ลบแล้วกู้คืนไม่ได้ คะแนนเชิงลึกที่เคยคำนวณไว้กับงานนี้จะถูกลบไปด้วย
            </p>
            {seeded && (
              <p className="faint" style={{ fontSize: 13 }}>
                งานนี้มาจากสคริปต์ตัวอย่าง — รัน <code>npx tsx scripts/seed-jobs.ts</code>{' '}
                อีกครั้งแล้วมันจะกลับมา
              </p>
            )}
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn"
                style={{ background: 'var(--bad)', borderColor: 'var(--bad)', color: '#fff' }}
                onClick={run}
                disabled={busy}
              >
                {busy ? 'กำลังลบ…' : 'ลบเลย'}
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

- [ ] **Step 4: เขียนหน้าแก้ไข**

สร้าง `app/(app)/jobs/[id]/edit/page.tsx`:

```tsx
import { getServerClient } from '@/lib/supabase/server'
import { getSession, hasRole } from '@/lib/auth/session'
import JobForm from '@/components/JobForm'

export const dynamic = 'force-dynamic'

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) {
    return <main><p className="faint">คุณไม่มีสิทธิ์แก้ไขงาน</p></main>
  }

  const db = getServerClient()
  const { data: job, error } = await db
    .from('jobs')
    .select('id, title, company, description, required_skills, min_experience_years, location, category, source')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('edit job page read failed:', error)
    return <main><p style={{ color: 'var(--bad)' }}>โหลดข้อมูลงานไม่สำเร็จ กรุณาลองใหม่</p></main>
  }
  if (!job) return <main><p className="faint">ไม่พบงานนี้</p></main>

  // นับคะแนนที่ cache ไว้เพื่อบอกผู้ใช้ว่าการแก้จะทำให้ต้องคำนวณใหม่กี่รายการ
  const { count, error: countError } = await db
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', id)
  if (countError) console.error('cached score count failed:', countError)

  return (
    <main>
      <h1>แก้ไขงาน</h1>
      <JobForm job={job as any} cachedScoreCount={count ?? 0} />
    </main>
  )
}
```

- [ ] **Step 5: เพิ่มปุ่มในหน้ารายละเอียดงาน**

ใน `app/(app)/jobs/[id]/page.tsx`:

เพิ่ม import ด้านบน:

```tsx
import Link from 'next/link'
import { getSession, hasRole } from '@/lib/auth/session'
import DeleteJobButton from '@/components/DeleteJobButton'
```

เพิ่ม `source` เข้า select (ต้องมีเพื่อรู้ว่าเป็นงานจาก seed ไหม) และเช็ค error:

```tsx
  const { data: j, error } = await db
    .from('jobs')
    .select('title, company, location, min_experience_years, required_skills, description, source')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('job page read failed:', error)
    return <main><p style={{ color: 'var(--bad)' }}>โหลดข้อมูลงานไม่สำเร็จ กรุณาลองใหม่</p></main>
  }
  if (!j) return <main><p className="faint">ไม่พบงานนี้</p></main>

  const session = await getSession()
  const canEdit = !!session && hasRole(session.role, 'data_manager')
```

แล้วเพิ่มแถวปุ่มท้ายการ์ด ก่อนปิด `</div>` ของ `.card`:

```tsx
        {canEdit && (
          <div className="row" style={{ marginTop: 14 }}>
            <Link href={`/jobs/${id}/edit`} className="btn">แก้ไข</Link>
            <DeleteJobButton
              jobId={id}
              title={(j as any).title}
              seeded={(j as any).source === 'synthetic'}
            />
          </div>
        )}
```

**ปุ่มซ่อนจาก `member` เป็นความสะอาดของหน้าจอ ไม่ใช่ความปลอดภัย** ประตูจริงอยู่ที่ route

- [ ] **Step 6: ตรวจชนิดข้อมูล**

```
npx tsc --noEmit
```

Expected: ไม่มี error นอกไฟล์ `*.test.ts` และไม่มี error ที่อ้างถึง `CreateJobForm`

- [ ] **Step 7: Commit**

การลบ `CreateJobForm.tsx` ถูก stage ไปแล้วตอน `git rm` ใน Step 2

```bash
git add components/JobForm.tsx components/DeleteJobButton.tsx "app/(app)/jobs"
git status --short
git commit -m "feat(jobs): edit page, delete dialog, one form for create and edit"
```

`git status --short` ต้องแสดง `D components/CreateJobForm.tsx` ถ้าไม่มี แปลว่า Step 2 ไม่ได้ทำ

---

## Task 6: integration test + ตรวจงานทั้งหมด

**Files:**
- Create: `lib/jobs/update.int.test.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: เขียน integration test**

สร้าง `lib/jobs/update.int.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertJob } from './upsert'
import { updateJob, deleteJob } from './update'

const db = getServerClient()
const made: string[] = []

afterAll(async () => {
  if (made.length) await db.from('jobs').delete().in('id', made)
})

async function makeJob(title: string) {
  const { id } = await upsertJob({
    title,
    description: 'Build and ship models for the analytics team',
    required_skills: ['Python'],
    min_experience_years: 3,
    category: 'Technology',
  })
  made.push(id)
  return id
}

// ต้องมีผู้สมัครสักคนเพื่อสร้างแถว analyses ที่ FK ถูกต้อง
async function anyCandidateId(): Promise<string> {
  const { data, error } = await db
    .from('candidates')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (!data?.length) throw new Error('ต้องมีผู้สมัครอย่างน้อยหนึ่งคน — รัน scripts/seed-synthetic.ts ก่อน')
  return (data[0] as any).id
}

async function seedScore(jobId: string, hash: string) {
  const candidateId = await anyCandidateId()
  const { error } = await db.from('analyses').insert({
    candidate_id: candidateId,
    requirement_text: `__test__ ${hash}`,
    requirement_hash: `__test__${hash}`,
    score: 77,
    reasoning: '__test__',
    job_id: jobId,
  })
  if (error) throw error
}

async function countScores(jobId: string) {
  const { count, error } = await db
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
  if (error) throw error
  return count ?? 0
}

test('ลบงานแล้วแถว analyses ที่ผูกอยู่หายไปด้วย (FK cascade)', async () => {
  // migration 018 คือชิ้นที่รับน้ำหนักทั้งฟีเจอร์ ไม่มีอะไรอื่นพิสูจน์ cascade ได้
  const id = await makeJob('__test__ cascade job')
  await seedScore(id, 'cascade')
  expect(await countScores(id)).toBe(1)

  await deleteJob(id)
  expect(await countScores(id)).toBe(0)
}, 60_000)

test('แก้จนข้อความความต้องการเปลี่ยน คะแนนเก่าถูกลบและนับตรง', async () => {
  const id = await makeJob('__test__ stale job')
  await seedScore(id, 'stale')

  const res = await updateJob(id, { description: 'A completely different job description' })
  expect(res?.reembedded).toBe(true)
  expect(res?.staleScoresRemoved).toBe(1)
  expect(await countScores(id)).toBe(0)
}, 60_000)

test('แก้เฉพาะ category — re-embed แต่คะแนนเก่ายังอยู่', async () => {
  // category อยู่ใน buildJobEmbedText แต่ไม่อยู่ใน buildJobRequirementText
  const id = await makeJob('__test__ category job')
  await seedScore(id, 'category')

  const res = await updateJob(id, { category: 'Finance' })
  expect(res?.reembedded).toBe(true)
  expect(res?.staleScoresRemoved).toBe(0)
  expect(await countScores(id)).toBe(1)
}, 60_000)

test('แก้งานที่ไม่มีอยู่คืน null', async () => {
  const res = await updateJob('00000000-0000-0000-0000-000000000000', { title: 'x' })
  expect(res).toBeNull()
})

test('ลบงานที่ไม่มีอยู่คืน deleted: false', async () => {
  const res = await deleteJob('00000000-0000-0000-0000-000000000000')
  expect(res.deleted).toBe(false)
})
```

- [ ] **Step 2: รัน integration**

```
npm run test:integration
```

Expected: ผ่านทั้งหมด (หรือถูกข้ามด้วย `tolerateOutage` ถ้า Gemini ตอบ 503/429)

**ถ้าเทสต์ cascade แดง ให้หยุดแล้วรายงาน** — แปลว่า migration 018 ยังไม่ได้รัน หรือ FK สร้างไม่สำเร็จ ทั้งฟีเจอร์ตั้งอยู่บนข้อนี้

- [ ] **Step 3: เทสต์ทั้งชุด**

```
npm test
```

Expected: เขียวทั้งหมด รวมของใหม่ทั้งสามไฟล์

- [ ] **Step 4: Build**

```
npm run build
```

Expected: สำเร็จ — เป็นด่านเดียวที่จับได้ว่าลบ `CreateJobForm` แล้วไม่มีใคร import ค้าง

- [ ] **Step 5: ตรวจด้วยตา**

```
npm run dev
```

เข้าด้วยบัญชี `data_manager` หรือ `admin` แล้วตรวจ:

1. `/jobs` — ฟอร์มเพิ่มงานยังทำงานเหมือนเดิม
2. เปิดงานที่สร้างเอง → เห็นปุ่ม "แก้ไข" กับ "ลบงาน"
3. กดแก้ไข → ฟอร์มมีค่าเดิมครบทุกช่อง
4. แก้ `สถานที่` แล้วเปลี่ยนกลับเป็นค่าเดิม → **ไม่มีคำเตือนเรื่องคะแนน**
5. แก้ `รายละเอียดงาน` → **คำเตือนโผล่** (ถ้าเคยกดดูคะแนนเชิงลึกของงานนี้มาก่อน)
6. บันทึก → กลับไปหน้ารายละเอียด เห็นค่าใหม่
7. เปิดงานจาก seed (เช่น Data Scientist) → เห็นข้อความว่ามาจากสคริปต์ตัวอย่าง ทั้งในหน้าแก้ไขและกล่องลบ
8. กดลบ → กล่องยืนยันขึ้น กด "ยกเลิก" แล้วไม่มีอะไรเกิดขึ้น
9. กดลบแล้วยืนยัน → กลับไป `/jobs` และงานหายจากรายการ

จากนั้นออกแล้วเข้าด้วยบัญชี `member`:

10. เปิดหน้ารายละเอียดงาน → **ไม่เห็นปุ่มแก้ไขและลบ**
11. เข้า `/jobs/<id>/edit` ตรงๆ ทาง URL → ขึ้นว่าไม่มีสิทธิ์
12. `/jobs` → กดเพิ่มงาน → **ขึ้นว่าไม่มีสิทธิ์** (พฤติกรรมใหม่ เดิมทำได้)

- [ ] **Step 6: อัปเดต CLAUDE.md**

เพิ่มหัวข้อใหม่ต่อจากบล็อก Phase 8:

```markdown
### Phase 9 — แก้ไขและลบตำแหน่งงาน
Spec/plan: `docs/superpowers/{specs,plans}/2026-09-07-job-edit-delete*`
- [x] Migration 018 — `analyses.job_id` nullable + FK `on delete cascade` + index
      **nullable โดยตั้งใจ** — การให้คะแนนจากหน้าผู้สมัครไม่มีงานผูกอยู่
      **แถวเก่าก่อน migration เป็น NULL ตลอดไป** กวาดย้อนหลังไม่ได้
- [x] **`analyses` ไม่เคยมีอะไรชี้กลับไปหางาน** มันคีย์ด้วย
      `(candidate_id, requirement_hash)` โดย hash มาจากข้อความความต้องการ ผลคือ
      **แก้งานหนึ่งครั้ง คะแนนที่ cache ไว้เข้าไม่ถึงอีกและไม่มีทางกวาด** เพราะ
      cascade ยิงเฉพาะตอนลบแถวใน `jobs` ส่วนงานที่แค่ถูกแก้ยังอยู่ `job_id` จึงยัง
      ถูกต้องแต่ hash ไม่ตรง — แถวนั้นอยู่ในสภาพ "ความสัมพันธ์ถูก แต่ไม่มีใครอ่านได้"
      **`updateJob` จึงต้องลบ `analyses where job_id = id` เองเมื่อ
      `requirementTextChanged`** ไม่งั้นทุกครั้งที่แก้งานจะทิ้งขยะเพิ่มถาวร
- [x] **ลบหลังบันทึกสำเร็จเท่านั้น** — ลบก่อนแล้วบันทึกล้ม = เสีย cache ฟรีทั้งที่งาน
      ยังเป็นข้อความเดิม และถ้าการลบล้มหลังบันทึกสำเร็จ **ห้ามโยน error**
      งานถูกบันทึกแล้วจริง บอกผู้ใช้ว่า "ล้มเหลว" ตอนนั้นจะผิด (เหตุผลเดียวกับ `logActivity`)
- [x] **`embedTextChanged` กับ `requirementTextChanged` ไม่ซ้ำซ้อนกัน อย่ายุบเป็นตัวเดียว**
      `category` อยู่ใน `buildJobEmbedText` แต่ไม่อยู่ใน `buildJobRequirementText`
      แก้หมวดงานจึงต้อง re-embed (เสียเงิน) แต่ cache คะแนนยังใช้ได้ มีเทสต์ดักไว้
- [x] **`POST /api/jobs` เดิมมีแค่ `getSession()`** — `member` คนไหนก็สร้างงานได้
      ตอนนี้กั้น `data_manager` เท่ากับ PATCH/DELETE **เป็นการเปลี่ยนพฤติกรรมของของเดิม**
- [x] **PATCH ตัด `source`/`external_id` ทิ้งที่ route** ไม่ใช่แค่ไม่แสดงในฟอร์ม —
      body มาจาก client ที่เชื่อไม่ได้ และการเปลี่ยน `external_id` อาจชนกับ
      unique constraint `(source, external_id)` แล้วพังแบบอธิบายยาก
- [x] **กับดัก seed เขียนทับไม่มีจริงสำหรับงานที่สร้างจากหน้าเว็บ** — งานจากฟอร์มได้
      `source: 'manual'`, `external_id: null` ส่วน `seed-jobs.ts` upsert บน
      `(source, external_id)` ด้วย `source: 'synthetic'` เท่านั้น **ต่างจากกรณี
      `candidates` ที่ทุกแถวมาจากแหล่งภายนอก** เสี่ยงเฉพาะสี่งานจาก seed
      ซึ่งจัดการด้วยแถบเตือน ไม่ใช่การห้าม
- [x] แก้บั๊กพ่วง: `upsertJob` และ `matchCandidatesForJob` ไม่เช็ค `error`
- **ยังไม่ได้แก้:** `scoreCandidateAgainst` อ่าน cache โดยไม่เช็ค `error` — ถ้าการอ่าน
  พังจะตกไปเรียก Gemini ใหม่ทุกครั้งโดยเงียบ (แพงแต่ไม่ผิด) อยู่นอก spec รอบนั้น
- **ยังไม่มี:** ประวัติการแก้ไขงาน (`activity_log` ยังไม่มี `entity_type = 'job'`),
  การกู้คืนงานที่ลบไปแล้ว, การแก้เป็นชุด
```

- [ ] **Step 7: Commit**

```bash
git add lib/jobs/update.int.test.ts CLAUDE.md
git commit -m "test(jobs): prove the cascade and stale-score cleanup against a real database"
```

---

## Self-Review

**ความครอบคลุมของ spec**

| หัวข้อใน spec | task |
|---|---|
| Migration 018 (คอลัมน์ + FK + index) | Task 1 Step 1-2 |
| `scoreCandidateAgainst` รับ `jobId` | Task 1 Step 3-4 |
| `embedTextChanged` / `requirementTextChanged` | Task 2 |
| `category` พิสูจน์ว่าสองฟังก์ชันต่างกัน | Task 2 Step 1, Step 5 (break check) |
| `updateJob` / `deleteJob` | Task 3 Step 1 |
| ลบ stale scores เมื่อ requirement เปลี่ยน + ลำดับหลังบันทึก | Task 3 Step 1 |
| PATCH/DELETE + ประตู `data_manager` | Task 4 Step 3 |
| ประตูให้ POST | Task 4 Step 5-6 |
| ตัด `source`/`external_id` | Task 4 Step 3, เทสต์ Step 1 |
| บั๊กพ่วง `upsertJob` + `matchCandidatesForJob` | Task 3 Step 2-3 |
| ฟอร์มเดียวสร้าง/แก้ | Task 5 Step 1-2 |
| หน้า `/jobs/[id]/edit` แยกเส้นทาง | Task 5 Step 4 |
| คำเตือน cache แบบสด | Task 5 Step 1 (`willVoidCache`) |
| ปุ่มลบ + กล่องยืนยัน | Task 5 Step 3 |
| แถบเตือนงานจาก seed | Task 5 Step 1 และ Step 3 |
| ปุ่มซ่อนจาก `member` | Task 5 Step 5 |
| เทสต์ unit / ประตูสิทธิ์ / integration | Task 2, Task 4, Task 6 |

ไม่มีหัวข้อไหนใน spec ที่ไม่มี task รองรับ

**สแกน placeholder:** ไม่มี TBD / TODO / "similar to Task N" / step ที่ไม่มีโค้ด

**ความสอดคล้องของชื่อและชนิด:**
`updateJob(id, patch) -> { reembedded, staleScoresRemoved } | null` ใช้ชื่อเดียวกันใน Task 3 (นิยาม), Task 4 (route + เทสต์), Task 5 (ผลลัพธ์ที่ฟอร์มได้รับ), Task 6 (integration) ·
`deleteJob(id) -> { deleted }` เหมือนกัน ·
`JobForm` รับ `{ job?: EditableJob; cachedScoreCount?: number }` ตรงกันระหว่าง Task 5 Step 1 (นิยาม) กับ Step 4 (ผู้เรียก) ·
`DeleteJobButton` รับ `{ jobId, title, seeded }` ตรงกันระหว่าง Step 3 กับ Step 5 ·
`embedTextChanged` / `requirementTextChanged` ตรงกันระหว่าง Task 2 กับ Task 3

**หมายเหตุเรื่องเทสต์:** Task 5 ไม่มี unit test เพราะ repo ตั้ง `environment: 'node'` และไม่มี jsdom หรือ React testing library การเพิ่มเข้ามาเพื่องานนี้เป็นการขยายขอบเขตที่ไม่ได้ตกลงกัน จึงพึ่ง `npm run build` กับรายการตรวจด้วยตา 12 ข้อใน Task 6 Step 5 แทน — และข้อ 10-12 ต้องใช้บัญชี `member` จริง ไม่ใช่แค่ดูด้วยตาจากบัญชีเดิม
