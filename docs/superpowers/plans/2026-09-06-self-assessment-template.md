# Self-assessment Review Template + Manual Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผ่า flow ประเมินตัวเองออกเป็นสองเฟส — อ่าน PDF แล้วให้ผู้ใช้ตรวจก่อน จึงค่อยวิเคราะห์ — พร้อมเปิดทางกรอกข้อมูลเองสำหรับคนที่ไม่มีไฟล์ CV

**Architecture:** `POST /api/self-assessment/parse` อ่าน PDF แล้วคืน draft กลับเบราว์เซอร์โดยไม่แตะฐานข้อมูล ผู้ใช้แก้ใน `ProfileForm` แล้วยิง `POST /api/self-assessment` ด้วย JSON ที่ยืนยันแล้ว ซึ่งไปวิเคราะห์ ทำ embedding และบันทึกในคำขอเดียว ตรรกะทั้งหมดอยู่ในโมดูล `lib/` ที่ทดสอบได้ ส่วน route เป็นชั้นบางที่ทำแค่ auth, แปลง body, และแปลง error

**Tech Stack:** Next.js 15 (App Router), Supabase (service-role client), Gemini `@google/genai` (`gemini-flash-latest`, `gemini-embedding-001`), plain CSS, Vitest — ไม่มี dependency ใหม่ ไม่มี migration ใหม่

**Spec:** `docs/superpowers/specs/2026-09-06-self-assessment-template-design.md`

## Global Constraints

- **Gemini SDK คือ `@google/genai` เท่านั้น** ห้าม `@google/generative-ai`
- **Embedding:** `gemini-embedding-001`, `outputDimensionality: 768`, `taskType: 'RETRIEVAL_DOCUMENT'` ตอน index
- **Generation:** `gemini-flash-latest`
- **ภาษา:** ค่าที่เก็บในฐานเป็น**อังกฤษ** ส่วนบทวิเคราะห์และข้อความที่ผู้ใช้อ่านเป็น**ไทย**
- **ไม่มี migration ใหม่** คอลัมน์ `self_profiles.raw_text` ยังอยู่ แต่เลิกเขียนค่าลงไป
- **ห้ามแตะ `buildEmbedText` ใน `lib/ingest/normalize.ts`** — ใช้ร่วมกับฝั่งผู้สมัคร แก้แล้ว `embed_hash` ของทั้งตาราง `candidates` เปลี่ยน ต้อง re-embed ใหม่หมด
- **ห้ามส่งข้อความ error ดิบจาก Postgres หรือ Gemini ให้ผู้ใช้** — `console.error` ฝั่งเซิร์ฟเวอร์ได้
- **`owner_id` มาจาก session เท่านั้น ห้ามรับจาก request body**
- **เพดานความยาวทุกตัวนับเป็น code point** (`String.length` ใน JS) ไม่ใช่ตัวอักษรที่ตาเห็น — ภาษาไทยใช้หลาย code point ต่อหนึ่งตัวอักษร
- **unit test ห้ามแตะเครือข่าย** ไฟล์ที่แตะ Supabase/Gemini จริงต้องชื่อ `*.int.test.ts` และห่อด้วย `tolerateOutage`
- คำสั่ง `npm` และ `git` **ต้องรันบน Windows** — sandbox รันไม่ได้

---

### Task 1: `lib/self/profileDraft.ts` — type, เพดาน, และการตรวจ

**Files:**
- Create: `lib/self/profileDraft.ts`
- Create: `lib/self/profileDraft.test.ts`

**Interfaces:**
- Consumes: `CandidateInput` จาก `lib/ingest/normalize.ts` (มีอยู่แล้ว)
- Produces:
  - `type DraftEducation = NonNullable<CandidateInput['education']>[number] & { gpa?: string }`
  - `type ProfileDraft = Omit<CandidateInput, 'source' | 'education' | 'raw'> & { education?: DraftEducation[] }`
  - `const LIMITS` — object ของเพดานทั้งหมด ฟอร์มใช้ตัวนี้ตั้ง `maxLength`
  - `function validateProfileDraft(input: unknown): { ok: true; draft: ProfileDraft } | { ok: false; field: string; message: string }`
  - `const EMPTY_DRAFT: ProfileDraft`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `lib/self/profileDraft.test.ts`:

```ts
import { validateProfileDraft, LIMITS, EMPTY_DRAFT } from './profileDraft'

const ok = (v: unknown) => {
  const r = validateProfileDraft(v)
  if (!r.ok) throw new Error(`คาดว่าผ่าน แต่ตกที่ ${r.field}: ${r.message}`)
  return r.draft
}

test('ต้องมี full_name', () => {
  const r = validateProfileDraft({ headline: 'Data Scientist' })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('full_name')
})

test('full_name ที่มีแต่ช่องว่างถือว่าไม่มี', () => {
  const r = validateProfileDraft({ full_name: '   ' })
  expect(r.ok).toBe(false)
})

test('ข้อความเกินเพดานถูกปฏิเสธพร้อมระบุช่อง ไม่ตัดให้เงียบๆ', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    summary: 'ก'.repeat(LIMITS.summary + 1),
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('summary')
})

test('การศึกษา 21 รายการเกินเพดาน', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    education: Array.from({ length: 21 }, () => ({ institution: 'X' })),
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('education')
})

test('การศึกษา 11 รายการยังผ่าน', () => {
  // prompt ขอ 10 รายการล่าสุด แต่เซิร์ฟเวอร์ยอมได้ถึง 20 เพราะเราบอกผู้ใช้ว่า
  // "เพิ่มเองได้" ถ้าใครมาปรับสองเพดานให้เท่ากัน ปุ่มเพิ่มรายการจะพังทันที
  // และเทสต์นี้คือสิ่งเดียวที่จะดักไว้
  const d = ok({
    full_name: 'Somchai Jaidee',
    education: Array.from({ length: 11 }, () => ({ institution: 'X' })),
  })
  expect(d.education).toHaveLength(11)
})

test('สกิล 51 รายการเกินเพดาน', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    skills: Array.from({ length: 51 }, (_, i) => `s${i}`),
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('skills')
})

test('gpa เป็นตัวเลขคงเป็น string ไม่ถูกแปลงเป็น number', () => {
  const d = ok({
    full_name: 'Somchai Jaidee',
    education: [{ institution: 'X', gpa: '3.45' }],
  })
  expect(d.education![0].gpa).toBe('3.45')
  expect(typeof d.education![0].gpa).toBe('string')
})

test('gpa เป็นข้อความไทยยาว 22 code point ผ่าน', () => {
  // ถ้าใครตั้งเพดาน gpa จากการนับตัวอักษรที่ตาเห็น เทสต์นี้จะแดง
  const honours = 'เกียรตินิยมอันดับหนึ่ง'
  expect(honours.length).toBe(22)
  const d = ok({ full_name: 'Somchai Jaidee', education: [{ gpa: honours }] })
  expect(d.education![0].gpa).toBe(honours)
})

test('ปีนอกช่วง 1900-2100 ถูกปฏิเสธ', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    education: [{ institution: 'X', end_year: 1800 }],
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('education.end_year')
})

test('วันที่ผิดรูปถูกปฏิเสธ ไม่เดาเติมให้', () => {
  for (const bad of ['2020', '01/2020', '2020-13-01']) {
    const r = validateProfileDraft({
      full_name: 'Somchai Jaidee',
      experience: [{ company: 'X', start_date: bad }],
    })
    expect(r.ok).toBe(false)
  }
})

test('end_date เป็น null ได้ หมายถึงตำแหน่งปัจจุบัน', () => {
  const d = ok({
    full_name: 'Somchai Jaidee',
    experience: [{ company: 'X', start_date: '2020-01-01', end_date: null }],
  })
  expect(d.experience![0].end_date).toBeUndefined()
})

test('ฟิลด์ที่ไม่รู้จักถูกตัดทิ้ง ไม่ไหลลงฐานผ่าน jsonb', () => {
  const d = ok({
    full_name: 'Somchai Jaidee',
    owner_id: 'attacker-uuid',
    religion: 'พุทธ',
    education: [{ institution: 'X', evil: 1 }],
  }) as Record<string, unknown>
  expect(d.owner_id).toBeUndefined()
  expect(d.religion).toBeUndefined()
  expect((d.education as Record<string, unknown>[])[0].evil).toBeUndefined()
})

test('ค่าที่ผ่านถูกตัดช่องว่างหัวท้าย และช่องว่างเปล่าหายไป', () => {
  const d = ok({ full_name: '  Somchai Jaidee  ', headline: '   ' })
  expect(d.full_name).toBe('Somchai Jaidee')
  expect(d.headline).toBeUndefined()
})

test('EMPTY_DRAFT ผ่านไม่ได้เพราะยังไม่มีชื่อ', () => {
  expect(validateProfileDraft(EMPTY_DRAFT).ok).toBe(false)
})
```

- [ ] **Step 2: รันเทสต์เพื่อยืนยันว่าตก**

