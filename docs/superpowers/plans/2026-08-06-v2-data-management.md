# V2 Data Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม role `data_manager`, หน้าตารางข้อมูลผู้สมัครที่แก้ไขได้พร้อม re-embed อัตโนมัติ, ตัวตรวจข้อมูลไม่ครบ/ซ้ำ, และการจัดการรหัสผ่าน (เปลี่ยน + ลืม)

**Architecture:** หน้าตารางเป็น server component อ่านผ่าน URL params และ service-role client ส่วนการเขียนไปผ่าน API route ที่ตรวจสิทธิ์ด้วย `hasRole` แล้วใช้ service-role client (pattern เดียวกับ `/api/admin/users`) ไม่แตะ RLS ของ `candidates` เลย ตรรกะที่ตัดสินใจได้ทั้งหมด (parse params, ตรวจคุณภาพข้อมูล, ตัดสิน re-embed, validate รหัสผ่าน) แยกเป็นฟังก์ชันบริสุทธิ์ที่มี unit test รันออฟไลน์

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + Auth), Gemini (`gemini-embedding-001`), plain CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-08-06-v2-data-management-design.md`

## Global Constraints

- ไม่เพิ่ม dependency ใหม่ ใช้ plain CSS และคลาสจาก `app/globals.css`
- Migration เป็น additive เท่านั้น ห้าม drop/alter ตาราง `jobs` และตารางเดิม
- ไม่แตะตรรกะ search / ingest / scoring / dedup ที่มีอยู่
- ไม่เพิ่ม RLS policy สำหรับ update/delete บน `candidates` — เขียนผ่าน API route เท่านั้น
- Server component ยังเป็น server, client component ยังเป็น client
- เทสต์เดิมทุกไฟล์ต้องยังเขียว โดยเฉพาะ `lib/auth/session.test.ts`
- ข้อความ UI เป็นภาษาไทย ข้อมูลในฐานข้อมูลเป็นภาษาอังกฤษ
- ห้ามแสดง error ดิบจาก Postgres หรือ Gemini ให้ผู้ใช้เห็น
- Gemini free tier — ห้ามยิง embed โดยไม่จำเป็น (ดู Task V4)
- ลำดับ role: `member` < `data_manager` < `admin`
- ล็อกอินด้วย Google **ไม่อยู่ในขอบเขต v2** (เลื่อนไป v3)

## File Structure

**สร้างใหม่:**

- `supabase/migrations/009_data_manager_role.sql` — เพิ่มค่า enum
- `lib/candidates/listParams.ts` (+ test) — parse/whitelist ค่าจาก URL
- `lib/candidates/quality.ts` (+ test) — ตรวจข้อมูลไม่ครบ + สร้าง filter ชื่อซ้ำ
- `lib/candidates/update.ts` (+ test) — normalize, needsReembed, เขียน DB
- `lib/auth/password.ts` (+ test) — validate ฟอร์มรหัสผ่าน
- `app/(app)/candidates/page.tsx` — หน้าตาราง (server)
- `components/CandidatesTable.tsx` — ตาราง + ตัวควบคุม (client)
- `components/EditCandidateModal.tsx` — modal แก้ไข (client)
- `components/ImportForm.tsx` — ฟอร์มนำเข้า (client, ย้ายจากหน้า import)
- `components/ChangePasswordCard.tsx` — การ์ดเปลี่ยนรหัสผ่าน (client)
- `app/api/candidates/[id]/route.ts` — PATCH
- `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`

**แก้ไข:** `lib/auth/session.ts`, `lib/auth/session.test.ts`, `app/api/admin/users/route.ts`, `components/RoleSelect.tsx`, `app/(app)/layout.tsx`, `app/(app)/import/page.tsx`, `app/(app)/settings/page.tsx`, `app/(auth)/login/page.tsx`, `app/globals.css`

---

### Task V1: Role model — `data_manager`

**Files:**
- Create: `supabase/migrations/009_data_manager_role.sql`
- Modify: `lib/auth/session.ts`, `lib/auth/session.test.ts`, `app/api/admin/users/route.ts`, `components/RoleSelect.tsx`, `app/(app)/layout.tsx`, `app/(app)/import/page.tsx`
- Create: `components/ImportForm.tsx`

**Interfaces:**
- Produces: `Role = 'admin' | 'data_manager' | 'member'` และ `hasRole(userRole: Role, required: Role): boolean` แบบลำดับชั้น — ทุก task ถัดไปใช้ `hasRole(session.role, 'data_manager')` เป็น guard

- [ ] **Step 1: เขียนเทสต์ที่ต้องแดงก่อน**

เพิ่มต่อท้าย `lib/auth/session.test.ts` (เก็บเทสต์ 2 อันเดิมไว้ ห้ามลบ):

```ts
test('data_manager passes member and data_manager gates but not admin', () => {
  expect(hasRole('data_manager', 'member')).toBe(true)
  expect(hasRole('data_manager', 'data_manager')).toBe(true)
  expect(hasRole('data_manager', 'admin')).toBe(false)
})

test('admin passes the data_manager gate', () => {
  expect(hasRole('admin', 'data_manager')).toBe(true)
})

