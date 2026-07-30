# LinkedIn CSV Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import real candidates from a PhantomBuster LinkedIn CSV export into the existing candidate schema, deterministically (no LLM), deduped by LinkedIn profile URL, via a new `/import` upload page.

**Architecture:** A new deterministic parser (`parseLinkedInCsv`) turns a PhantomBuster CSV into `CandidateInput[]` — header-tolerant (accepts `firstName` or `First Name`), capturing current + previous job and school, splitting skills, and dropping education country. Each row flows through the existing `upsertCandidate`, which gains a `linkedin_url`-first dedup rule and writes three new columns. The ingest API adds a `type: 'linkedin'` branch; a new `/import` page uploads the CSV and shows the result.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + service-role client), PapaParse, Vitest.

## Global Constraints

- Deterministic mapping only — NO LLM in this ingest path (no quota cost, no JSON-parse risk).
- Education `country` is dropped for scraped rows (left null); "educated abroad" is guaranteed at scrape time.
- Header-tolerant: accept BOTH camelCase keys (`firstName`) and friendly labels (`First Name`); both normalize (lowercase, strip non-alphanumerics) to one lookup key.
- Dedup scraped rows on `linkedin_url` (stable, unique); non-scraped rows keep the existing `full_name` (+ first-education country) rule. Single ingest path via `upsertCandidate`.
- DB migrations additive; never drop/alter the `jobs` table.
- Service-role client (`lib/supabase/server.ts`) server-only; `/api/ingest` requires an authenticated session (already enforced).
- Stored data English (LinkedIn data is already English/romanized).
- Vitest does not auto-load `.env`; integration tests start with `import 'dotenv/config'` and clean up after themselves.
- Capture current + previous job and school only (2 each) — the export's ceiling; the schema holds more, so fuller history is a future parser.

## Existing building blocks reused

- `upsertCandidate(input, createdBy)` → `lib/ingest/upsert.ts` (embed + dedup + child rows).
- `CandidateInput`, `buildEmbedText`, `computeYearsExperience`, `toIsoDate` → `lib/ingest/normalize.ts`.
- `parseCsv` → `lib/ingest/csv.ts` (the sibling generic CSV path).
- `POST /api/ingest` with `getSession` guard → `app/api/ingest/route.ts`.
- `candidates.source` enum already includes `'scraper'`.

## File Structure

- `supabase/migrations/008_linkedin_fields.sql` — 3 new columns + unique linkedin_url index (Task L1).
- `lib/ingest/linkedinDate.ts` — `parseLinkedInDateRange` (Task L2).
- `lib/ingest/normalize.ts` — extend `CandidateInput`; `lib/ingest/linkedin.ts` — `parseLinkedInCsv` (Task L3).
- `lib/ingest/upsert.ts` — new columns + linkedin_url dedup (Task L4).
- `app/api/ingest/route.ts` — `type: 'linkedin'` (Task L5).
- `app/(app)/import/page.tsx` + `middleware.ts` + `app/(app)/layout.tsx` — upload UI + guard + nav (Task L6).

---

### Task L1: Migration 008 — LinkedIn columns + dedup index

**Files:**
- Create: `supabase/migrations/008_linkedin_fields.sql`
- Test: `supabase/migrations/008_linkedin_fields.test.ts`

**Interfaces:**
- Produces: `candidates.linkedin_url text`, `candidates.professional_email text`, `candidates.refreshed_at timestamptz`, and a partial unique index on `linkedin_url`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/008_linkedin_fields.sql`:

```sql
-- LinkedIn scraper ingest support. Additive: adds nullable columns + a partial
-- unique index for dedup. Does NOT drop/alter the jobs table or existing columns.
alter table candidates add column if not exists linkedin_url text;
alter table candidates add column if not exists professional_email text;
alter table candidates add column if not exists refreshed_at timestamptz;

create unique index if not exists candidates_linkedin_url_key
  on candidates (linkedin_url) where linkedin_url is not null;