Run: `npx vitest run lib/self/profileDraft.test.ts`
Expected: FAIL — `Cannot find module './profileDraft'`

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `lib/self/profileDraft.ts`:

```ts
import type { CandidateInput } from '@/lib/ingest/normalize'

// รูปร่างของข้อมูลที่ผู้ใช้ตรวจและยืนยันใน template ก่อนส่งไปวิเคราะห์
//
// ต่างจาก CandidateInput สองอย่าง: มี gpa ต่อรายการการศึกษา (ฝั่งผู้สมัครไม่มี)
// และไม่มี source เพราะ client ไม่ควรกำหนดที่มาของข้อมูลตัวเอง — createProfile
// เป็นคนใส่ให้
export type DraftEducation = NonNullable<CandidateInput['education']>[number] & {
  gpa?: string
}
export type ProfileDraft = Omit<CandidateInput, 'source' | 'education' | 'raw'> & {
  education?: DraftEducation[]
}

// เพดานทุกตัวนับเป็น code point (String.length) ไม่ใช่ตัวอักษรที่ตาเห็น
// ภาษาไทยใช้หลาย code point ต่อหนึ่งตัวอักษร เช่น "เกียรตินิยมอันดับหนึ่ง"
// ยาว 22 code point ทั้งที่ดูสั้น เพดานที่ตั้งจากการนับด้วยตาจะตัดค่าที่ถูกต้องทิ้ง
export const LIMITS = {
  full_name: 120,
  headline: 200,
  industry: 120,
  location: 120,
  summary: 2000,
  education: 20,
  institution: 200,
  country: 60,
  degree: 120,
  field_of_study: 120,
  gpa: 60,
  experience: 20,
  company: 200,
  title: 200,
  description: 1000,
  skills: 50,
  skill: 60,
  yearMin: 1900,
  yearMax: 2100,
} as const

// prompt ขอ 10 รายการล่าสุดเพื่อให้ฟอร์มสั้น ส่วนเพดานเซิร์ฟเวอร์ข้างบนเป็น 20
// เพราะเราบอกผู้ใช้ว่าเพิ่มเองได้ ถ้าสองค่านี้เท่ากันคำเชิญนั้นจะเป็นคำโกหก
export const PARSE_ENTRY_LIMIT = 10

export const EMPTY_DRAFT: ProfileDraft = {
  full_name: '',
  headline: '',
  industry: '',
  location: '',
  summary: '',
  education: [],
  experience: [],
  skills: [],
}

type Fail = { ok: false; field: string; message: string }
type Pass = { ok: true; draft: ProfileDraft }

const fail = (field: string, message: string): Fail => ({ ok: false, field, message })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// คืน undefined เมื่อค่าว่าง เพื่อให้ filter(Boolean) ใน buildEmbedText ทำงานเหมือนเดิม
function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t : undefined
}

function tooLong(v: string | undefined, max: number): boolean {
  return v !== undefined && v.length > max
}

function year(v: unknown): number | undefined | null {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  if (!Number.isInteger(n)) return null
  if (n < LIMITS.yearMin || n > LIMITS.yearMax) return null
  return n
}

// วันที่ต้องตรงรูป YYYY-MM-DD และต้องเป็นวันที่ที่มีจริง
// null = ตำแหน่งปัจจุบัน ซึ่งเป็นความหมายเดียวกับที่ computeYearsExperience ใช้
function isoDate(v: unknown): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return null
  const d = new Date(v)
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null
  return v
}

export function validateProfileDraft(input: unknown): Pass | Fail {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('_', 'รูปแบบข้อมูลไม่ถูกต้อง')
  }
  const i = input as Record<string, unknown>

  const full_name = str(i.full_name)
  if (!full_name) return fail('full_name', 'กรุณากรอกชื่อ')
  if (tooLong(full_name, LIMITS.full_name)) return fail('full_name', 'ชื่อยาวเกินไป')

  const headline = str(i.headline)
  if (tooLong(headline, LIMITS.headline)) return fail('headline', 'ตำแหน่งย่อยาวเกินไป')
  const industry = str(i.industry)
  if (tooLong(industry, LIMITS.industry)) return fail('industry', 'อุตสาหกรรมยาวเกินไป')
  const location = str(i.location)
  if (tooLong(location, LIMITS.location)) return fail('location', 'สถานที่ยาวเกินไป')
  const summary = str(i.summary)
  if (tooLong(summary, LIMITS.summary)) return fail('summary', 'ข้อความแนะนำตัวยาวเกินไป')

  // --- การศึกษา ---
  const eduRaw = Array.isArray(i.education) ? i.education : []
  if (eduRaw.length > LIMITS.education) {
    return fail('education', `การศึกษาเกิน ${LIMITS.education} รายการ`)
  }
  const education: DraftEducation[] = []
  for (const e of eduRaw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const institution = str(r.institution)
    if (tooLong(institution, LIMITS.institution)) return fail('education.institution', 'ชื่อสถาบันยาวเกินไป')
    const country = str(r.country)
    if (tooLong(country, LIMITS.country)) return fail('education.country', 'ชื่อประเทศยาวเกินไป')
    const degree = str(r.degree)
    if (tooLong(degree, LIMITS.degree)) return fail('education.degree', 'วุฒิยาวเกินไป')
    const field_of_study = str(r.field_of_study)
    if (tooLong(field_of_study, LIMITS.field_of_study)) return fail('education.field_of_study', 'สาขายาวเกินไป')
    // gpa เป็น string เสมอ เพราะสเกลไม่เหมือนกัน — 3.45 จากระบบ 4.0,
    // 4.2 จากระบบ 5.0, "เกียรตินิยมอันดับหนึ่ง" ล้วนถูกต้อง
    const gpa = str(r.gpa)
    if (tooLong(gpa, LIMITS.gpa)) return fail('education.gpa', 'ผลการเรียนยาวเกินไป')
    const start_year = year(r.start_year)
    if (start_year === null) return fail('education.start_year', 'ปีเริ่มไม่ถูกต้อง')
    const end_year = year(r.end_year)
    if (end_year === null) return fail('education.end_year', 'ปีจบไม่ถูกต้อง')

    const item: DraftEducation = {}
    if (institution) item.institution = institution
    if (country) item.country = country
    if (degree) item.degree = degree
    if (field_of_study) item.field_of_study = field_of_study
    if (gpa) item.gpa = gpa
    if (start_year !== undefined) item.start_year = start_year
    if (end_year !== undefined) item.end_year = end_year
    if (Object.keys(item).length) education.push(item)
  }

  // --- ประสบการณ์ ---
  const expRaw = Array.isArray(i.experience) ? i.experience : []
  if (expRaw.length > LIMITS.experience) {
    return fail('experience', `ประสบการณ์เกิน ${LIMITS.experience} รายการ`)
  }
  const experience: NonNullable<ProfileDraft['experience']> = []
  for (const e of expRaw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const company = str(r.company)
    if (tooLong(company, LIMITS.company)) return fail('experience.company', 'ชื่อบริษัทยาวเกินไป')
    const title = str(r.title)
    if (tooLong(title, LIMITS.title)) return fail('experience.title', 'ชื่อตำแหน่งยาวเกินไป')
    const description = str(r.description)
    if (tooLong(description, LIMITS.description)) return fail('experience.description', 'รายละเอียดยาวเกินไป')
    const start_date = isoDate(r.start_date)
    if (start_date === null) return fail('experience.start_date', 'วันที่เริ่มต้องเป็นรูปแบบ YYYY-MM-DD')
    const end_date = isoDate(r.end_date)
    if (end_date === null) return fail('experience.end_date', 'วันที่สิ้นสุดต้องเป็นรูปแบบ YYYY-MM-DD')

    const item: NonNullable<ProfileDraft['experience']>[number] = {}
    if (company) item.company = company
    if (title) item.title = title
    if (description) item.description = description
    if (start_date) item.start_date = start_date
    if (end_date) item.end_date = end_date
    if (Object.keys(item).length) experience.push(item)
  }

  // --- สกิล ---
  const skillsRaw = Array.isArray(i.skills) ? i.skills : []
  if (skillsRaw.length > LIMITS.skills) {
    return fail('skills', `สกิลเกิน ${LIMITS.skills} รายการ`)
  }
  const skills: string[] = []
  for (const s of skillsRaw) {
    const v = str(s)
    if (!v) continue
    if (tooLong(v, LIMITS.skill)) return fail('skills', 'ชื่อสกิลยาวเกินไป')
    skills.push(v)
  }

  // ประกอบใหม่จากค่าที่ตรวจแล้วเท่านั้น — ไม่ spread ของเดิม เพื่อให้ฟิลด์ที่ไม่รู้จัก
  // (owner_id, ข้อมูลอ่อนไหว, อะไรก็ตามที่ยิงมา) หายไปโดยอัตโนมัติ ไม่ใช่ต้องไล่ลบทีละตัว
  const draft: ProfileDraft = { full_name }
  if (headline) draft.headline = headline
  if (industry) draft.industry = industry
  if (location) draft.location = location
  if (summary) draft.summary = summary
  if (education.length) draft.education = education
  if (experience.length) draft.experience = experience
  if (skills.length) draft.skills = skills

  return { ok: true, draft }
}
```