test('member does not pass the data_manager gate', () => {
  expect(hasRole('member', 'data_manager')).toBe(false)
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL — TypeScript ปฏิเสธค่า `'data_manager'` เพราะยังไม่มีใน type `Role`

- [ ] **Step 3: แก้ `lib/auth/session.ts`**

แทนที่ 6 บรรทัดแรกของไฟล์ (ตั้งแต่ `export type Role` จนจบฟังก์ชัน `hasRole`) ด้วย:

```ts
export type Role = 'admin' | 'data_manager' | 'member'

// ลำดับชั้นสิทธิ์: ตัวเลขสูงกว่าผ่านประตูของตัวเลขต่ำกว่าได้ทั้งหมด
const ROLE_RANK: Record<Role, number> = {
  member: 1,
  data_manager: 2,
  admin: 3,
}

// Pure role-gate check. rank 0 สำหรับค่าที่ไม่รู้จัก (ข้อมูลเพี้ยนจาก DB) จะไม่ผ่านประตูใดเลย
export function hasRole(userRole: Role, required: Role): boolean {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[required] ?? 0)
}
```

ส่วนที่เหลือของไฟล์ (`getSession`) ไม่ต้องแก้

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: PASS ทั้ง 5 เทสต์ (2 เดิม + 3 ใหม่)

- [ ] **Step 5: สร้าง migration**

สร้าง `supabase/migrations/009_data_manager_role.sql`:

```sql
-- เพิ่ม role 'data_manager' เข้า enum user_role แบบ additive
-- ต้องรันไฟล์นี้เดี่ยวๆ ให้ commit ก่อน แล้วจึงใช้ค่านี้ได้ — Postgres ไม่อนุญาต
-- ให้ใช้ค่า enum ใหม่ใน transaction เดียวกับที่เพิ่มค่านั้น
alter type user_role add value if not exists 'data_manager';
```

- [ ] **Step 6: เปิดรับค่าใหม่ใน admin API**

ใน `app/api/admin/users/route.ts` แทนที่บล็อก validate เดิม:

```ts
  const { userId, role } = await req.json()
  if (!userId || (role !== 'admin' && role !== 'member')) {
    return NextResponse.json({ error: 'userId and role (admin|member) required' }, { status: 400 })
  }
```

ด้วย:

```ts
  const { userId, role } = await req.json()
  const ROLES = ['admin', 'data_manager', 'member']
  if (!userId || !ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'userId and role (admin|data_manager|member) required' },
      { status: 400 }
    )
  }
```

- [ ] **Step 7: เพิ่มตัวเลือกใน RoleSelect**

แทนที่เนื้อหาทั้งไฟล์ `components/RoleSelect.tsx` ด้วย:

```tsx
'use client'
import { useState } from 'react'
import type { Role } from '@/lib/auth/session'

export default function RoleSelect({
  userId,
  role,
}: {
  userId: string
  role: Role
}) {
  const [value, setValue] = useState<Role>(role)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const change = async (next: Role) => {
    setSaving(true)
    setMsg('')
    setValue(next)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, role: next }),
    })
    setSaving(false)
    setMsg(res.ok ? 'บันทึกแล้ว' : 'ผิดพลาด')
  }

  return (
    <span className="row">
      <select className="select" style={{ width: 'auto' }} value={value} onChange={(e) => change(e.target.value as Role)} disabled={saving}>
        <option value="member">member</option>
        <option value="data_manager">data manager</option>
        <option value="admin">admin</option>
      </select>
      {msg && <span style={{ fontSize: 12, color: 'var(--ok)' }}>{msg}</span>}
    </span>
  )
}
```

- [ ] **Step 8: ย้ายฟอร์มนำเข้าออกเป็น client component**

สร้าง `components/ImportForm.tsx` — คือเนื้อหาเดิมของหน้า import ทั้งดุ้น เปลี่ยนชื่อฟังก์ชันและตัด `<main>` กับ `<h1>` ออก (หน้าแม่จะเป็นคนใส่):

```tsx
'use client'
import { useState } from 'react'

type Result = { imported: number; updated: number; errors: string[] }

export default function ImportForm() {
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    setResult(null)
    setCsv(await f.text())
  }

  const run = async () => {
    if (!csv || importing) return
    setImporting(true)
    setResult(null)
    const r = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'linkedin', csv }),
    })
    const json = await r.json()
    setImporting(false)
    setResult(json)
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="row">
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn btn-primary" onClick={run} disabled={!csv || importing}>
          {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
        </button>
      </div>
      {fileName && <p className="faint" style={{ fontSize: 13 }}>ไฟล์: {fileName}</p>}

      {result && (
        <div style={{ marginTop: 12 }}>
          <p>
            เพิ่มใหม่ <strong>{result.imported}</strong> · อัปเดต <strong>{result.updated}</strong> · ผิดพลาด <strong>{result.errors.length}</strong>
          </p>
          {result.errors.length > 0 && (
            <ul style={{ color: 'var(--bad)', fontSize: 13 }}>
              {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {result.imported + result.updated === 0 && result.errors.length === 0 && (
            <p className="faint">ไม่พบข้อมูลในไฟล์</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 9: ใส่ server guard ให้หน้า import**

แทนที่เนื้อหาทั้งไฟล์ `app/(app)/import/page.tsx` ด้วย:

```tsx
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import ImportForm from '@/components/ImportForm'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  return (
    <main>
      <h1>นำเข้าข้อมูล LinkedIn (CSV)</h1>
      <p className="muted">อัปโหลดไฟล์ CSV แล้วกดนำเข้า</p>
      <ImportForm />
    </main>
  )
}
```

- [ ] **Step 10: อัปเดต navbar ตาม role ใหม่**

แทนที่เนื้อหาทั้งไฟล์ `app/(app)/layout.tsx` ด้วย:

```tsx
import Link from 'next/link'
import { getSession, hasRole } from '@/lib/auth/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const isAdmin = !!session && hasRole(session.role, 'admin')
  const isDataManager = !!session && hasRole(session.role, 'data_manager')

  return (
    <div>
      <nav className="nav">
        <Link href="/dashboard" className="nav-brand">Skouth</Link>
        <Link href="/dashboard" className="nav-link">Dashboard</Link>
        <Link href="/search" className="nav-link">Search</Link>
        <Link href="/jobs" className="nav-link">Job</Link>
        <Link href="/shortlists" className="nav-link">Shortlist</Link>
        {isDataManager && <Link href="/candidates" className="nav-link">ข้อมูล</Link>}
        {isDataManager && <Link href="/import" className="nav-link">Import</Link>}
        {isAdmin && <Link href="/admin/users" className="nav-link">Admin</Link>}
        <div className="nav-right">
          <Link href="/settings" className="nav-link">Setting</Link>
        </div>
      </nav>
      <div className="container">{children}</div>
    </div>
  )
}
```

- [ ] **Step 11: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run`
Expected: build ผ่าน, เทสต์เขียวทั้งหมด

- [ ] **Step 12: รัน migration บน Supabase**

เปิด Supabase SQL editor รันเนื้อหาของ `supabase/migrations/009_data_manager_role.sql` แล้วตรวจว่าค่าใหม่เข้าไปจริง:

```sql
select unnest(enum_range(null::user_role));
```
Expected: ได้ 3 แถว — `admin`, `member`, `data_manager`

- [ ] **Step 13: Commit**

```bash
git add supabase/migrations/009_data_manager_role.sql lib/auth/session.ts lib/auth/session.test.ts app/api/admin/users/route.ts components/RoleSelect.tsx components/ImportForm.tsx "app/(app)/import/page.tsx" "app/(app)/layout.tsx"
git commit -m "feat(auth): add data_manager role with hierarchical hasRole"
```

---

### Task V2: ฟังก์ชันบริสุทธิ์สำหรับหน้าตาราง

**Files:**
- Create: `lib/candidates/listParams.ts`, `lib/candidates/listParams.test.ts`, `lib/candidates/quality.ts`, `lib/candidates/quality.test.ts`

**Interfaces:**
- Produces:
  - `parsePage(v?: string): number`
  - `parseSort(v?: string): SortColumn` โดย `SortColumn = 'full_name' | 'years_experience' | 'source' | 'updated_at' | 'created_at'`
  - `parseAsc(v?: string): boolean`
  - `PAGE_SIZE: number` (= 25)
  - `missingFields(row: QualityRow): MissingField[]` โดย `QualityRow = { headline?: string | null; summary?: string | null; years_experience?: number | null; has_embedding: boolean }` และ `MissingField = 'headline' | 'summary' | 'years_experience' | 'embedding'`
  - `MISSING_LABELS: Record<MissingField, string>`
  - `buildIssuesOrFilter(duplicateNames: string[]): string`
- Task V3 ใช้ทั้งหมดนี้

- [ ] **Step 1: เขียนเทสต์ listParams ที่ต้องแดง**

สร้าง `lib/candidates/listParams.test.ts`:

```ts
import { parsePage, parseSort, parseAsc, PAGE_SIZE } from './listParams'

test('parsePage accepts positive integers and falls back to 1', () => {
  expect(parsePage('3')).toBe(3)
  expect(parsePage('1')).toBe(1)
  expect(parsePage(undefined)).toBe(1)
  expect(parsePage('')).toBe(1)
  expect(parsePage('0')).toBe(1)
  expect(parsePage('-2')).toBe(1)
  expect(parsePage('abc')).toBe(1)
  expect(parsePage('2.5')).toBe(1)
})

test('parseSort only allows whitelisted columns', () => {
  expect(parseSort('full_name')).toBe('full_name')
  expect(parseSort('years_experience')).toBe('years_experience')
  expect(parseSort('source')).toBe('source')
  expect(parseSort('created_at')).toBe('created_at')
  expect(parseSort('updated_at')).toBe('updated_at')
})

test('parseSort rejects anything outside the whitelist', () => {
  expect(parseSort('embedding')).toBe('updated_at')
  expect(parseSort('id; drop table candidates')).toBe('updated_at')
  expect(parseSort(undefined)).toBe('updated_at')
})

test('parseAsc is true only for the exact string asc', () => {
  expect(parseAsc('asc')).toBe(true)
  expect(parseAsc('desc')).toBe(false)
  expect(parseAsc(undefined)).toBe(false)
  expect(parseAsc('ASC')).toBe(false)
})

test('PAGE_SIZE is 25', () => {
  expect(PAGE_SIZE).toBe(25)
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/candidates/listParams.test.ts`
Expected: FAIL — ไม่พบโมดูล `./listParams`

- [ ] **Step 3: เขียน listParams**

สร้าง `lib/candidates/listParams.ts`:

```ts
// ตัวแปลงค่าจาก URL สำหรับหน้าตารางผู้สมัคร ทุกตัวเป็นฟังก์ชันบริสุทธิ์
// ค่าจาก URL เชื่อถือไม่ได้ ทุกอย่างต้องผ่าน whitelist ก่อนส่งเข้า query

export const PAGE_SIZE = 25

export type SortColumn =
  | 'full_name'
  | 'years_experience'
  | 'source'
  | 'updated_at'
  | 'created_at'

const SORTABLE: SortColumn[] = [
  'full_name',
  'years_experience',
  'source',
  'updated_at',
  'created_at',
]

const DEFAULT_SORT: SortColumn = 'updated_at'

export function parsePage(v?: string): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

// ห้ามส่งค่าดิบจาก URL เข้า .order() — คืนค่า default ถ้าไม่อยู่ใน whitelist
export function parseSort(v?: string): SortColumn {
  return SORTABLE.includes(v as SortColumn) ? (v as SortColumn) : DEFAULT_SORT
}

export function parseAsc(v?: string): boolean {
  return v === 'asc'
}
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run lib/candidates/listParams.test.ts`
Expected: PASS ทั้ง 5 เทสต์

- [ ] **Step 5: เขียนเทสต์ quality ที่ต้องแดง**

สร้าง `lib/candidates/quality.test.ts`:

```ts
import { missingFields, buildIssuesOrFilter, MISSING_LABELS } from './quality'

const complete = {
  headline: 'Data Scientist',
  summary: 'Experienced analyst',
  years_experience: 5,
  has_embedding: true,
}

test('a complete row has no missing fields', () => {
  expect(missingFields(complete)).toEqual([])
})

test('missingFields reports each absent field', () => {
  expect(missingFields({ ...complete, headline: null })).toEqual(['headline'])
  expect(missingFields({ ...complete, summary: null })).toEqual(['summary'])
  expect(missingFields({ ...complete, years_experience: null })).toEqual(['years_experience'])
  expect(missingFields({ ...complete, has_embedding: false })).toEqual(['embedding'])
})

test('empty strings count as missing', () => {
  expect(missingFields({ ...complete, headline: '' })).toEqual(['headline'])
})

test('years_experience of 0 is present, not missing', () => {
  expect(missingFields({ ...complete, years_experience: 0 })).toEqual([])
})

test('missingFields reports several at once in a stable order', () => {
  expect(missingFields({ headline: null, summary: null, years_experience: null, has_embedding: false }))
    .toEqual(['headline', 'summary', 'years_experience', 'embedding'])
})

test('every missing field has a Thai label', () => {
  for (const f of ['headline', 'summary', 'years_experience', 'embedding'] as const) {
    expect(MISSING_LABELS[f]).toBeTruthy()
  }
})

test('buildIssuesOrFilter omits the name clause when there are no duplicates', () => {
  expect(buildIssuesOrFilter([])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null'
  )
})

test('buildIssuesOrFilter appends quoted duplicate names', () => {
  expect(buildIssuesOrFilter(['Somchai Jaidee'])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null,full_name.in.("Somchai Jaidee")'
  )
})

test('buildIssuesOrFilter quotes names containing commas', () => {
  expect(buildIssuesOrFilter(['Lee, Somchai', 'Nara Suk'])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null,full_name.in.("Lee, Somchai","Nara Suk")'
  )
})

test('buildIssuesOrFilter escapes double quotes inside a name', () => {
  expect(buildIssuesOrFilter(['Som "Ta" Jai'])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null,full_name.in.("Som \\"Ta\\" Jai")'
  )
})
```

- [ ] **Step 6: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/candidates/quality.test.ts`
Expected: FAIL — ไม่พบโมดูล `./quality`

- [ ] **Step 7: เขียน quality**

สร้าง `lib/candidates/quality.ts`:

```ts
// ตรวจคุณภาพข้อมูลผู้สมัคร คำนวณสดจากแถวที่ query มา ไม่มีคอลัมน์เก็บสถานะ

export type MissingField = 'headline' | 'summary' | 'years_experience' | 'embedding'

export type QualityRow = {
  headline?: string | null
  summary?: string | null
  years_experience?: number | null
  has_embedding: boolean
}

export const MISSING_LABELS: Record<MissingField, string> = {
  headline: 'ตำแหน่งย่อ',
  summary: 'สรุปโปรไฟล์',
  years_experience: 'ปีประสบการณ์',
  embedding: 'เวกเตอร์ค้นหา',
}

// embedding ที่หายไปคือกรณีร้ายแรงที่สุด — RPC ค้นหาทั้งสองตัวมี
// `where c.embedding is not null` ผู้สมัครที่ไม่มี embedding จึงไม่เคยโผล่ในผลค้นหาเลย
export function missingFields(row: QualityRow): MissingField[] {
  const missing: MissingField[] = []
  if (!row.headline) missing.push('headline')
  if (!row.summary) missing.push('summary')
  if (row.years_experience == null) missing.push('years_experience')
  if (!row.has_embedding) missing.push('embedding')
  return missing
}

// สร้างสตริงสำหรับ PostgREST .or() ที่รวมทุกเงื่อนไข "มีปัญหา"
// ถ้าไม่มีชื่อซ้ำเลยต้องตัดท่อน full_name.in.() ออกทั้งหมด — วงเล็บว่างทำให้
// PostgREST parse ไม่ผ่านและ query ทั้งก้อนพัง ซึ่งเป็นเคสปกติเมื่อข้อมูลสะอาด
export function buildIssuesOrFilter(duplicateNames: string[]): string {
  const clauses = [
    'headline.is.null',
    'summary.is.null',
    'years_experience.is.null',
    'embedding.is.null',
  ]
  if (duplicateNames.length) {
    // ครอบด้วยเครื่องหมายคำพูดเสมอ มิฉะนั้นจุลภาคในชื่อจะถูกอ่านเป็นตัวคั่นรายการ
    const quoted = duplicateNames.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(',')
    clauses.push(`full_name.in.(${quoted})`)
  }
  return clauses.join(',')
}
```

- [ ] **Step 8: รันให้เขียว**

Run: `npx vitest run lib/candidates/quality.test.ts`
Expected: PASS ทั้ง 10 เทสต์

- [ ] **Step 9: Commit**

```bash
git add lib/candidates/listParams.ts lib/candidates/listParams.test.ts lib/candidates/quality.ts lib/candidates/quality.test.ts
git commit -m "feat(candidates): pure helpers for list params and data quality"
```

---

### Task V3: หน้าตารางข้อมูล (อ่านอย่างเดียว)

**Files:**
- Create: `app/(app)/candidates/page.tsx`, `components/CandidatesTable.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `parsePage`, `parseSort`, `parseAsc`, `PAGE_SIZE` (V2), `missingFields`, `MISSING_LABELS`, `buildIssuesOrFilter` (V2), `hasRole` (V1)
- Produces: `CandidateRow` type ที่ Task V4 ใช้ส่งเข้า modal:
  ```ts
  type CandidateRow = {
    id: string
    full_name: string
    headline: string | null
    location: string | null
    summary: string | null
    linkedin_url: string | null
    professional_email: string | null
    source: string
    years_experience: number | null
    updated_at: string
    missing: MissingField[]
    duplicate: boolean
  }
  ```