```

- [ ] **Step 2: Apply the migration**

Run the file in the Supabase SQL editor (this project applies migrations manually — see `CLAUDE.md`).

- [ ] **Step 3: Write the failing test**

Create `supabase/migrations/008_linkedin_fields.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Integration: the new columns exist and linkedin_url is uniquely constrained.
test('candidates has linkedin columns and a unique linkedin_url', async () => {
  const db = getServerClient()
  const url = `__test__url_${Date.now()}`
  const embedding = Array(768).fill(0)

  const { data: a, error: e1 } = await db
    .from('candidates')
    .insert({
      full_name: '__test__ LI A',
      source: 'scraper',
      embedding,
      linkedin_url: url,
      professional_email: 'a@example.com',
      refreshed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  expect(e1).toBeNull()

  // Duplicate linkedin_url must violate the unique index.
  const { error: e2 } = await db
    .from('candidates')
    .insert({ full_name: '__test__ LI B', source: 'scraper', embedding, linkedin_url: url })
  expect(e2).not.toBeNull()

  await db.from('candidates').delete().eq('id', (a as any).id)
}, 30000)
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run supabase/migrations/008_linkedin_fields.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/008_linkedin_fields.sql supabase/migrations/008_linkedin_fields.test.ts
git commit -m "feat(ingest): migration 008 - linkedin columns + dedup index"
```

---

### Task L2: LinkedIn date-range parser

**Files:**
- Create: `lib/ingest/linkedinDate.ts`
- Test: `lib/ingest/linkedinDate.test.ts`

**Interfaces:**
- Produces: `parseLinkedInDateRange(s?: string): { start_date: string | null; end_date: string | null }` (ISO `YYYY-MM-DD` or null).

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/linkedinDate.test.ts`:

```ts
import { parseLinkedInDateRange } from './linkedinDate'

test('parses year-year ranges', () => {
  expect(parseLinkedInDateRange('2015 - 2019')).toEqual({ start_date: '2015-01-01', end_date: '2019-01-01' })
})

test('parses month-year start with a Present end', () => {
  expect(parseLinkedInDateRange('Jan 2020 - Present')).toEqual({ start_date: '2020-01-01', end_date: null })
})

test('a single value is the start, end null', () => {
  expect(parseLinkedInDateRange('2020')).toEqual({ start_date: '2020-01-01', end_date: null })
})

test('blank or undefined -> both null', () => {
  expect(parseLinkedInDateRange('')).toEqual({ start_date: null, end_date: null })
  expect(parseLinkedInDateRange(undefined)).toEqual({ start_date: null, end_date: null })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest/linkedinDate.test.ts`
Expected: FAIL with "Cannot find module './linkedinDate'".

- [ ] **Step 3: Write the implementation**

Create `lib/ingest/linkedinDate.ts`:

```ts
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Parse one endpoint ("2019", "Jan 2020") into ISO YYYY-MM-DD, or null for
// "Present"/"Current"/blank/unparseable.
function parseEndpoint(part: string): string | null {
  const s = part.trim()
  if (!s || /present|current/i.test(s)) return null
  const ym = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/)
  if (ym) {
    const m = MONTHS[ym[1].toLowerCase()]
    if (m) return `${ym[2]}-${m}-01`
  }
  const y = s.match(/(\d{4})/)
  return y ? `${y[1]}-01-01` : null
}

// Parse a LinkedIn date range ("2015 - 2019", "Jan 2020 - Present", "2020")
// into ISO start/end. A single value is treated as the start.
export function parseLinkedInDateRange(
  s?: string
): { start_date: string | null; end_date: string | null } {
  if (!s || !s.trim()) return { start_date: null, end_date: null }
  const parts = s.split(/[-–—]| to /i)
  const start = parseEndpoint(parts[0] ?? '')
  const end = parts.length > 1 ? parseEndpoint(parts[1] ?? '') : null
  return { start_date: start, end_date: end }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ingest/linkedinDate.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/linkedinDate.ts lib/ingest/linkedinDate.test.ts
git commit -m "feat(ingest): LinkedIn date-range parser"
```

---

### Task L3: CandidateInput fields + parseLinkedInCsv

**Files:**
- Modify: `lib/ingest/normalize.ts` (extend `CandidateInput`)
- Create: `lib/ingest/linkedin.ts`
- Test: `lib/ingest/linkedin.test.ts`

**Interfaces:**
- Consumes: `parseLinkedInDateRange` (L2), `CandidateInput`.
- Produces:
  - `CandidateInput` gains optional `linkedin_url?: string`, `professional_email?: string`, `refreshed_at?: string`.
  - `parseLinkedInCsv(text: string): CandidateInput[]`.

- [ ] **Step 1: Extend `CandidateInput` in `lib/ingest/normalize.ts`**

Find this line:

```ts
  source: 'synthetic' | 'csv' | 'upload' | 'scraper'
```

Replace with:

```ts
  source: 'synthetic' | 'csv' | 'upload' | 'scraper'
  linkedin_url?: string
  professional_email?: string
  refreshed_at?: string
```

- [ ] **Step 2: Write the failing test**

Create `lib/ingest/linkedin.test.ts`:

```ts
import { parseLinkedInCsv } from './linkedin'

const camel = `firstName,lastName,linkedinHeadline,linkedinProfileUrl,linkedinJobTitle,companyName,linkedinJobDateRange,linkedinPreviousJobTitle,previousCompanyName,linkedinSchoolName,linkedinSchoolDegree,linkedinSchoolFieldOfStudy,linkedinSchoolDateRange,linkedinSkillsLabel,professionalEmail
Somchai,Jaidee,Data Scientist,https://linkedin.com/in/somchai,Senior Data Scientist,Agoda,Jan 2020 - Present,Data Analyst,SCB,MIT,Master of Science,Computer Science,2015 - 2017,"Python; SQL, Machine Learning",somchai@x.com`

const friendly = `First Name,Last Name,Linkedin Headline,Linkedin Profile Url,Linkedin Job Title,Company Name,Linkedin Job Date Range,Linkedin School Name,Linkedin School Degree,Linkedin School Date Range,Linkedin Skills Label
Somchai,Jaidee,Data Scientist,https://linkedin.com/in/somchai,Senior Data Scientist,Agoda,Jan 2020 - Present,MIT,Master of Science,2015 - 2017,Python; SQL`

test('parses camelCase headers into a full CandidateInput', () => {
  const [c] = parseLinkedInCsv(camel)
  expect(c.full_name).toBe('Somchai Jaidee')
  expect(c.source).toBe('scraper')
  expect(c.linkedin_url).toBe('https://linkedin.com/in/somchai')
  expect(c.professional_email).toBe('somchai@x.com')
  expect(c.experience).toHaveLength(2)
  expect(c.experience![0]).toMatchObject({ title: 'Senior Data Scientist', company: 'Agoda', start_date: '2020-01-01' })
  expect(c.experience![0].end_date).toBeUndefined()
  expect(c.education).toHaveLength(1)
  expect(c.education![0]).toMatchObject({ institution: 'MIT', degree: 'Master of Science', field_of_study: 'Computer Science', start_year: 2015, end_year: 2017 })
  expect(c.education![0]).not.toHaveProperty('country')
  expect(c.skills).toEqual(['Python', 'SQL', 'Machine Learning'])
})

test('friendly-label headers parse identically (header tolerance)', () => {
  const [c] = parseLinkedInCsv(friendly)
  expect(c.full_name).toBe('Somchai Jaidee')
  expect(c.linkedin_url).toBe('https://linkedin.com/in/somchai')
  expect(c.education![0].institution).toBe('MIT')
  expect(c.skills).toEqual(['Python', 'SQL'])
})

test('skips rows with no name', () => {
  const csv = `firstName,lastName\n,\nSomchai,Jaidee`
  expect(parseLinkedInCsv(csv)).toHaveLength(1)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/ingest/linkedin.test.ts`
Expected: FAIL with "Cannot find module './linkedin'".

- [ ] **Step 4: Write the implementation**

Create `lib/ingest/linkedin.ts`:

```ts
import Papa from 'papaparse'
import type { CandidateInput } from './normalize'
import { parseLinkedInDateRange } from './linkedinDate'

// Normalize a header/key to a lookup token: lowercase, strip non-alphanumerics.
// "firstName" and "First Name" both become "firstname".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function makeGetter(row: Record<string, string>) {
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(row)) map.set(norm(k), v ?? '')
  return (key: string) => (map.get(norm(key)) ?? '').trim()
}

const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : undefined)

// Parse a PhantomBuster LinkedIn CSV export into CandidateInput rows.
// Deterministic (no LLM). Accepts camelCase or friendly-label headers. Captures
// current + previous job and school. Education country is intentionally omitted.
export function parseLinkedInCsv(text: string): CandidateInput[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return data
    .map((row): CandidateInput | null => {
      const get = makeGetter(row)
      const full_name = [get('firstName'), get('lastName')].filter(Boolean).join(' ').trim()
      if (!full_name) return null

      const experience: NonNullable<CandidateInput['experience']> = []
      const cur = parseLinkedInDateRange(get('linkedinJobDateRange'))
      if (get('linkedinJobTitle') || get('companyName')) {
        experience.push({
          company: get('companyName') || undefined,
          title: get('linkedinJobTitle') || undefined,
          start_date: cur.start_date ?? undefined,
          end_date: cur.end_date ?? undefined,
          description: get('linkedinJobDescription') || undefined,
        })
      }
      const prev = parseLinkedInDateRange(get('linkedinPreviousJobDateRange'))
      if (get('linkedinPreviousJobTitle') || get('previousCompanyName')) {
        experience.push({
          company: get('previousCompanyName') || undefined,
          title: get('linkedinPreviousJobTitle') || undefined,
          start_date: prev.start_date ?? undefined,
          end_date: prev.end_date ?? undefined,
          description: get('linkedinPreviousJobDescription') || undefined,
        })
      }

      const education: NonNullable<CandidateInput['education']> = []
      const sch = parseLinkedInDateRange(get('linkedinSchoolDateRange'))
      if (get('linkedinSchoolName')) {
        education.push({
          institution: get('linkedinSchoolName') || undefined,
          degree: get('linkedinSchoolDegree') || undefined,
          field_of_study: get('linkedinSchoolFieldOfStudy') || undefined,
          start_year: yearOf(sch.start_date),
          end_year: yearOf(sch.end_date),
        })
      }
      const psch = parseLinkedInDateRange(get('linkedinPreviousSchoolDateRange'))
      if (get('linkedinPreviousSchoolName')) {
        education.push({
          institution: get('linkedinPreviousSchoolName') || undefined,
          degree: get('linkedinPreviousSchoolDegree') || undefined,
          field_of_study: get('linkedinPreviousSchoolFieldOfStudy') || undefined,
          start_year: yearOf(psch.start_date),
          end_year: yearOf(psch.end_date),
        })
      }

      const skillsRaw = get('linkedinSkillsLabel')
      const skills = skillsRaw
        ? [...new Set(skillsRaw.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean))]
        : undefined

      return {
        full_name,
        headline: get('linkedinHeadline') || undefined,
        location: get('location') || undefined,
        summary: get('linkedinDescription') || undefined,
        source: 'scraper',
        linkedin_url: get('linkedinProfileUrl') || get('profileUrl') || undefined,
        professional_email: get('professionalEmail') || undefined,
        refreshed_at: get('refreshedAt') || undefined,
        education: education.length ? education : undefined,
        experience: experience.length ? experience : undefined,
        skills,
        raw: row,
      }
    })
    .filter((r): r is CandidateInput => r !== null)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/ingest/linkedin.test.ts`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/normalize.ts lib/ingest/linkedin.ts lib/ingest/linkedin.test.ts
git commit -m "feat(ingest): parseLinkedInCsv (deterministic, header-tolerant)"
```

---

### Task L4: upsert — new columns + linkedin_url dedup

**Files:**
- Modify: `lib/ingest/upsert.ts` (rewrite)
- Test: `lib/ingest/linkedin.upsert.test.ts`

**Interfaces:**
- Consumes: extended `CandidateInput` (L3), `candidates` linkedin columns (L1).
- Produces: `upsertCandidate` unchanged signature `(input, createdBy?) => Promise<{ id, updated }>`, now writing linkedin columns and deduping on `linkedin_url` when present.

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/linkedin.upsert.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertCandidate } from './upsert'