- [ ] **Step 4: รันเทสต์เพื่อยืนยันว่าผ่าน**

Run: `npx vitest run lib/self/profileDraft.test.ts`
Expected: PASS ทั้ง 13 เทสต์

- [ ] **Step 5: รันชุด unit ทั้งหมดเพื่อยืนยันว่าไม่พังของเดิม**

Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 6: Commit**

```bash
git add lib/self/profileDraft.ts lib/self/profileDraft.test.ts
git commit -m "feat(self): add ProfileDraft type and server-side validation"
```

---

### Task 2: `lib/gemini/parsePdf.ts` — เพิ่ม industry, ตัด raw_text, จำกัดรายการ, กันข้อมูลอ่อนไหว

**Files:**
- Modify: `lib/gemini/parsePdf.ts` (เขียนใหม่ทั้งไฟล์)
- Create: `lib/gemini/parsePdf.test.ts`

**Interfaces:**
- Consumes: `ProfileDraft`, `validateProfileDraft`, `PARSE_ENTRY_LIMIT` จาก Task 1
- Produces:
  - `function parseProfileResponse(text: string): ProfileDraft` — ฟังก์ชันบริสุทธิ์ แยกออกมาเพื่อทดสอบได้โดยไม่แตะเครือข่าย โยน `Error` เมื่อ JSON เสียหรือไม่มีชื่อ
  - `function parsePdfProfile(pdfBase64: string): Promise<ProfileDraft>` — **เปลี่ยน return type** จากเดิมที่คืน `{ profile, raw_text }`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `lib/gemini/parsePdf.test.ts`:

```ts
import { parseProfileResponse } from './parsePdf'

const wrap = (profile: unknown) => JSON.stringify({ profile })

test('อ่าน JSON ปกติได้', () => {
  const d = parseProfileResponse(
    wrap({ full_name: 'Somchai Jaidee', headline: 'Data Scientist', industry: 'Banking' })
  )
  expect(d.full_name).toBe('Somchai Jaidee')
  expect(d.industry).toBe('Banking')
})

test('แกะ JSON ออกจาก markdown fence ได้', () => {
  const d = parseProfileResponse('```json\n' + wrap({ full_name: 'Somchai Jaidee' }) + '\n```')
  expect(d.full_name).toBe('Somchai Jaidee')
})

test('ไม่มีชื่อ ถือว่าอ่านไม่สำเร็จ', () => {
  expect(() => parseProfileResponse(wrap({ headline: 'Data Scientist' }))).toThrow()
})

test('JSON เสีย โยน error', () => {
  expect(() => parseProfileResponse('ไม่ใช่ JSON เลย')).toThrow()
})

test('ผลลัพธ์ไม่มี raw_text แม้โมเดลจะส่งกลับมา', () => {
  // เลิกเก็บ raw_text แล้ว แต่โมเดลอาจยังส่งมาเองจากความเคยชินของ schema
  // ถ้าหลุดเข้าไปได้ มันจะถูกเขียนลง jsonb แล้วเรากลับไปเก็บ CV ฉบับเต็มโดยไม่ตั้งใจ
  const d = parseProfileResponse(
    JSON.stringify({ profile: { full_name: 'Somchai Jaidee' }, raw_text: 'ข้อความเต็มทั้งฉบับ' })
  ) as Record<string, unknown>
  expect(d.raw_text).toBeUndefined()
})

test('ตัดรายการส่วนเกินให้เหลือตามเพดาน แม้โมเดลจะส่งเกินมา', () => {
  const d = parseProfileResponse(
    wrap({
      full_name: 'Somchai Jaidee',
      experience: Array.from({ length: 40 }, (_, i) => ({ company: `C${i}`, title: 'Dev' })),
    })
  )
  expect(d.experience!.length).toBeLessThanOrEqual(20)
})

test('วันที่ผิดรูปจากโมเดลถูกทิ้ง ไม่ทำให้ทั้งไฟล์อ่านไม่สำเร็จ', () => {
  // โมเดลพลาดรูปวันที่บ่อยแม้ prompt จะสั่งไว้ ถ้าปล่อยให้ตกที่ validateProfileDraft
  // ผู้ใช้จะเจอ "อ่านไฟล์ไม่สำเร็จ" ทั้งที่อ่านได้ครบ เพราะวันที่เดียวผิด
  // ซึ่งเป็นการทิ้งงานที่สำเร็จแล้ว — สิ่งเดียวกับที่ flow นี้ตั้งใจเลิกทำ
  //
  // ผู้ใช้ตรวจฟอร์มอยู่แล้ว ปล่อยช่องว่างให้เขาเติมดีกว่าปฏิเสธทั้งไฟล์
  const d = parseProfileResponse(
    wrap({
      full_name: 'Somchai Jaidee',
      experience: [{ company: 'Agoda', title: 'Dev', start_date: '2020', end_date: 'present' }],
    })
  )
  expect(d.experience![0].company).toBe('Agoda')
  expect(d.experience![0].start_date).toBeUndefined()
})

test('ปีนอกช่วงจากโมเดลถูกทิ้ง ไม่ทำให้ทั้งไฟล์อ่านไม่สำเร็จ', () => {
  const d = parseProfileResponse(
    wrap({ full_name: 'Somchai Jaidee', education: [{ institution: 'X', end_year: 0 }] })
  )
  expect(d.education![0].institution).toBe('X')
  expect(d.education![0].end_year).toBeUndefined()
})

test('ข้อความยาวเกินจากโมเดลถูกตัด ไม่ปฏิเสธทั้งไฟล์', () => {
  const d = parseProfileResponse(
    wrap({ full_name: 'Somchai Jaidee', summary: 'ก'.repeat(5000) })
  )
  expect(d.summary!.length).toBeLessThanOrEqual(2000)
})
```

- [ ] **Step 2: รันเทสต์เพื่อยืนยันว่าตก**

Run: `npx vitest run lib/gemini/parsePdf.test.ts`
Expected: FAIL — `parseProfileResponse` ไม่ถูก export

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

เขียน `lib/gemini/parsePdf.ts` ใหม่ทั้งไฟล์:

```ts
import { getGemini } from './client'
import {
  validateProfileDraft,
  PARSE_ENTRY_LIMIT,
  LIMITS,
  type ProfileDraft,
} from '@/lib/self/profileDraft'

// อ่าน resume/CV PDF ด้วย Gemini โดยตรง (ไม่ต้องมีไลบรารีอ่าน PDF) รองรับไฟล์ที่
// สแกนมาเป็นรูปด้วย เพราะโมเดลมองเห็นหน้ากระดาษจริง
//
// ผลที่ได้เป็นเพียง "ร่าง" ผู้ใช้ต้องตรวจและยืนยันก่อนถึงจะถูกวิเคราะห์และบันทึก
// ฟังก์ชันนี้จึงไม่แตะฐานข้อมูลเลย
const PROMPT = `Read this resume/CV PDF and return JSON only, matching this schema:
{"profile":{"full_name":"","headline":"","industry":"","location":"","summary":"","skills":[],"education":[{"institution":"","country":"","degree":"","field_of_study":"","start_year":0,"end_year":0,"gpa":""}],"experience":[{"company":"","title":"","start_date":"","end_date":"","description":""}]}}