- [ ] **Step 1: เพิ่มคลาส CSS ของตารางและ modal**

ต่อท้าย `app/globals.css`:

```css
.table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden; }
.table th { text-align: left; font-weight: 500; font-size: 12px; color: var(--text-faint); padding: 10px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.table td { padding: 10px 12px; border-bottom: 1px solid #f0f2f4; font-size: 13px; vertical-align: top; }
.table tr:last-child td { border-bottom: none; }
.table tbody tr:hover { background: #fafbfc; }
.table-sort { color: var(--text-faint); text-decoration: none; }
.table-sort:hover { color: var(--text); text-decoration: none; }
.table-sort.active { color: var(--text); font-weight: 500; }
.table-wrap { overflow-x: auto; }

.pager { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.pager-info { font-size: 13px; color: var(--text-muted); }

.badge-issue { display: inline-block; font-size: 11px; border-radius: 6px; padding: 2px 7px; margin-right: 4px; background: #f1f3f5; color: var(--text-muted); }
.badge-issue--dup { background: #fff7ed; color: #b45309; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 18, 22, .45); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 100; }
.modal { background: var(--surface); border-radius: var(--radius-card); padding: 20px 22px; width: 100%; max-width: 520px; max-height: 88vh; overflow-y: auto; }
.modal-title { font-size: 16px; font-weight: 500; margin: 0 0 14px; }
.field-label { font-size: 12px; color: var(--text-faint); margin-bottom: 4px; }
```

- [ ] **Step 2: เขียนตาราง (client component)**

สร้าง `components/CandidatesTable.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MISSING_LABELS, type MissingField } from '@/lib/candidates/quality'

export type CandidateRow = {
  id: string
  full_name: string
  headline: string | null
  location: string | null
  summary: string | null
  linkedin_url: string | null
  professional_email: string | null
  source: string
  years_experience: number | null
  updated_at: string
  missing: MissingField[]
  duplicate: boolean
}

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'full_name', label: 'ชื่อ', sortable: true },
  { key: 'headline', label: 'ตำแหน่งย่อ', sortable: false },
  { key: 'location', label: 'สถานที่', sortable: false },
  { key: 'source', label: 'ที่มา', sortable: true },
  { key: 'years_experience', label: 'ปี', sortable: true },
  { key: 'updated_at', label: 'อัปเดต', sortable: true },
  { key: 'issues', label: 'ปัญหา', sortable: false },
]

export default function CandidatesTable({
  rows,
  page,
  totalPages,
  total,
  sort,
  asc,
  q,
  issues,
}: {
  rows: CandidateRow[]
  page: number
  totalPages: number
  total: number
  sort: string
  asc: boolean
  q: string
  issues: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    router.push(`/candidates?${next.toString()}`)
  }

  const sortHref = (col: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('sort', col)
    next.set('dir', sort === col && !asc ? 'asc' : 'desc')
    next.delete('page')
    return `/candidates?${next.toString()}`
  }

  return (
    <div>
      <div className="row" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          defaultValue={q}
          placeholder="ค้นหาชื่อหรือตำแหน่ง"
          onKeyDown={(e) => {
            if (e.key === 'Enter') go({ q: (e.target as HTMLInputElement).value || null, page: null })
          }}
        />
        <button
          className={`btn ${issues ? 'btn-primary' : ''}`}
          onClick={() => go({ issues: issues ? null : '1', page: null })}
        >
          {issues ? 'แสดงทั้งหมด' : 'แสดงเฉพาะที่มีปัญหา'}
        </button>
        <span className="faint" style={{ fontSize: 13, marginLeft: 'auto' }}>ทั้งหมด {total} คน</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key}>
                  {c.sortable ? (
                    <Link href={sortHref(c.key)} className={`table-sort ${sort === c.key ? 'active' : ''}`}>
                      {c.label}{sort === c.key ? (asc ? ' ↑' : ' ↓') : ''}
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/candidates/${r.id}`} style={{ fontWeight: 500 }}>{r.full_name}</Link></td>
                <td className="muted">{r.headline ?? '—'}</td>
                <td className="muted">{r.location ?? '—'}</td>
                <td className="muted">{r.source}</td>
                <td className="muted">{r.years_experience ?? '—'}</td>
                <td className="muted">{r.updated_at.slice(0, 10)}</td>
                <td>
                  {r.duplicate && <span className="badge-issue badge-issue--dup">ชื่อซ้ำ</span>}
                  {r.missing.map((m) => (
                    <span key={m} className="badge-issue">ไม่มี{MISSING_LABELS[m]}</span>
                  ))}
                  {!r.duplicate && r.missing.length === 0 && <span className="faint">—</span>}
                </td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <p className="faint" style={{ marginTop: 14 }}>ไม่พบข้อมูล</p>}

      <div className="pager">
        <button className="btn" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>ก่อนหน้า</button>
        <span className="pager-info">หน้า {page} จาก {Math.max(totalPages, 1)}</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => go({ page: String(page + 1) })}>ถัดไป</button>
      </div>
    </div>
  )
}
```

หมายเหตุ: คอลัมน์ `<th></th>` และ `<td></td>` ท้ายสุดเว้นไว้สำหรับปุ่มแก้ไขที่ Task V4 จะเติม

- [ ] **Step 3: เขียนหน้า (server component)**

สร้าง `app/(app)/candidates/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { parsePage, parseSort, parseAsc, PAGE_SIZE } from '@/lib/candidates/listParams'
import { missingFields, buildIssuesOrFilter } from '@/lib/candidates/quality'
import CandidatesTable, { type CandidateRow } from '@/components/CandidatesTable'