// Integration: scraped candidate dedups on linkedin_url even if the name changes.
const URL = `__test__li_${Date.now()}`

test('scraped candidate dedups on linkedin_url', async () => {
  const base = {
    full_name: '__test__ LinkedIn Person',
    source: 'scraper' as const,
    linkedin_url: URL,
    professional_email: 'a@example.com',
    experience: [{ title: 'Data Scientist', company: 'Agoda', start_date: '2019-01-01', end_date: '2023-01-01' }],
  }

  const a = await upsertCandidate(base, null)
  expect(a.updated).toBe(false)

  const b = await upsertCandidate({ ...base, full_name: '__test__ Renamed' }, null)
  expect(b.updated).toBe(true)
  expect(b.id).toBe(a.id)

  await getServerClient().from('candidates').delete().eq('id', a.id)
}, 30000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest/linkedin.upsert.test.ts`
Expected: FAIL — the current upsert dedups on full_name, so the renamed second call inserts a new row (`updated` false) or the linkedin_url unique index throws.

- [ ] **Step 3: Rewrite `lib/ingest/upsert.ts`**

Replace the ENTIRE contents of `lib/ingest/upsert.ts` with:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText, computeYearsExperience, toIsoDate, type CandidateInput } from './normalize'

// Writes a candidate (+ education, experience, skills) to the DB.
// Dedup: scraped rows dedup on linkedin_url (stable unique); otherwise on
// full_name (+ matching first-education country). Returns the row id and
// whether it was an update.
export async function upsertCandidate(input: CandidateInput, createdBy: string | null = null) {
  const db = getServerClient()
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

  return { id: candidateId, updated }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ingest/linkedin.upsert.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the existing (non-scraped) upsert path still passes**

Run: `npx vitest run lib/ingest/upsert.test.ts`
Expected: PASS (the `full_name`+country dedup path is unchanged for non-linkedin input).

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/upsert.ts lib/ingest/linkedin.upsert.test.ts
git commit -m "feat(ingest): upsert writes linkedin columns + dedups on linkedin_url"
```

---

### Task L5: Ingest API — `type: 'linkedin'`

**Files:**
- Modify: `app/api/ingest/route.ts` (rewrite)
- Modify: `app/api/ingest/route.test.ts` (rewrite — keep existing cases, add linkedin)

**Interfaces:**
- Consumes: `parseLinkedInCsv` (L3), `upsertCandidate`, `getSession`.
- Produces: `POST /api/ingest` accepts `{ type: 'linkedin', csv }` → `{ imported, updated, errors }`.

- [ ] **Step 1: Rewrite the test**

Replace the ENTIRE contents of `app/api/ingest/route.test.ts` with:

```ts
import { vi } from 'vitest'

vi.mock('@/lib/ingest/csv', () => ({
  parseCsv: () => [
    { full_name: 'A', source: 'csv' },
    { full_name: 'B', source: 'csv' },
  ],
}))
vi.mock('@/lib/ingest/linkedin', () => ({
  parseLinkedInCsv: () => [
    { full_name: 'L1', source: 'scraper' },
    { full_name: 'L2', source: 'scraper' },
  ],
}))
const upsertMock = vi.fn(async () => ({ id: 'x', updated: false }))
vi.mock('@/lib/ingest/upsert', () => ({ upsertCandidate: (...a: any[]) => upsertMock(...a) }))
vi.mock('@/lib/gemini/parse', () => ({
  parseResume: async () => ({ full_name: 'R', source: 'upload' }),
}))
vi.mock('@/lib/auth/session', () => ({
  getSession: async () => ({ userId: 'u1', role: 'member' }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/ingest', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('csv ingest imports each parsed row', async () => {
  const res = await post({ type: 'csv', csv: 'a', mapping: {}, userId: 'u1' })
  const json = await res.json()
  expect(json.imported).toBe(2)
  expect(json.updated).toBe(0)
})

test('linkedin ingest imports each parsed row', async () => {
  const res = await post({ type: 'linkedin', csv: 'a' })
  const json = await res.json()
  expect(json.imported).toBe(2)
})

test('upload ingest parses resume then upserts once', async () => {
  const res = await post({ type: 'upload', text: 'resume', userId: 'u1' })
  const json = await res.json()
  expect(json.imported + json.updated).toBe(1)
})

test('rejects unknown type', async () => {
  const res = await post({ type: 'bogus' })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/ingest/route.test.ts`
Expected: FAIL — the route has no `linkedin` branch yet (the linkedin test gets a 400 / import error).

- [ ] **Step 3: Rewrite the route**

Replace the ENTIRE contents of `app/api/ingest/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { parseCsv } from '@/lib/ingest/csv'
import { parseLinkedInCsv } from '@/lib/ingest/linkedin'
import { parseResume } from '@/lib/gemini/parse'
import { upsertCandidate } from '@/lib/ingest/upsert'
import { getSession } from '@/lib/auth/session'
import type { CandidateInput } from '@/lib/ingest/normalize'

// POST /api/ingest
//   { type: 'csv',      csv: string, mapping: Record<string,string> }
//   { type: 'linkedin', csv: string }
//   { type: 'upload',   text: string }
// Returns { imported, updated, errors }. Requires an authenticated session.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.userId

  const body = await req.json()
  let inputs: CandidateInput[] = []
  if (body.type === 'csv') {
    inputs = parseCsv(body.csv, body.mapping)
  } else if (body.type === 'linkedin') {
    inputs = parseLinkedInCsv(body.csv)
  } else if (body.type === 'upload') {
    inputs = [await parseResume(body.text)]
  } else {
    return NextResponse.json({ error: 'type must be "csv", "linkedin", or "upload"' }, { status: 400 })
  }

  let imported = 0
  let updated = 0
  const errors: string[] = []
  for (const input of inputs) {
    try {
      const r = await upsertCandidate(input, userId)
      r.updated ? updated++ : imported++
    } catch (e: any) {
      errors.push(`${input.full_name}: ${e?.message ?? e}`)
    }
  }

  return NextResponse.json({ imported, updated, errors })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/api/ingest/route.test.ts`
Expected: PASS (all four).

- [ ] **Step 5: Commit**

```bash
git add app/api/ingest/route.ts app/api/ingest/route.test.ts
git commit -m "feat(ingest): /api/ingest type 'linkedin'"
```

---

### Task L6: Import page + route guard + nav

**Files:**
- Create: `app/(app)/import/page.tsx`
- Modify: `middleware.ts` (add `/import` to the matcher)
- Modify: `app/(app)/layout.tsx` (nav link)

**Interfaces:**
- Consumes: `POST /api/ingest` with `{ type: 'linkedin', csv }`.
- Produces: the `/import` page.

- [ ] **Step 1: Guard `/import` in middleware**

In `middleware.ts`, find:

```ts
    '/search/:path*',
    '/jobs/:path*',
```

Replace with:

```ts
    '/search/:path*',
    '/jobs/:path*',
    '/import/:path*',
```

- [ ] **Step 2: Add the nav link**

In `app/(app)/layout.tsx`, find:

```tsx
        <Link href="/shortlists">Shortlist</Link>
```

Replace with:

```tsx
        <Link href="/shortlists">Shortlist</Link>
        <Link href="/import">นำเข้า</Link>
```

- [ ] **Step 3: Write the import page**

Create `app/(app)/import/page.tsx`:

```tsx
'use client'
import { useState } from 'react'

type Result = { imported: number; updated: number; errors: string[] }

// Upload a PhantomBuster LinkedIn CSV export and import candidates.
export default function ImportPage() {
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
    <main>
      <h1>นำเข้าข้อมูล LinkedIn (CSV)</h1>
      <p style={{ color: '#777', fontSize: 14 }}>
        อัปโหลดไฟล์ CSV ที่ export จาก PhantomBuster แล้วกดนำเข้า
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '16px 0' }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        <button onClick={run} disabled={!csv || importing}>
          {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
        </button>
      </div>
      {fileName && <p style={{ fontSize: 13, color: '#888' }}>ไฟล์: {fileName}</p>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <p>
            เพิ่มใหม่ <strong>{result.imported}</strong> · อัปเดต{' '}
            <strong>{result.updated}</strong> · ผิดพลาด{' '}
            <strong>{result.errors.length}</strong>
          </p>
          {result.errors.length > 0 && (
            <ul style={{ color: '#dc2626', fontSize: 13 }}>
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {result.imported + result.updated === 0 && result.errors.length === 0 && (
            <p style={{ color: '#888' }}>ไม่พบข้อมูลในไฟล์</p>
          )}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Verify build + manual smoke test**

Run: `npm run build`
Expected: compiles; `/import` listed.

Then `npm run dev`, log in, open `/import`. Upload a small PhantomBuster CSV (or a two-row test CSV with `firstName,lastName,linkedinProfileUrl,linkedinHeadline,linkedinSkillsLabel` headers). Confirm the result shows imported/updated counts, the candidates appear on `/dashboard` and are findable via `/search`, and re-uploading the same file reports them as `updated` (not duplicated).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/import/page.tsx" middleware.ts "app/(app)/layout.tsx"
git commit -m "feat(ingest): /import upload page + route guard + nav"
```

---

## Self-Review

**Spec coverage:**
- CSV upload flow (upload → import → result) → Task L6 + L5.
- Deterministic mapping, header tolerance → Task L3 (`parseLinkedInCsv`, `norm`/`makeGetter`).
- Field mapping (2 jobs, 2 schools, skills split, country null) → Task L3.
- New columns linkedin_url/professional_email/refreshed_at + dedup index → Task L1.
- Dedup on linkedin_url, single ingest path → Task L4.
- Date-range parsing → Task L2, used in L3.
- API type 'linkedin', auth guard → Task L5 (guard already in the route).
- `/import` guarded + nav → Task L6.
- Migration additive, jobs untouched → Task L1.

**Placeholder scan:** none — every step has full code, exact paths, exact commands.

**Type consistency:**
- `CandidateInput` extended in L3 (`linkedin_url`, `professional_email`, `refreshed_at`), consumed in L3 (`parseLinkedInCsv` output), L4 (`upsertCandidate` row), and mocked in L5.
- `parseLinkedInDateRange(s?) => { start_date, end_date }` defined L2, called in L3.
- `parseLinkedInCsv(text) => CandidateInput[]` defined L3, called in L5 route.
- `upsertCandidate(input, createdBy?) => { id, updated }` signature unchanged (L4), consumed by the L5 route.
- Row columns (`linkedin_url`, `professional_email`, `refreshed_at`) match the migration column names (L1).

**Implementer note:** L1, L4 are integration tests hitting Supabase (L4 also embeds via Gemini) — run those files individually; apply migration 008 before L4. L2, L3, L5 tests are offline (pure logic / mocked).