Rules:
- The source document may be in Thai, English, or a mix. Handle any language.
- Output ALL values in ENGLISH. Translate or romanize Thai (e.g. a Thai name becomes "Somchai Jaidee", a Thai university becomes its English name).
- "industry" is the sector the person works in, e.g. "Banking", "Healthcare", "Software". Infer it from their roles. Omit if genuinely unclear.
- "gpa" is a STRING, copied as written. Keep the scale if stated ("3.45/4.00"). Honours wording such as "First Class Honours" is a valid value. Never convert between scales.
- Return AT MOST ${PARSE_ENTRY_LIMIT} education entries and AT MOST ${PARSE_ENTRY_LIMIT} experience entries — the MOST RECENT ones. Drop older entries.
- Dates in "experience" must be strict ISO "YYYY-MM-DD". Use null for end_date of a current role. If only a year is stated, use the first of January ("2020-01-01").
- NEVER extract date of birth, age, religion, marital status, nationality, race, height, weight, health information, national ID number, or any photograph. Omit them entirely, including from "summary". They are not relevant to job matching.
- Omit a field or use null when the document does not state it. Never invent facts.
- Do NOT return the full text of the document. Only the structured fields above.`

// แยกการแกะคำตอบออกจากการเรียกเครือข่าย เพื่อให้ทดสอบเป็น unit ได้
export function parseProfileResponse(text: string): ProfileDraft {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  let parsed: any
  try {
    parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned)
  } catch {
    throw new Error('gemini returned unparseable JSON for the PDF')
  }

  const profile = parsed?.profile
  if (!profile || typeof profile !== 'object') {
    throw new Error('gemini could not extract a profile from the PDF')
  }

  // ผ่านตัวตรวจตัวเดียวกับที่ route ใช้ ทำให้ร่างจาก AI กับร่างที่คนกรอกเอง
  // อยู่ภายใต้กติกาเดียวกัน และฟิลด์แปลกปลอม (รวมถึง raw_text) ถูกตัดทิ้งที่นี่
  const r = validateProfileDraft(coerceForReview(profile))
  if (!r.ok) throw new Error(`gemini profile failed validation at ${r.field}`)
  return r.draft
}

// ผ่อนปรนกับผลจากโมเดลก่อนส่งเข้าตัวตรวจ — **ตั้งใจให้ต่างจากด่านฝั่ง route**
//
// ด่านของ route เข้มงวดเพราะผู้ส่งคือเบราว์เซอร์ที่อาจเป็นใครก็ได้ ส่วนตรงนี้ผู้ส่งคือ
// โมเดลของเราเอง และผลจะถูกมนุษย์ตรวจต่ออีกชั้นอยู่แล้ว
//
// ถ้าไม่ผ่อนปรน วันที่ผิดรูปเพียงตัวเดียว — ซึ่งโมเดลพลาดบ่อยแม้ prompt จะสั่งไว้ —
// จะทำให้ผู้ใช้เจอ "อ่านไฟล์ไม่สำเร็จ" ทั้งที่อ่านได้ครบ นั่นคือการทิ้งงานที่สำเร็จแล้ว
// ซึ่งเป็นสิ่งเดียวกับที่ flow นี้ตั้งใจเลิกทำ ปล่อยช่องว่างให้ผู้ใช้เติมดีกว่ามาก
function coerceForReview(p: any): any {
  const cut = (v: unknown, max: number) =>
    typeof v === 'string' ? v.slice(0, max) : undefined
  const iso = (v: unknown) =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
  const yr = (v: unknown) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= LIMITS.yearMin && n <= LIMITS.yearMax ? n : undefined
  }

  return {
    full_name: cut(p.full_name, LIMITS.full_name),
    headline: cut(p.headline, LIMITS.headline),
    industry: cut(p.industry, LIMITS.industry),
    location: cut(p.location, LIMITS.location),
    summary: cut(p.summary, LIMITS.summary),
    education: (Array.isArray(p.education) ? p.education : [])
      .slice(0, LIMITS.education)
      .filter((e: unknown) => e && typeof e === 'object')
      .map((e: any) => ({
        institution: cut(e.institution, LIMITS.institution),
        country: cut(e.country, LIMITS.country),
        degree: cut(e.degree, LIMITS.degree),
        field_of_study: cut(e.field_of_study, LIMITS.field_of_study),
        // gpa เป็น string เสมอ โมเดลอาจคืนเป็น number มา จึงแปลงก่อนตัด
        gpa: cut(e.gpa == null ? undefined : String(e.gpa), LIMITS.gpa),
        start_year: yr(e.start_year),
        end_year: yr(e.end_year),
      })),
    experience: (Array.isArray(p.experience) ? p.experience : [])
      .slice(0, LIMITS.experience)
      .filter((e: unknown) => e && typeof e === 'object')
      .map((e: any) => ({
        company: cut(e.company, LIMITS.company),
        title: cut(e.title, LIMITS.title),
        description: cut(e.description, LIMITS.description),
        start_date: iso(e.start_date),
        end_date: iso(e.end_date),
      })),
    skills: (Array.isArray(p.skills) ? p.skills : [])
      .slice(0, LIMITS.skills)
      .map((s: unknown) => cut(s, LIMITS.skill))
      .filter(Boolean),
  }
}

export async function parsePdfProfile(pdfBase64: string): Promise<ProfileDraft> {
  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [
          // เอกสาร Gemini แนะนำให้วาง part ของไฟล์ก่อนข้อความ prompt
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          { text: PROMPT },
        ],
      },
    ],
    config: { responseMimeType: 'application/json' },
  })

  return parseProfileResponse(res.text ?? '')
}
```

- [ ] **Step 4: รันเทสต์เพื่อยืนยันว่าผ่าน**

Run: `npx vitest run lib/gemini/parsePdf.test.ts`
Expected: PASS ทั้ง 9 เทสต์

- [ ] **Step 5: ตรวจว่าไม่มีที่ไหนยังใช้ `raw_text` จาก parsePdf**

Run: `npx tsc --noEmit`
Expected: อาจมี error ที่ `app/api/self-assessment/route.ts` เพราะยังอ่าน `parsed.raw_text` อยู่ — **ปล่อยไว้ก่อน จะแก้ใน Task 6** ถ้ามี error ที่ไฟล์อื่นให้หยุดและรายงาน

- [ ] **Step 6: Commit**

```bash
git add lib/gemini/parsePdf.ts lib/gemini/parsePdf.test.ts
git commit -m "feat(self): parse PDF into ProfileDraft, add industry+gpa, drop raw_text"
```

---

### Task 3: `lib/gemini/assess.ts` — ส่งจำนวนปีประสบการณ์ที่คำนวณแล้วเข้า prompt

**Files:**
- Modify: `lib/gemini/assess.ts`
- Create: `lib/gemini/assess.test.ts`

**Interfaces:**
- Consumes: `ProfileDraft` (Task 1), `computeYearsExperience` จาก `lib/ingest/normalize.ts` (มีอยู่แล้ว)
- Produces:
  - `function buildAssessPrompt(profile: ProfileDraft, yearsExperience: number): string`
  - `function assessProfile(profile: ProfileDraft): Promise<Assessment>` — signature เดิม แต่คำนวณปีให้เองข้างใน

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `lib/gemini/assess.test.ts`:

```ts
import { buildAssessPrompt } from './assess'

test('prompt มีจำนวนปีประสบการณ์เป็นตัวเลขสำเร็จ', () => {
  // โมเดลบวกลบวันที่พลาดบ่อย ระบบมี computeYearsExperience อยู่แล้ว
  // การส่งตัวเลขที่คำนวณแล้วเข้าไปถูกและถูกกว่าการให้โมเดลคิดเอง
  const p = buildAssessPrompt({ full_name: 'Somchai Jaidee' }, 7)
  expect(p).toContain('7')
  expect(p).toMatch(/ประสบการณ์/)
})

test('prompt มีผลการเรียนเมื่อมีในโปรไฟล์', () => {
  const p = buildAssessPrompt(
    { full_name: 'Somchai Jaidee', education: [{ institution: 'X', gpa: '3.45' }] },
    0
  )
  expect(p).toContain('3.45')
})

test('prompt สั่งให้ตอบเป็นไทยและอ้างอิงเฉพาะข้อมูลที่มี', () => {
  const p = buildAssessPrompt({ full_name: 'Somchai Jaidee' }, 0)
  expect(p).toContain('ภาษาไทย')
  expect(p).toContain('ห้ามสมมติ')
})
```

- [ ] **Step 2: รันเทสต์เพื่อยืนยันว่าตก**

Run: `npx vitest run lib/gemini/assess.test.ts`
Expected: FAIL — `buildAssessPrompt` ไม่ถูก export

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

แก้ `lib/gemini/assess.ts` — เปลี่ยน import, แยก `buildAssessPrompt` ออกมา, และคำนวณปีก่อนเรียก:

```ts
import { getGemini } from './client'
import { computeYearsExperience } from '@/lib/ingest/normalize'
import type { ProfileDraft } from '@/lib/self/profileDraft'
import { normalizeAssessment, type Assessment } from '@/lib/self/assessmentShape'

// วิเคราะห์โปรไฟล์เป็นจุดแข็ง จุดอ่อน และสิ่งที่ควรพัฒนา ผลลัพธ์เป็นภาษาไทย
// ตามกติกาว่า reasoning/advice ที่ผู้ใช้อ่านเป็นไทย ขณะที่ข้อมูลใน DB เป็นอังกฤษ
//
// แยกจาก parsePdfProfile เพราะคนละธรรมชาติ — อันนั้นสกัดข้อเท็จจริง อันนี้ตัดสิน
// แยกแล้วปรับ prompt ทีละตัวได้ และประเมินใหม่ได้จาก parsed_data ที่เก็บไว้
// โดยไม่ต้องให้ผู้ใช้อัปโหลด PDF ซ้ำ

// แยกการประกอบ prompt ออกมาเพื่อทดสอบเป็น unit ได้โดยไม่แตะเครือข่าย
export function buildAssessPrompt(profile: ProfileDraft, yearsExperience: number): string {
  return `วิเคราะห์โปรไฟล์ผู้สมัครต่อไปนี้ ตอบเป็น JSON เท่านั้น ทุกข้อความเป็นภาษาไทย

{"strengths":["จุดแข็ง"],"weaknesses":["จุดที่ยังขาด"],"development":["สิ่งที่ควรพัฒนาต่อ"],"summary":"ภาพรวมสั้นๆ 1-2 ประโยค"}