export const dynamic = 'force-dynamic'

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string; q?: string; issues?: string }>
}) {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const sp = await searchParams
  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort)
  const asc = parseAsc(sp.dir)
  const q = (sp.q ?? '').trim()
  const issues = sp.issues === '1'

  const db = getServerClient()

  // ชื่อที่ซ้ำกันทั้งฐาน — ผลลัพธ์เล็กเพราะคืนเฉพาะชื่อที่ซ้ำ
  const { data: dupRows } = await db.rpc('duplicate_candidate_names')
  const duplicateNames: string[] = (dupRows ?? []).map((r: any) => r.full_name)
  const duplicateSet = new Set(duplicateNames)

  let query = db
    .from('candidates')
    .select(
      'id, full_name, headline, location, summary, linkedin_url, professional_email, source, years_experience, updated_at',
      { count: 'exact' }
    )

  if (q) query = query.or(`full_name.ilike.%${q}%,headline.ilike.%${q}%`)
  if (issues) query = query.or(buildIssuesOrFilter(duplicateNames))

  const from = (page - 1) * PAGE_SIZE
  const { data, count } = await query
    .order(sort, { ascending: asc })
    .range(from, from + PAGE_SIZE - 1)

  const pageRows = (data ?? []) as any[]
  const ids = pageRows.map((r) => r.id)

  // ดึงเฉพาะ id ที่ไม่มี embedding ในหน้านี้ — ไม่ดึงคอลัมน์ vector ออกมาทั้งก้อน
  let noEmbedding = new Set<string>()
  if (ids.length) {
    const { data: nulls } = await db
      .from('candidates')
      .select('id')
      .is('embedding', null)
      .in('id', ids)
    noEmbedding = new Set((nulls ?? []).map((r: any) => r.id))
  }

  const rows: CandidateRow[] = pageRows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    headline: r.headline,
    location: r.location,
    summary: r.summary,
    linkedin_url: r.linkedin_url,
    professional_email: r.professional_email,
    source: r.source,
    years_experience: r.years_experience,
    updated_at: r.updated_at ?? '',
    missing: missingFields({
      headline: r.headline,
      summary: r.summary,
      years_experience: r.years_experience,
      has_embedding: !noEmbedding.has(r.id),
    }),
    duplicate: duplicateSet.has(r.full_name),
  }))

  const total = count ?? 0

  return (
    <main>
      <h1>ข้อมูลผู้สมัคร</h1>
      <CandidatesTable
        rows={rows}
        page={page}
        totalPages={Math.ceil(total / PAGE_SIZE)}
        total={total}
        sort={sort}
        asc={asc}
        q={q}
        issues={issues}
      />
    </main>
  )
}
```

- [ ] **Step 4: สร้าง RPC หาชื่อซ้ำ**

สร้าง `supabase/migrations/010_duplicate_names.sql`:

```sql
-- คืนเฉพาะชื่อที่ปรากฏมากกว่าหนึ่งครั้ง ใช้ติด badge "ชื่อซ้ำ" ในหน้าตารางข้อมูล
-- Additive: เพิ่มฟังก์ชันใหม่ ไม่แตะตารางหรือฟังก์ชันเดิม
create or replace function duplicate_candidate_names()
returns table (full_name text)
language sql stable as $$
  select c.full_name
  from candidates c
  group by c.full_name
  having count(*) > 1;
$$;
```

รันไฟล์นี้ใน Supabase SQL editor แล้วตรวจว่าเรียกได้:

```sql
select * from duplicate_candidate_names();
```
Expected: คืนตาราง (อาจว่างถ้าไม่มีชื่อซ้ำ) โดยไม่มี error

- [ ] **Step 5: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run`
Expected: build ผ่าน, เทสต์เขียวทั้งหมด

- [ ] **Step 6: ตรวจด้วยตา**

`npm run dev` แล้วล็อกอินด้วยบัญชี admin เปิด `/candidates`

ตรวจ: ตารางแสดงข้อมูล · กดหัวคอลัมน์แล้วเรียงได้และ URL เปลี่ยน · พิมพ์ค้นหาแล้วกด Enter ได้ผล · ปุ่ม "แสดงเฉพาะที่มีปัญหา" กรองได้ · ปุ่มก่อนหน้า/ถัดไปทำงานและปิดตัวเองที่ขอบ · badge ปัญหาขึ้นถูก

จากนั้นเปลี่ยน role ตัวเองเป็น `member` ที่ `/admin/users` แล้วเปิด `/candidates` — ต้องถูกเด้งไป `/dashboard` แล้วเปลี่ยน role กลับเป็น admin

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/candidates/page.tsx" components/CandidatesTable.tsx app/globals.css supabase/migrations/010_duplicate_names.sql
git commit -m "feat(candidates): read-only data table with sorting, search, and quality badges"
```

---

### Task V4: แก้ไขข้อมูล + re-embed

**Files:**
- Create: `lib/candidates/update.ts`, `lib/candidates/update.test.ts`, `app/api/candidates/[id]/route.ts`, `components/EditCandidateModal.tsx`
- Modify: `components/CandidatesTable.tsx`

**Interfaces:**
- Consumes: `CandidateRow` (V3), `buildEmbedText` และ `CandidateInput` จาก `lib/ingest/normalize`, `embedText` จาก `lib/gemini/embed`, `hasRole` (V1)
- Produces:
  - `EditableFields = { full_name: string; headline: string | null; location: string | null; summary: string | null; linkedin_url: string | null; professional_email: string | null }`
  - `normalizeEditable(input: unknown): { ok: true; value: EditableFields } | { ok: false; error: string }`
  - `needsReembed(before: CandidateInput, after: CandidateInput): boolean`
  - `updateCandidateFields(id: string, fields: EditableFields): Promise<{ ok: true } | { ok: false; status: number; error: string }>`

- [ ] **Step 1: เขียนเทสต์ที่ต้องแดง**

สร้าง `lib/candidates/update.test.ts`:

```ts
import { normalizeEditable, needsReembed } from './update'
import type { CandidateInput } from '@/lib/ingest/normalize'

const base: CandidateInput = {
  full_name: 'Somchai Jaidee',
  headline: 'Data Scientist',
  summary: 'Analyst with 5 years',
  source: 'csv',
  skills: ['Python'],
  education: [{ degree: 'MSc', institution: 'MIT', country: 'USA' }],
  experience: [{ title: 'Analyst', company: 'Acme' }],
}

test('normalizeEditable trims and converts blanks to null', () => {
  const r = normalizeEditable({
    full_name: '  Somchai Jaidee  ',
    headline: '   ',
    location: 'Bangkok',
    summary: '',
    linkedin_url: undefined,
    professional_email: ' a@b.co ',
  })
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.value).toEqual({
    full_name: 'Somchai Jaidee',
    headline: null,
    location: 'Bangkok',
    summary: null,
    linkedin_url: null,
    professional_email: 'a@b.co',
  })
})

test('normalizeEditable rejects a blank name', () => {
  expect(normalizeEditable({ full_name: '   ' }).ok).toBe(false)
  expect(normalizeEditable({}).ok).toBe(false)
})

test('needsReembed is false when nothing changes', () => {
  expect(needsReembed(base, { ...base })).toBe(false)
})

test('needsReembed is false for fields outside the embed text', () => {
  expect(needsReembed(base, { ...base, location: 'Chiang Mai' })).toBe(false)
  expect(needsReembed(base, { ...base, linkedin_url: 'https://x.co/y' })).toBe(false)
  expect(needsReembed(base, { ...base, professional_email: 'new@b.co' })).toBe(false)
})

test('needsReembed is true when an embedded main field changes', () => {
  expect(needsReembed(base, { ...base, headline: 'ML Engineer' })).toBe(true)
  expect(needsReembed(base, { ...base, summary: 'Different' })).toBe(true)
  expect(needsReembed(base, { ...base, full_name: 'Somchai Jai' })).toBe(true)
})