เงื่อนไข:
- strengths, weaknesses, development อย่างละ 2-4 ข้อ สั้นและเจาะจง
- อ้างอิงจากข้อมูลในโปรไฟล์เท่านั้น ห้ามสมมติสิ่งที่ไม่ปรากฏ
- ใช้น้ำเสียงให้กำลังใจและสร้างสรรค์ ไม่ตัดสินคุณค่าของบุคคล
- ถ้ามีผลการเรียน (gpa) ให้พูดถึงได้ แต่อย่าเทียบข้ามสเกลที่ต่างกัน

รวมประสบการณ์ทำงานประมาณ ${yearsExperience} ปี (คำนวณจากวันที่ในโปรไฟล์แล้ว ใช้ตัวเลขนี้ ไม่ต้องคำนวณเอง)

โปรไฟล์: ${JSON.stringify(profile)}`
}

export async function assessProfile(profile: ProfileDraft): Promise<Assessment> {
  const years = computeYearsExperience(profile.experience ?? [])

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: buildAssessPrompt(profile, years),
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

- [ ] **Step 4: รันเทสต์เพื่อยืนยันว่าผ่าน**

Run: `npx vitest run lib/gemini/assess.test.ts`
Expected: PASS ทั้ง 3 เทสต์

- [ ] **Step 5: Commit**

```bash
git add lib/gemini/assess.ts lib/gemini/assess.test.ts
git commit -m "feat(self): pass precomputed years of experience into assess prompt"
```

---

### Task 4: `lib/self/createProfile.ts` — วิเคราะห์ ทำ embedding และบันทึก

**Files:**
- Create: `lib/self/createProfile.ts`
- Create: `lib/self/createProfile.int.test.ts`

**Interfaces:**
- Consumes: `ProfileDraft` (Task 1), `assessProfile` (Task 3), `embedText` และ `buildEmbedText` (มีอยู่แล้ว), `getServerClient` (มีอยู่แล้ว)
- Produces: `function createSelfProfile(draft: ProfileDraft, userId: string, fileName?: string): Promise<string>` — คืน `id` ของแถวใหม่ โยน `Error` เมื่อล้ม

ตรรกะอยู่ในโมดูล ไม่ใช่ใน route เพราะ route handler ต้องมี session cookie จริงถึงจะเรียกได้ ทำให้เขียน integration test ตรงๆ ไม่ได้ ส่วนโมดูลเรียกได้เลย — เป็นแบบเดียวกับ `lib/jobs/upsert.ts` ที่มี `upsert.int.test.ts` อยู่แล้ว

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `lib/self/createProfile.int.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { createSelfProfile } from './createProfile'
import { tolerateOutage } from '@/test-utils/integration'

// Integration: ต้องมี Supabase env + Gemini key (เรียก assess และ embed จริง)
// ใช้ owner_id ของ profile ที่มีอยู่จริงเพราะมี FK ไป profiles(id)

async function anyUserId(): Promise<string | null> {
  const { data } = await getServerClient().from('profiles').select('id').limit(1).maybeSingle()
  return (data as any)?.id ?? null
}

test('createSelfProfile บันทึกแถวพร้อม embedding 768 มิติ และไม่เขียน raw_text', async (ctx) => {
  await tolerateOutage(ctx, async () => {
    const userId = await anyUserId()
    if (!userId) {
      console.warn('\n  ⏭  ข้ามเทสต์ — ยังไม่มีผู้ใช้ในตาราง profiles\n')
      return ctx.skip()
    }

    const id = await createSelfProfile(
      {
        full_name: '__test__ Somchai Jaidee',
        headline: 'Data Scientist',
        industry: 'Banking',
        summary: 'Ten years building forecasting models.',
        education: [{ institution: 'University of Michigan', country: 'USA', degree: 'MS', gpa: '3.45' }],
        experience: [{ company: 'Agoda', title: 'Data Scientist', start_date: '2018-01-01' }],
        skills: ['Python', 'SQL'],
      },
      userId
    )
    expect(typeof id).toBe('string')

    const { data } = await getServerClient()
      .from('self_profiles')
      .select('raw_text, parsed_data, assessment, embedding')
      .eq('id', id)
      .single()

    const row = data as any
    expect(row.raw_text).toBeNull()
    expect(row.parsed_data.full_name).toBe('__test__ Somchai Jaidee')
    // gpa ต้องอยู่ใน parsed_data แม้จะไม่เข้า embedding
    expect(row.parsed_data.education[0].gpa).toBe('3.45')
    expect(row.assessment.summary.length).toBeGreaterThan(0)

    // Supabase คืน vector เป็น string ของ JSON array
    const vec = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding
    expect(vec).toHaveLength(768)

    await getServerClient().from('self_profiles').delete().eq('id', id)
  })
}, 60000)
```

- [ ] **Step 2: รันเทสต์เพื่อยืนยันว่าตก**

Run: `npx vitest run --config vitest.integration.config.ts lib/self/createProfile.int.test.ts`
Expected: FAIL — `Cannot find module './createProfile'`

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `lib/self/createProfile.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { assessProfile } from '@/lib/gemini/assess'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText, type CandidateInput } from '@/lib/ingest/normalize'
import type { ProfileDraft } from './profileDraft'

// รับร่างที่ผู้ใช้ยืนยันแล้ว ไปวิเคราะห์ ทำ embedding และบันทึกเป็นแถวเดียว
//
// ถ้าขั้นไหนล้ม ไม่เขียนอะไรลงฐานเลย — โปรไฟล์ที่ไม่มี embedding จะไม่โผล่ในการ
// จัดอันดับงานโดยไม่มีใครรู้สาเหตุ ซึ่งเป็นข้อมูลเสียแบบเงียบ
//
// ไม่เขียน raw_text อีกแล้ว คอลัมน์ยังอยู่ในตาราง (migration เป็น additive) แต่
// ไม่มีใครอ่าน และผู้ใช้เป็นคนรับรองข้อมูลเองแล้ว ร่องรอยนั้นจึงหมดความหมาย
export async function createSelfProfile(
  draft: ProfileDraft,
  userId: string,
  fileName?: string
): Promise<string> {
  // source กำหนดฝั่งเซิร์ฟเวอร์เสมอ ไม่รับจาก client
  const profile: CandidateInput = { ...draft, source: 'upload' }

  const assessment = await assessProfile(draft)
  // gpa ไม่เข้า embedding โดยตั้งใจ — buildEmbedText ไม่ได้อ่านฟิลด์นี้ และห้าม
  // แก้ให้อ่าน เพราะมันใช้ร่วมกับฝั่งผู้สมัคร การแตะทำให้ embed_hash ของทั้งตาราง
  // candidates เปลี่ยน แล้วต้อง re-embed ใหม่หมด
  const embedding = await embedText(buildEmbedText(profile), 'RETRIEVAL_DOCUMENT')

  const { data, error } = await getServerClient()
    .from('self_profiles')
    .insert({
      owner_id: userId,
      file_name: fileName ?? null,
      parsed_data: draft,
      assessment,
      embedding,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('createSelfProfile insert failed:', error)
    throw new Error('insert failed')
  }
  return (data as any).id as string
}
```

- [ ] **Step 4: รันเทสต์เพื่อยืนยันว่าผ่าน**

Run: `npx vitest run --config vitest.integration.config.ts lib/self/createProfile.int.test.ts`
Expected: PASS (หรือ skip พร้อมข้อความ ถ้า Gemini ไม่ว่าง — ทั้งสองอย่างถือว่าผ่าน)

- [ ] **Step 5: Commit**

```bash
git add lib/self/createProfile.ts lib/self/createProfile.int.test.ts
git commit -m "feat(self): add createSelfProfile — assess, embed, insert in one unit"
```

---

### Task 5: `POST /api/self-assessment/parse` — เฟสอ่านไฟล์ ไม่แตะฐานข้อมูล

**Files:**
- Create: `app/api/self-assessment/parse/route.ts`
- Create: `app/api/self-assessment/parse/route.test.ts`

**Interfaces:**
- Consumes: `parsePdfProfile` (Task 2), `validateUpload` (มีอยู่แล้ว), `getSession` (มีอยู่แล้ว)
- Produces: `POST` handler คืน `{ draft: ProfileDraft, fileName: string }` เมื่อสำเร็จ

> **ต่างจากสเปคตรงนี้โดยตั้งใจ** — สเปคเขียนไว้ว่าจะพิสูจน์ "parse แล้วต้องไม่มีแถวเกิดขึ้น"
> ด้วย integration test ที่นับแถวก่อนและหลัง แต่ route handler เรียกตรงๆ ไม่ได้ถ้าไม่มี
> session cookie จริง และเมื่อตรรกะการเขียนฐานย้ายไปอยู่ที่ `createSelfProfile` (Task 4)
> แล้ว การนับแถวรอบ `parsePdfProfile` ก็กลายเป็นการพิสูจน์สิ่งที่เห็นได้จากตัวโค้ดอยู่แล้ว
> เทสต์ที่ตรวจว่า route ไฟล์นี้ไม่ import Supabase client จับความล้มเหลวตัวเดียวกัน
> ได้ตรงกว่า เร็วกว่า และไม่ต้องพึ่งบริการภายนอก

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `app/api/self-assessment/parse/route.test.ts`:

```ts
import { readFileSync } from 'node:fs'

// เทสต์ระดับซอร์ส ไม่ใช่พฤติกรรม — จงใจ
//
// ข้อตกลงของฟีเจอร์นี้คือ "เฟสอ่านไฟล์ต้องไม่เขียนฐานข้อมูล" ซึ่งเป็นข้อตกลงที่
// **ไม่มีอาการให้สังเกตเลยเมื่อมันพัง** ถ้าใครเผลอ insert ตั้งแต่เฟสแรก ระบบจะยัง
// ทำงานถูกทุกอย่างในสายตาผู้ใช้ แต่ประวัติฉบับที่ AI เดามาผิดจะถูกเก็บลงฐานโดยที่
// เจ้าตัวยังไม่ได้รับรอง ซึ่งเป็นสิ่งเดียวที่ขั้นตอนตรวจสอบนี้มีไว้ป้องกัน
//
// การตรวจ import จึงเป็นวิธีที่ตรงที่สุดที่ยังเป็น unit test ได้
test('route อ่านไฟล์ต้องไม่ import supabase server client', () => {
  const src = readFileSync('app/api/self-assessment/parse/route.ts', 'utf8')
  expect(src).not.toMatch(/supabase\/server/)
  expect(src).not.toMatch(/getServerClient/)
})

test('route อ่านไฟล์ต้องตรวจ session ก่อนเรียก Gemini', () => {
  const src = readFileSync('app/api/self-assessment/parse/route.ts', 'utf8')
  expect(src).toMatch(/getSession/)
  expect(src.indexOf('getSession')).toBeLessThan(src.indexOf('parsePdfProfile'))
})
```

- [ ] **Step 2: รันเทสต์เพื่อยืนยันว่าตก**

Run: `npx vitest run app/api/self-assessment/parse/route.test.ts`
Expected: FAIL — `ENOENT: no such file or directory`

- [ ] **Step 3: เขียนโค้ดให้ผ่าน**

สร้าง `app/api/self-assessment/parse/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { validateUpload } from '@/lib/self/validateUpload'
import { parsePdfProfile } from '@/lib/gemini/parsePdf'

// POST /api/self-assessment/parse — FormData { file: <PDF> }
//
// เฟสแรกของสองเฟส: อ่านไฟล์แล้วคืนร่างกลับเบราว์เซอร์ **ไม่เขียนฐานข้อมูลเลย**
// ผู้ใช้ตรวจและแก้ในฟอร์มก่อน แล้วจึงยิง POST /api/self-assessment เพื่อบันทึก
//
// ห้าม import lib/supabase/server เข้ามาในไฟล์นี้ มี route.test.ts ดักไว้
//
// รับเป็น FormData ไม่ใช่ base64 ใน JSON เพราะ base64 ทำให้ขนาดโตขึ้น ~33% และ
// Vercel จำกัด request body ที่ 4.5MB — PDF 3.5MB ที่ควรส่งได้จะกลายเป็น 4.7MB
// แล้วพังโดยไม่มีสัญญาณที่เดาถูก
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
  if (invalid) {
    const hint =
      invalid.includes('ใหญ่เกินไป')
        ? `${invalid} — CV ที่สแกนมาเป็นรูปมักมีขนาดใหญ่ ลองบันทึกเป็น PDF ข้อความแทน`
        : invalid
    return NextResponse.json({ error: hint }, { status: 400 })
  }

  const pdfBase64 = Buffer.from(await file!.arrayBuffer()).toString('base64')

  try {
    const draft = await parsePdfProfile(pdfBase64)
    return NextResponse.json({ draft, fileName: file!.name })
  } catch (e: any) {
    // log ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งข้อความดิบให้ผู้ใช้ ถ้าไม่ log ตรงนี้
    // ทุกความล้มเหลวจะกลายเป็นข้อความเดียวกันบนหน้าจอ และไม่มีทางรู้เลยว่า
    // เป็นไฟล์ โมเดล หรือเครือข่าย
    console.error('self-assessment parse failed:', e?.message ?? e)

    // แยก "ผู้ให้บริการไม่ว่าง" ออกจาก "ไฟล์มีปัญหา" — 503 = ความจุฝั่ง Google ตึง,
    // 429 = โควตาหมด ทั้งสองไม่เกี่ยวกับไฟล์ การบอกให้ไปตรวจไฟล์คือการชี้ผิดทาง
    const msg = String(e?.message ?? '')
    const upstreamBusy = msg.includes('"code":503') || msg.includes('"code":429')
    if (upstreamBusy) {
      return NextResponse.json(
        {
          error: 'ระบบ AI ไม่ว่างชั่วคราว (ไฟล์ของคุณไม่มีปัญหา) รอสักครู่แล้วลองใหม่ หรือกรอกข้อมูลเองก็ได้',
          canFallback: true,
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      {
        error: 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจว่าไฟล์ไม่เสียหาย หรือกรอกข้อมูลเองแทนก็ได้',
        canFallback: true,
      },
      { status: 502 }
    )
  }
}
```

- [ ] **Step 4: รันเทสต์เพื่อยืนยันว่าผ่าน**

Run: `npx vitest run app/api/self-assessment/parse/route.test.ts`
Expected: PASS ทั้ง 2 เทสต์

- [ ] **Step 5: Commit**

```bash
git add app/api/self-assessment/parse/
git commit -m "feat(self): add parse route that returns a draft without writing to the DB"
```

---

### Task 6: `POST /api/self-assessment` — เปลี่ยน body จาก FormData เป็น JSON

**Files:**
- Modify: `app/api/self-assessment/route.ts` (เขียนใหม่ทั้งไฟล์)

**Interfaces:**
- Consumes: `validateProfileDraft` (Task 1), `createSelfProfile` (Task 4), `getSession` (มีอยู่แล้ว)
- Produces: `POST` handler รับ `{ draft, fileName? }` คืน `{ id }`

- [ ] **Step 1: เขียนโค้ด**

เขียน `app/api/self-assessment/route.ts` ใหม่ทั้งไฟล์:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { validateProfileDraft } from '@/lib/self/profileDraft'
import { createSelfProfile } from '@/lib/self/createProfile'

// POST /api/self-assessment — JSON { draft: ProfileDraft, fileName?: string }
// ทุก role ที่ล็อกอินใช้ได้ ไม่ต้อง gate ด้วย hasRole เพราะเป็นฟีเจอร์สำหรับทุกคน
//
// เฟสที่สองของสองเฟส: รับร่างที่ผู้ใช้ **ตรวจและยืนยันแล้ว** ไปวิเคราะห์และบันทึก
// ไฟล์ PDF อ่านไปแล้วที่ /api/self-assessment/parse route นี้จึงไม่รับไฟล์
//
// **สำคัญ: body มาจากเบราว์เซอร์ ไม่ได้มาจาก Gemini แล้ว** เดิมข้อมูลที่จะเขียนลงฐาน
// มาจากโมเดลเท่านั้นจึงเชื่อได้ระดับหนึ่ง ตอนนี้ใครก็ยิง JSON ตรงเข้ามาได้โดยไม่ผ่าน
// ฟอร์ม เช่นส่ง summary ยาวสิบล้านตัวอักษรให้เราจ่ายค่า embedding แทนเขา
// validateProfileDraft คือด่านเดียวที่กันเรื่องนี้ — การจำกัดใน <input maxLength>
// เป็นเรื่องประสบการณ์ผู้ใช้ ไม่ใช่การป้องกัน
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const result = validateProfileDraft(body?.draft)
  if (!result.ok) {
    return NextResponse.json({ error: result.message, field: result.field }, { status: 400 })
  }

  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 255) : undefined

  try {
    // owner_id มาจาก session เท่านั้น ห้ามรับจาก body — validateProfileDraft
    // ตัด owner_id ที่ปนมากับ draft ทิ้งไปแล้วด้วย
    const id = await createSelfProfile(result.draft, session.userId, fileName)
    return NextResponse.json({ id })
  } catch (e: any) {
    console.error('self-assessment save failed:', e?.message ?? e)

    const msg = String(e?.message ?? '')
    const upstreamBusy = msg.includes('"code":503') || msg.includes('"code":429')
    if (upstreamBusy) {
      // ฟอร์มยังอยู่ครบบนหน้าจอของผู้ใช้ กดวิเคราะห์ซ้ำได้เลยโดยไม่ต้องอ่าน PDF ใหม่
      // ซึ่งเป็นขั้นที่แพงที่สุด — นี่คือสิ่งที่ flow เดิมทำไม่ได้
      return NextResponse.json(
        { error: 'ระบบ AI ไม่ว่างชั่วคราว ข้อมูลของคุณยังอยู่ กดวิเคราะห์อีกครั้งได้เลย' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
```

- [ ] **Step 2: ตรวจว่า TypeScript ไม่มี error ค้างจาก Task 2**

Run: `npx tsc --noEmit`
Expected: ไม่มี error (error เรื่อง `raw_text` ที่ค้างจาก Task 2 ต้องหายไปแล้ว)

- [ ] **Step 3: รันชุด unit ทั้งหมด**

Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 4: Commit**

```bash
git add app/api/self-assessment/route.ts
git commit -m "feat(self): confirm route now takes a validated JSON draft, not a file"
```

---

### Task 7: `components/ProfileForm.tsx` — ฟอร์มเดียวใช้ทั้งตรวจร่างและกรอกเอง

**Files:**
- Create: `components/ProfileForm.tsx`

**Interfaces:**
- Consumes: `ProfileDraft`, `EMPTY_DRAFT`, `LIMITS` (Task 1)
- Produces: default export `ProfileForm` รับ props `{ initial: ProfileDraft; fileName?: string; onSaved: () => void }`

ตามแบบ `components/CreateJobForm.tsx` ที่มีอยู่ — client component, `useState`, คลาส CSS จาก `app/globals.css` (`card`, `stack`, `row`, `input`, `textarea`, `btn`, `btn-primary`, `btn-ghost`, `chip`, `faint`, `muted`) ห้ามเพิ่มคลาสใหม่ใน globals.css

- [ ] **Step 1: เขียนโค้ด**

สร้าง `components/ProfileForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { EMPTY_DRAFT, LIMITS, type ProfileDraft, type DraftEducation } from '@/lib/self/profileDraft'

type Exp = NonNullable<ProfileDraft['experience']>[number]

// ฟอร์มเดียวใช้สองทาง: ตรวจร่างที่อ่านมาจาก PDF และกรอกเองตั้งแต่ต้น
// ต่างกันแค่ค่า initial ที่ส่งเข้ามา — นั่นคือเหตุผลที่ "กรอกเอง" แทบไม่มีต้นทุนเพิ่ม
//
// maxLength ในช่องต่างๆ เป็นเรื่องประสบการณ์ผู้ใช้เท่านั้น การป้องกันจริงอยู่ที่
// validateProfileDraft ฝั่งเซิร์ฟเวอร์ ดู app/api/self-assessment/route.ts
export default function ProfileForm({
  initial,
  fileName,
  onSaved,
}: {
  initial: ProfileDraft
  fileName?: string
  onSaved: () => void
}) {
  const [d, setD] = useState<ProfileDraft>({ ...EMPTY_DRAFT, ...initial })
  const [skillText, setSkillText] = useState((initial.skills ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warned, setWarned] = useState(false)

  const set = (patch: Partial<ProfileDraft>) => setD((p) => ({ ...p, ...patch }))

  const edu = d.education ?? []
  const exp = d.experience ?? []

  const setEdu = (idx: number, patch: Partial<DraftEducation>) =>
    set({ education: edu.map((e, i) => (i === idx ? { ...e, ...patch } : e)) })
  const setExp = (idx: number, patch: Partial<Exp>) =>
    set({ experience: exp.map((e, i) => (i === idx ? { ...e, ...patch } : e)) })

  const submit = async () => {
    if (busy) return
    setError('')

    if (!(d.full_name ?? '').trim()) return setError('กรุณากรอกชื่อ')

    // summary มีน้ำหนักในการจัดอันดับงานมากกว่า skills (วัดด้วย ablate-embedding.ts:
    // ตัด skills ออก Spearman 0.951 · ตัด summary ออก 0.856) คนที่ข้ามช่องนี้จะได้ผล
    // จับคู่งานแย่ลงชัดเจนโดยไม่รู้ตัว จึงเตือนหนึ่งครั้ง แต่ไม่บังคับ
    if (!(d.summary ?? '').trim() && !warned) {
      setWarned(true)
      return setError(
        'ยังไม่ได้กรอก "แนะนำตัวเอง" ซึ่งมีผลกับการจับคู่งานมาก กดอีกครั้งถ้าต้องการข้ามไป'
      )
    }

    const skills = skillText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    setBusy(true)
    const res = await fetch('/api/self-assessment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: { ...d, skills }, fileName }),
    })
    setBusy(false)

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    onSaved()
  }

  return (
    <div className="card stack" style={{ maxWidth: 620, gap: 14 }}>
      {fileName && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          อ่านจากไฟล์ {fileName} — ตรวจแล้วแก้ให้ถูกต้องก่อนกดวิเคราะห์
        </p>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <input
          className="input"
          maxLength={LIMITS.full_name}
          value={d.full_name ?? ''}
          onChange={(e) => set({ full_name: e.target.value })}
          placeholder="ชื่อ-นามสกุล (ภาษาอังกฤษ)"
        />
        <input
          className="input"
          maxLength={LIMITS.headline}
          value={d.headline ?? ''}
          onChange={(e) => set({ headline: e.target.value })}
          placeholder="ตำแหน่งย่อ เช่น Senior Data Scientist"
        />
        <input
          className="input"
          maxLength={LIMITS.industry}
          value={d.industry ?? ''}
          onChange={(e) => set({ industry: e.target.value })}
          placeholder="อุตสาหกรรม เช่น Banking, Healthcare"
        />
        <input
          className="input"
          maxLength={LIMITS.location}
          value={d.location ?? ''}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="สถานที่ เช่น Bangkok, Thailand"
        />
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>การศึกษา</div>
        <div className="stack" style={{ gap: 10 }}>
          {edu.map((e, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <div className="row">
                <input className="input" maxLength={LIMITS.institution} value={e.institution ?? ''}
                  onChange={(ev) => setEdu(i, { institution: ev.target.value })} placeholder="สถาบัน" />
                <input className="input" maxLength={LIMITS.country} value={e.country ?? ''}
                  onChange={(ev) => setEdu(i, { country: ev.target.value })} placeholder="ประเทศ" />
              </div>
              <div className="row">
                <input className="input" maxLength={LIMITS.degree} value={e.degree ?? ''}
                  onChange={(ev) => setEdu(i, { degree: ev.target.value })} placeholder="วุฒิ เช่น MS" />
                <input className="input" maxLength={LIMITS.field_of_study} value={e.field_of_study ?? ''}
                  onChange={(ev) => setEdu(i, { field_of_study: ev.target.value })} placeholder="สาขา" />
              </div>
              <div className="row">
                <input className="input" type="number" value={e.start_year ?? ''}
                  onChange={(ev) => setEdu(i, { start_year: ev.target.value ? Number(ev.target.value) : undefined })}
                  placeholder="ปีเริ่ม" />
                <input className="input" type="number" value={e.end_year ?? ''}
                  onChange={(ev) => setEdu(i, { end_year: ev.target.value ? Number(ev.target.value) : undefined })}
                  placeholder="ปีจบ" />
                {/* ผลการเรียนเป็นข้อความ ไม่ใช่ตัวเลข เพราะสเกลไม่เหมือนกัน —
                    3.45 จากระบบ 4.0, 4.2 จากระบบ 5.0, "เกียรตินิยมอันดับหนึ่ง"
                    ล้วนเป็นคำตอบที่ถูก type="number" จะทำให้กรอกไม่ได้ */}
                <input className="input" maxLength={LIMITS.gpa} value={e.gpa ?? ''}
                  onChange={(ev) => setEdu(i, { gpa: ev.target.value })} placeholder="ผลการเรียน (ถ้ามี)" />
                <button className="btn btn-ghost" onClick={() => set({ education: edu.filter((_, j) => j !== i) })}>ลบ</button>
              </div>
            </div>
          ))}
          {edu.length < LIMITS.education && (
            <button className="chip-add" onClick={() => set({ education: [...edu, {}] })}>+ เพิ่มการศึกษา</button>
          )}
        </div>
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>ประสบการณ์ทำงาน</div>
        <div className="stack" style={{ gap: 10 }}>
          {exp.map((e, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <div className="row">
                <input className="input" maxLength={LIMITS.title} value={e.title ?? ''}
                  onChange={(ev) => setExp(i, { title: ev.target.value })} placeholder="ตำแหน่ง" />
                <input className="input" maxLength={LIMITS.company} value={e.company ?? ''}
                  onChange={(ev) => setExp(i, { company: ev.target.value })} placeholder="บริษัท" />
              </div>
              <div className="row">
                <input className="input" type="date" value={e.start_date ?? ''}
                  onChange={(ev) => setExp(i, { start_date: ev.target.value || undefined })} />
                <input className="input" type="date" value={e.end_date ?? ''}
                  onChange={(ev) => setExp(i, { end_date: ev.target.value || undefined })} />
                <button className="btn btn-ghost" onClick={() => set({ experience: exp.filter((_, j) => j !== i) })}>ลบ</button>
              </div>
              <textarea className="textarea" rows={2} maxLength={LIMITS.description} value={e.description ?? ''}
                onChange={(ev) => setExp(i, { description: ev.target.value })} placeholder="รายละเอียดงาน (ไม่บังคับ)" />
            </div>
          ))}
          {exp.length < LIMITS.experience && (
            <button className="chip-add" onClick={() => set({ experience: [...exp, {}] })}>+ เพิ่มประสบการณ์</button>
          )}
        </div>
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>สกิล (คั่นด้วยจุลภาค)</div>
        <input className="input" value={skillText} onChange={(e) => setSkillText(e.target.value)}
          placeholder="Python, SQL, Machine Learning" />
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
          แนะนำตัวเอง — มีผลกับการจับคู่งานมากที่สุด
        </div>
        <textarea className="textarea" rows={4} maxLength={LIMITS.summary} value={d.summary ?? ''}
          onChange={(e) => set({ summary: e.target.value })}
          placeholder="เช่น ทำงานด้านโมเดลพยากรณ์และความเสี่ยงมา 10 ปี เคยดูแลทีม 6 คน สนใจงานฝั่งธนาคารและค้าปลีก" />
      </div>

      <div className="row">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'กำลังวิเคราะห์…' : 'ยืนยันและวิเคราะห์'}
        </button>
        {busy && <span className="faint" style={{ fontSize: 13 }}>อาจใช้เวลา 10–20 วินาที</span>}
      </div>
      {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <p className="faint" style={{ fontSize: 12, margin: 0 }}>
        แสดงเฉพาะรายการล่าสุดจากไฟล์ ถ้าขาดอะไรสำคัญเพิ่มเองได้
      </p>
    </div>
  )
}
```

- [ ] **Step 2: ตรวจ TypeScript**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

- [ ] **Step 3: Commit**

```bash
git add components/ProfileForm.tsx
git commit -m "feat(self): add ProfileForm used for both review and manual entry"
```

---

### Task 8: `SelfAssessmentStart` + ต่อเข้าหน้า และลบส่วนประกอบเดิม

**Files:**
- Create: `components/SelfAssessmentStart.tsx`
- Modify: `app/(app)/self-assessment/page.tsx` (แทน `SelfAssessmentUpload` ด้วย `SelfAssessmentStart` สองแห่ง และแสดง `gpa` ในการ์ดโปรไฟล์)
- Delete: `components/SelfAssessmentUpload.tsx`

**Interfaces:**
- Consumes: `ProfileForm` (Task 7), `EMPTY_DRAFT`, `ProfileDraft` (Task 1), `validateUpload` (มีอยู่แล้ว)
- Produces: default export `SelfAssessmentStart` รับ props `{ label: string }`

- [ ] **Step 1: เขียนส่วนประกอบใหม่**

สร้าง `components/SelfAssessmentStart.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateUpload } from '@/lib/self/validateUpload'
import { EMPTY_DRAFT, type ProfileDraft } from '@/lib/self/profileDraft'
import ProfileForm from './ProfileForm'

type Step =
  | { name: 'choose' }
  | { name: 'form'; draft: ProfileDraft; fileName?: string }

// สองทางเข้าคู่กันตั้งแต่แรก ไม่ใช่ให้ "กรอกเอง" โผล่เฉพาะตอนอัปโหลดล้มเหลว
// เพราะคนที่ไม่มีไฟล์ CV เลย — นักศึกษาจบใหม่ หรือคนที่ประวัติอยู่ใน Google Docs —
// จะต้องแกล้งอัปโหลดอะไรสักอย่างให้พังก่อนถึงจะเจอทางที่ใช้ได้ ซึ่งไม่มีใครเดาออก
export default function SelfAssessmentStart({ label }: { label: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upload = async () => {
    if (busy) return
    setError('')
    const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
    if (invalid) return setError(invalid)

    setBusy(true)
    const form = new FormData()
    form.append('file', file!)
    const res = await fetch('/api/self-assessment/parse', { method: 'POST', body: form })
    setBusy(false)

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    const json = await res.json()
    setStep({ name: 'form', draft: json.draft, fileName: json.fileName })
  }

  if (step.name === 'form') {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <ProfileForm
          initial={step.draft}
          fileName={step.fileName}
          onSaved={() => {
            setStep({ name: 'choose' })
            setFile(null)
            router.refresh()
          }}
        />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
          onClick={() => setStep({ name: 'choose' })}>
          ← ย้อนกลับ
        </button>
      </div>
    )
  }

  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 12 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setError('')
            setFile(e.target.files?.[0] ?? null)
          }}
        />
        <button className="btn btn-primary" onClick={upload} disabled={busy || !file}>
          {busy ? 'กำลังอ่านไฟล์…' : label}
        </button>
      </div>
      {busy && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          กำลังอ่านไฟล์ด้วย AI แล้วจะให้คุณตรวจข้อมูลก่อนวิเคราะห์
        </p>
      )}
      {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <div className="row">
        <span className="faint" style={{ fontSize: 13 }}>ไม่มีไฟล์ CV?</span>
        <button className="btn btn-ghost"
          onClick={() => setStep({ name: 'form', draft: EMPTY_DRAFT })}>
          กรอกข้อมูลด้วยตัวเอง
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ต่อเข้าหน้า**

ใน `app/(app)/self-assessment/page.tsx` แก้สามจุด:

1. เปลี่ยน import บรรทัด `import SelfAssessmentUpload from '@/components/SelfAssessmentUpload'` เป็น:

```tsx
import SelfAssessmentStart from '@/components/SelfAssessmentStart'
```

2. แทนที่ `<SelfAssessmentUpload label="อัปโหลดและวิเคราะห์" />` ด้วย:

```tsx
<SelfAssessmentStart label="อัปโหลดและตรวจข้อมูล" />
```

และแก้ข้อความชวนด้านบนในบล็อก `if (!profile)` เป็น:

```tsx
<p className="muted">
  อัปโหลด resume หรือ CV เป็นไฟล์ PDF แล้ว AI จะอ่านข้อมูลมาให้ตรวจก่อน
  เมื่อยืนยันแล้วจึงวิเคราะห์จุดแข็ง จุดอ่อน สิ่งที่ควรพัฒนา และงานที่เหมาะกับคุณ
  ถ้าไม่มีไฟล์ กรอกข้อมูลเองก็ได้ (ไฟล์เป็นภาษาไทยหรืออังกฤษก็ได้)
</p>
```

3. แทนที่ `<SelfAssessmentUpload label="อัปโหลดไฟล์ใหม่" />` ท้ายหน้าด้วย:

```tsx
<SelfAssessmentStart label="อัปโหลดไฟล์ใหม่" />
```

4. แสดงผลการเรียนในการ์ดโปรไฟล์ — เพิ่มต่อจากบล็อก `{skills.length > 0 && ...}`:

```tsx
{Array.isArray(parsed.education) && parsed.education.length > 0 && (
  <div style={{ marginTop: 10 }}>
    {parsed.education.map((e: any, i: number) => (
      <div key={i} className="faint" style={{ fontSize: 13 }}>
        {[e.degree, e.institution, e.country].filter(Boolean).join(' · ')}
        {e.gpa ? ` · ผลการเรียน ${e.gpa}` : ''}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: ลบส่วนประกอบเดิม**

```bash
git rm components/SelfAssessmentUpload.tsx
```

- [ ] **Step 4: ตรวจว่าไม่มีอะไรอ้างถึงของที่ลบไป**

Run: `npx tsc --noEmit`
Expected: ไม่มี error

Run: `grep -rn "SelfAssessmentUpload" --include=*.ts --include=*.tsx .`
Expected: ไม่พบผลลัพธ์

- [ ] **Step 5: รันชุดเทสต์และ build**

Run: `npm test`
Expected: PASS ทั้งหมด

Run: `npm run build`
Expected: สำเร็จ

- [ ] **Step 6: ทดสอบด้วยมือบน dev server**

Run: `npm run dev` แล้วเปิด `/self-assessment`

ตรวจสี่อย่าง:
1. เห็นสองทางเข้า — ปุ่มอัปโหลด และ "กรอกข้อมูลด้วยตัวเอง"
2. กด "กรอกข้อมูลด้วยตัวเอง" → ได้ฟอร์มว่าง กรอกชื่ออย่างเดียวแล้วกดยืนยัน → ขึ้นเตือนเรื่องแนะนำตัวหนึ่งครั้ง กดซ้ำแล้วผ่าน
3. อัปโหลด PDF จริง → เห็นฟอร์มที่กรอกไว้ให้แล้ว **ไม่ใช่ผลวิเคราะห์ทันที**
4. ผลการเรียนกรอกคำว่า "เกียรตินิยมอันดับหนึ่ง" ได้ ไม่ถูกปฏิเสธ

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(self): two entry points, review-before-analyze flow, show GPA"
```

---

## หลังทำครบ

1. รัน `npm run test:integration` ครั้งเดียวเพื่อยืนยันว่า `createProfile.int.test.ts` ผ่าน (หรือ skip เพราะบริการไม่ว่าง)
2. อัปเดต `CLAUDE.md` หัวข้อ Phase 7 — บันทึกว่า flow เปลี่ยนเป็นสองเฟส, `raw_text` เลิกเขียนแล้ว, และ**ห้ามใส่ `gpa` เข้า `buildEmbedText`**
3. งานที่เหลือตามสเปค: รับไฟล์เกิน 4MB ผ่าน Supabase Storage, วัด token จริงของ call ที่อ่าน PDF