test('needsReembed is true when child data changes', () => {
  expect(needsReembed(base, { ...base, skills: ['Python', 'SQL'] })).toBe(true)
  expect(needsReembed(base, { ...base, education: [{ degree: 'PhD', institution: 'MIT' }] })).toBe(true)
  expect(needsReembed(base, { ...base, experience: [{ title: 'Lead', company: 'Acme' }] })).toBe(true)
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/candidates/update.test.ts`
Expected: FAIL — ไม่พบโมดูล `./update`

- [ ] **Step 3: เขียน update.ts**

สร้าง `lib/candidates/update.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText, type CandidateInput } from '@/lib/ingest/normalize'

export type EditableFields = {
  full_name: string
  headline: string | null
  location: string | null
  summary: string | null
  linkedin_url: string | null
  professional_email: string | null
}

const blankToNull = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

export function normalizeEditable(
  input: unknown
): { ok: true; value: EditableFields } | { ok: false; error: string } {
  const i = (input ?? {}) as Record<string, unknown>
  const full_name = String(i.full_name ?? '').trim()
  if (!full_name) return { ok: false, error: 'กรุณากรอกชื่อผู้สมัคร' }
  return {
    ok: true,
    value: {
      full_name,
      headline: blankToNull(i.headline),
      location: blankToNull(i.location),
      summary: blankToNull(i.summary),
      linkedin_url: blankToNull(i.linkedin_url),
      professional_email: blankToNull(i.professional_email),
    },
  }
}

// เทียบข้อความที่จะ embed จริง แทนการไล่ระบุรายฟิลด์ — ถูกต้องอัตโนมัติกับทุกฟิลด์
// ทั้งฟิลด์หลักและข้อมูลลูก และยังถูกต้องต่อไปแม้มีคนเพิ่มฟิลด์เข้า buildEmbedText ภายหลัง
export function needsReembed(before: CandidateInput, after: CandidateInput): boolean {
  return buildEmbedText(before) !== buildEmbedText(after)
}

// แก้เฉพาะคอลัมน์บนตาราง candidates — ต่างจาก upsertCandidate ที่ลบ education/
// experience/candidate_skills ทิ้งแล้วเขียนใหม่ (เหมาะกับ ingest เท่านั้น)
export async function updateCandidateFields(
  id: string,
  fields: EditableFields
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const db = getServerClient()

  const { data: current } = await db
    .from('candidates')
    .select('full_name, headline, summary, source, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', id)
    .maybeSingle()

  if (!current) return { ok: false, status: 404, error: 'ไม่พบผู้สมัครคนนี้' }

  const c = current as any
  const skills: string[] = (c.candidate_skills ?? [])
    .map((x: any) => x.skills?.name)
    .filter(Boolean)

  const shared = {
    source: c.source,
    skills,
    education: c.education ?? [],
    experience: c.experience ?? [],
  }
  const before: CandidateInput = {
    ...shared,
    full_name: c.full_name,
    headline: c.headline ?? undefined,
    summary: c.summary ?? undefined,
  }
  const after: CandidateInput = {
    ...shared,
    full_name: fields.full_name,
    headline: fields.headline ?? undefined,
    summary: fields.summary ?? undefined,
  }

  const row: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }

  if (needsReembed(before, after)) {
    try {
      row.embedding = await embedText(buildEmbedText(after))
    } catch {
      // ไม่เขียนอะไรเลย ดีกว่าเขียนฟิลด์สำเร็จแล้วปล่อย embedding ค้างของเก่า
      // ซึ่งจะกลายเป็นข้อมูลไม่ตรงกันแบบเงียบที่ไม่มีสัญญาณเตือน
      return { ok: false, status: 502, error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' }
    }
  }

  const { error } = await db.from('candidates').update(row).eq('id', id)
  if (error) {
    if ((error as any).code === '23505') {
      return { ok: false, status: 409, error: 'LinkedIn URL นี้ถูกใช้กับผู้สมัครคนอื่นแล้ว' }
    }
    return { ok: false, status: 500, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run lib/candidates/update.test.ts`
Expected: PASS ทั้ง 6 เทสต์

- [ ] **Step 5: เขียน API route**

สร้าง `app/api/candidates/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { normalizeEditable, updateCandidateFields } from '@/lib/candidates/update'

// PATCH /api/candidates/[id]  body: EditableFields
// ต้องเป็น data_manager ขึ้นไป เขียนด้วย service-role client (bypass RLS)
// ปลอดภัยเพราะกั้นด้วย role ของผู้เรียกแล้ว
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้' }, { status: 403 })
  }

  const { id } = await params
  const parsed = normalizeEditable(await req.json())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const result = await updateCandidateFields(id, parsed.value)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: เขียน modal แก้ไข**

สร้าง `components/EditCandidateModal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CandidateRow } from './CandidatesTable'

const FIELDS: { key: keyof CandidateRow; label: string; textarea?: boolean }[] = [
  { key: 'full_name', label: 'ชื่อ' },
  { key: 'headline', label: 'ตำแหน่งย่อ' },
  { key: 'location', label: 'สถานที่' },
  { key: 'summary', label: 'สรุปโปรไฟล์', textarea: true },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'professional_email', label: 'อีเมล' },
]

export default function EditCandidateModal({
  row,
  onClose,
}: {
  row: CandidateRow
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: row.full_name ?? '',
    headline: row.headline ?? '',
    location: row.location ?? '',
    summary: row.summary ?? '',
    linkedin_url: row.linkedin_url ?? '',
    professional_email: row.professional_email ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/candidates/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">แก้ไขข้อมูลผู้สมัคร</h2>
        <div className="stack" style={{ gap: 10 }}>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <div className="field-label">{f.label}</div>
              {f.textarea ? (
                <textarea
                  className="textarea"
                  rows={4}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p style={{ color: 'var(--bad)', marginTop: 10 }}>{error}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: ต่อปุ่มแก้ไขเข้าตาราง**

ใน `components/CandidatesTable.tsx` ทำ 4 จุด:

7a. เพิ่ม import ที่หัวไฟล์:

```tsx
import { useState } from 'react'
import EditCandidateModal from './EditCandidateModal'
```

7b. เพิ่ม state ใต้บรรทัด `const params = useSearchParams()`:

```tsx
  const [editing, setEditing] = useState<CandidateRow | null>(null)
```

7c. แทนที่ `<td></td>` ท้ายแถวด้วย:

```tsx
                <td>
                  <button className="btn btn-ghost" onClick={() => setEditing(r)}>แก้ไข</button>
                </td>
```

7d. แทรกก่อน `</div>` ปิดท้ายของ component (หลังบล็อก `<div className="pager">`):

```tsx
      {editing && <EditCandidateModal row={editing} onClose={() => setEditing(null)} />}
```

- [ ] **Step 8: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run`
Expected: build ผ่าน, เทสต์เขียวทั้งหมด

- [ ] **Step 9: ตรวจด้วยตา**

`npm run dev` เปิด `/candidates`

1. กด "แก้ไข" แล้วเปลี่ยน **สถานที่** อย่างเดียว → บันทึกได้ ตารางอัปเดต (ไม่ยิง Gemini)
2. กด "แก้ไข" แล้วเปลี่ยน **ตำแหน่งย่อ** → บันทึกได้ (ยิง Gemini re-embed ช้ากว่าข้อ 1 เล็กน้อย)
3. ลบชื่อให้ว่างแล้วบันทึก → ขึ้น "กรุณากรอกชื่อผู้สมัคร" ไม่ใช่ error ดิบ
4. ใส่ LinkedIn URL ที่ซ้ำกับคนอื่น → ขึ้น "LinkedIn URL นี้ถูกใช้กับผู้สมัครคนอื่นแล้ว"
5. หาผู้สมัครที่ badge บอกว่า "ไม่มีเวกเตอร์ค้นหา" แล้วแก้ตำแหน่งย่อ → บันทึกเสร็จ badge นั้นต้องหายไป (เพราะ re-embed แล้ว)

- [ ] **Step 10: Commit**

```bash
git add lib/candidates/update.ts lib/candidates/update.test.ts "app/api/candidates/[id]/route.ts" components/EditCandidateModal.tsx components/CandidatesTable.tsx
git commit -m "feat(candidates): edit main fields with automatic re-embed"
```

---

### Task V5: เปลี่ยนรหัสผ่าน

**Files:**
- Create: `lib/auth/password.ts`, `lib/auth/password.test.ts`, `components/ChangePasswordCard.tsx`
- Modify: `app/(app)/settings/page.tsx`

**Interfaces:**
- Produces: `validatePasswordChange(current: string, next: string, confirm: string): string | null` — คืน `null` เมื่อผ่าน หรือข้อความ error ภาษาไทยเมื่อไม่ผ่าน

- [ ] **Step 1: เขียนเทสต์ที่ต้องแดง**

สร้าง `lib/auth/password.test.ts`:

```ts
import { validatePasswordChange } from './password'

test('valid input returns null', () => {
  expect(validatePasswordChange('oldpass', 'newpass', 'newpass')).toBeNull()
})

test('any empty field is rejected', () => {
  expect(validatePasswordChange('', 'newpass', 'newpass')).toBe('กรุณากรอกข้อมูลให้ครบทุกช่อง')
  expect(validatePasswordChange('oldpass', '', 'newpass')).toBe('กรุณากรอกข้อมูลให้ครบทุกช่อง')
  expect(validatePasswordChange('oldpass', 'newpass', '')).toBe('กรุณากรอกข้อมูลให้ครบทุกช่อง')
})

test('a short new password is rejected', () => {
  expect(validatePasswordChange('oldpass', '12345', '12345')).toBe(
    'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร'
  )
})

test('exactly six characters is accepted', () => {
  expect(validatePasswordChange('oldpass', '123456', '123456')).toBeNull()
})

test('a mismatched confirmation is rejected', () => {
  expect(validatePasswordChange('oldpass', 'newpass', 'newpazz')).toBe(
    'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
  )
})

test('reusing the current password is rejected', () => {
  expect(validatePasswordChange('samepass', 'samepass', 'samepass')).toBe(
    'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'
  )
})
```

- [ ] **Step 2: รันให้เห็นว่าแดง**

Run: `npx vitest run lib/auth/password.test.ts`
Expected: FAIL — ไม่พบโมดูล `./password`

- [ ] **Step 3: เขียน password.ts**

สร้าง `lib/auth/password.ts`:

```ts
// ตรวจฟอร์มเปลี่ยนรหัสผ่านก่อนยิงไป Supabase คืน null เมื่อผ่าน
// ความยาวขั้นต่ำ 6 ตัวอักษรตรงกับค่าเริ่มต้นของ Supabase Auth
export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current || !next || !confirm) return 'กรุณากรอกข้อมูลให้ครบทุกช่อง'
  if (next.length < 6) return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร'
  if (next !== confirm) return 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
  if (next === current) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'
  return null
}
```

- [ ] **Step 4: รันให้เขียว**

Run: `npx vitest run lib/auth/password.test.ts`
Expected: PASS ทั้ง 6 เทสต์

- [ ] **Step 5: เขียนการ์ดเปลี่ยนรหัสผ่าน**

สร้าง `components/ChangePasswordCard.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { validatePasswordChange } from '@/lib/auth/password'

export default function ChangePasswordCard() {
  const db = getBrowserClient()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const submit = async () => {
    if (busy) return
    setError('')
    setOk('')
    const invalid = validatePasswordChange(current, next, confirm)
    if (invalid) return setError(invalid)

    setBusy(true)
    const { data: { user } } = await db.auth.getUser()
    if (!user?.email) {
      setBusy(false)
      return setError('ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่')
    }

    // Supabase ไม่ตรวจรหัสผ่านเดิมให้ ต้องยืนยันตัวตนเองก่อนด้วยการล็อกอินซ้ำ
    const { error: signInError } = await db.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (signInError) {
      setBusy(false)
      return setError('รหัสผ่านเดิมไม่ถูกต้อง')
    }

    const { error: updateError } = await db.auth.updateUser({ password: next })
    setBusy(false)
    if (updateError) return setError('เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่')

    setCurrent('')
    setNext('')
    setConfirm('')
    setOk('เปลี่ยนรหัสผ่านแล้ว')
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>เปลี่ยนรหัสผ่าน</h3>
      <div className="stack" style={{ gap: 8 }}>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="รหัสผ่านเดิม" />
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="รหัสผ่านใหม่" />
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ยืนยันรหัสผ่านใหม่" />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
        </button>
        {ok && <span style={{ color: 'var(--ok)' }}>{ok}</span>}
      </div>
      {error && <p style={{ color: 'var(--bad)', marginBottom: 0 }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 6: ใส่การ์ดในหน้า settings**

ใน `app/(app)/settings/page.tsx` ทำ 2 จุด:

6a. เพิ่ม import ต่อจาก import เดิมที่หัวไฟล์:

```tsx
import ChangePasswordCard from '@/components/ChangePasswordCard'
```

6b. แทรก `<ChangePasswordCard />` คั่นระหว่างการ์ด "ตำแหน่ง/สกิลที่มองหาบ่อย" กับการ์ด "บัญชี" — คือวางไว้บรรทัดถัดจาก `</div>` ที่ปิดการ์ดแรก และก่อน `<div className="card" style={{ marginTop: 16 }}>` ของการ์ดบัญชี

- [ ] **Step 7: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run`
Expected: build ผ่าน, เทสต์เขียวทั้งหมด

- [ ] **Step 8: ตรวจด้วยตา**

`npm run dev` เปิด `/settings`

1. กรอกรหัสเดิมผิด → ขึ้น "รหัสผ่านเดิมไม่ถูกต้อง"
2. กรอกรหัสใหม่ไม่ตรงกัน → ขึ้นข้อความไม่ตรงกัน (ไม่ยิง API เลย)
3. กรอกถูกทั้งหมด → ขึ้น "เปลี่ยนรหัสผ่านแล้ว" จากนั้นออกจากระบบและล็อกอินด้วยรหัสใหม่ได้

- [ ] **Step 9: Commit**

```bash
git add lib/auth/password.ts lib/auth/password.test.ts components/ChangePasswordCard.tsx "app/(app)/settings/page.tsx"
git commit -m "feat(auth): change password with current-password verification"
```

---

### Task V6: ลืมรหัสผ่าน

**Files:**
- Create: `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`
- Modify: `app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `getBrowserClient` จาก `lib/supabase/client`, คลาส `.auth-wrap` และ `.card` จาก `app/globals.css`

- [ ] **Step 1: หน้าขอลิงก์รีเซ็ต**

สร้าง `app/(auth)/forgot-password/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (busy || !email.trim()) return
    setBusy(true)
    await getBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    // แสดงข้อความเดียวกันเสมอไม่ว่าอีเมลจะมีอยู่จริงหรือไม่
    // เพื่อไม่เปิดเผยว่าใครเป็นสมาชิกของระบบ
    setSent(true)
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>ลืมรหัสผ่าน</h1>
        {sent ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาตรวจกล่องจดหมาย
            </p>
            <a href="/login">กลับไปหน้าเข้าสู่ระบบ</a>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="อีเมล"
            />
            <button className="btn btn-primary" onClick={submit} disabled={busy || !email.trim()}>
              {busy ? 'กำลังส่ง…' : 'ส่งลิงก์รีเซ็ต'}
            </button>
            <a href="/login">กลับไปหน้าเข้าสู่ระบบ</a>
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: หน้าตั้งรหัสผ่านใหม่**

สร้าง `app/(auth)/reset-password/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export default function ResetPassword() {
  const db = getBrowserClient()
  const [ready, setReady] = useState<boolean | null>(null)
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // ผู้ใช้มาจากลิงก์ในอีเมลพร้อม recovery session ถ้าไม่มีแปลว่าเปิด URL ตรง
  // หรือลิงก์หมดอายุ
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await db.auth.getSession()
      setReady(!!session)
    })()
  }, [])

  const submit = async () => {
    if (busy) return
    setError('')
    if (next.length < 6) return setError('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร')
    if (next !== confirm) return setError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน')

    setBusy(true)
    const { error: updateError } = await db.auth.updateUser({ password: next })
    setBusy(false)
    if (updateError) return setError('ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาขอลิงก์ใหม่อีกครั้ง')
    window.location.href = '/dashboard'
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>ตั้งรหัสผ่านใหม่</h1>
        {ready === null && <p className="faint" style={{ margin: 0 }}>กำลังตรวจสอบลิงก์…</p>}
        {ready === false && (
          <>
            <p style={{ color: 'var(--bad)', margin: 0 }}>ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว</p>
            <a href="/forgot-password">ขอลิงก์ใหม่</a>
          </>
        )}
        {ready === true && (
          <>
            <input
              className="input"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="รหัสผ่านใหม่"
            />
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="ยืนยันรหัสผ่านใหม่"
            />
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
            </button>
            {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: เพิ่มลิงก์ในหน้า login**

ใน `app/(auth)/login/page.tsx` แทรกบรรทัดนี้ก่อน `<a href="/signup">ยังไม่มีบัญชี? สมัครสมาชิก</a>`:

```tsx
        <a href="/forgot-password">ลืมรหัสผ่าน?</a>
```

- [ ] **Step 4: ตั้งค่า Supabase dashboard**

ทำจาก repo ไม่ได้ ต้องทำด้วยมือ:

1. Supabase → Authentication → URL Configuration → Redirect URLs เพิ่ม `http://localhost:3000/reset-password` และ `https://<โดเมน-vercel>/reset-password`
2. Authentication → Email Templates → ตรวจว่า template "Reset Password" เปิดใช้งานอยู่

ถ้าข้ามขั้นนี้ ลิงก์ในอีเมลจะเด้งไปผิดที่ตอน production

- [ ] **Step 5: ตรวจ build + suite**

Run: `npm run build`
Run: `npx vitest run`
Expected: build ผ่าน, เทสต์เขียวทั้งหมด

- [ ] **Step 6: ตรวจด้วยตา**

`npm run dev`

1. เปิด `/reset-password` ตรงๆ โดยไม่ผ่านลิงก์อีเมล → ขึ้น "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว"
2. ที่ `/login` กด "ลืมรหัสผ่าน?" → ไปหน้า forgot-password
3. กรอกอีเมลจริงแล้วส่ง → ขึ้นข้อความยืนยัน และได้อีเมล
4. กดลิงก์ในอีเมล → เข้าหน้าตั้งรหัสใหม่ ตั้งได้ และล็อกอินด้วยรหัสใหม่ผ่าน

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/forgot-password/page.tsx" "app/(auth)/reset-password/page.tsx" "app/(auth)/login/page.tsx"
git commit -m "feat(auth): forgot and reset password flow"
```

---

## Self-Review

**Spec coverage:**

| ข้อกำหนดใน spec | Task |
|---|---|
| Migration เพิ่ม `data_manager` เข้า enum | V1 Step 5 |
| `hasRole` ลำดับชั้น + เทสต์เดิมยังเขียว | V1 Steps 1–4 |
| admin API รับค่า `data_manager` | V1 Step 6 |
| RoleSelect เพิ่มตัวเลือก | V1 Step 7 |
| navbar gate ตาม role ใหม่ + ลิงก์หน้าข้อมูล | V1 Step 10 |
| `/import` เพิ่ม server guard | V1 Steps 8–9 |
| หน้า `/candidates` + URL params + whitelist การเรียง | V2 + V3 |
| ตรวจค่า `page` ที่ไม่ถูกต้อง | V2 Step 3 (`parsePage`) |
| ค้นหา `ilike` + แบ่งหน้า + `count: exact` | V3 Step 3 |
| ตรวจข้อมูลไม่ครบ (รวม `embedding` ว่าง) | V2 Steps 5–7 |
| ชื่อซ้ำ + ตัวกรอง `issues=1` | V2 (`buildIssuesOrFilter`) + V3 (RPC) |
| เคสไม่มีชื่อซ้ำ / ชื่อมีจุลภาค | V2 Step 5 (มีเทสต์ทั้งสองเคส) |
| `updateCandidateFields` แยกจาก `upsertCandidate` | V4 Step 3 |
| re-embed ด้วยการเทียบข้อความ embed | V4 Step 3 (`needsReembed`) |
| Gemini ล้มเหลวแล้วไม่เขียนอะไรเลย | V4 Step 3 (บล็อก catch) |
| ตารางข้อความ error ทุกกรณี | V4 Steps 3, 5 |
| เปลี่ยนรหัสผ่าน + ยืนยันรหัสเดิม | V5 |
| ลืมรหัสผ่าน 2 หน้า + ลิงก์ในหน้า login | V6 |
| งานตั้งค่า Supabase dashboard | V6 Step 4 |
| Google login ไม่อยู่ในขอบเขต | ไม่มี task — ตรงตาม spec |

**Placeholder scan:** ไม่มี — ทุก step มีโค้ดจริงหรือคำสั่งจริงครบ

**Type consistency:**

- `Role` (V1) ใช้ใน `RoleSelect` (V1) และ guard ทุกหน้า (V1, V3, V4) — ตรงกัน
- `SortColumn` และ `PAGE_SIZE` (V2) ใช้ใน V3 — ตรงกัน
- `MissingField` และ `QualityRow` (V2) — `missingFields` รับ `has_embedding: boolean` ซึ่ง V3 คำนวณจาก `!noEmbedding.has(r.id)` — ตรงกัน
- `CandidateRow` ประกาศใน `components/CandidatesTable.tsx` (V3) และ import โดย `EditCandidateModal` (V4) — ชื่อและที่อยู่ตรงกัน
- `EditableFields` (V4) — คีย์ทั้ง 6 ตรงกับ `FIELDS` ใน modal และตรงกับคอลัมน์จริงในตาราง `candidates`
- `buildEmbedText` และ `CandidateInput` มาจาก `lib/ingest/normalize` ของเดิม ไม่ถูกแก้
- `validatePasswordChange` (V5) คืน `string | null` ใช้ใน `ChangePasswordCard` — ตรงกัน

**หมายเหตุสำหรับผู้ implement:** V1 ต้องทำก่อนเสมอ (ทุก task ใช้ `hasRole` ใหม่) และ **ต้องรัน migration 009 บน Supabase ให้เสร็จก่อนตั้ง role ให้ผู้ใช้จริง** V2 ต้องมาก่อน V3 และ V3 ก่อน V4 ส่วน V5 กับ V6 เป็นอิสระจาก V1–V4 สลับลำดับได้
