# Interactive Filter-Chip Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single free-text candidate search with a juicebox-style flow — type natural language, an LLM extracts an editable semantic query plus editable structured filter chips, and results update on chip edits without re-calling the LLM.

**Architecture:** One LLM call (`extractSearchIntent`) turns NL into `{ semanticQuery, filters }`. A new SQL RPC `match_candidates_filtered` applies the hard filters (skills, education-abroad, min years, field/degree) in the database before ranking by cosine similarity over the `semanticQuery` embedding. Role/title stays semantic (vector), not a hard filter. The API is split so chip edits hit `/api/search` (vector + SQL only) while only NL submits hit `/api/search/parse` (LLM).

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + pgvector, service-role server client), Gemini via `@google/genai`, Vitest.

## Global Constraints

- Gemini SDK `@google/genai` only. Embeddings `gemini-embedding-001`, `outputDimensionality: 768`, taskType `RETRIEVAL_QUERY` for the search query. Generation `gemini-flash-latest`.
- Match score: integer 0–100 everywhere (clamp `Math.max(0, Math.min(100, Math.round(sim*100)))`).
- Stored data English; the extracted filter values are English. This flow produces structured filters (no Thai reasoning).
- DB migrations additive; never drop/alter the `jobs` table or the existing `match_candidates` function.
- Service-role client (`lib/supabase/server.ts`) server-only. All new API routes require auth via `getSession`.
- Vitest does not auto-load `.env`; integration tests start with `import 'dotenv/config'` and clean up after themselves.
- Skills chip = candidate must have ALL listed skills (AND). Field/degree chip = ANY listed value (OR). Education-abroad = `anyForeign` (country ≠ 'Thailand') OR `countries[]` (studied in ANY listed).

## Existing building blocks reused

- `embedText(text, taskType?)` → `lib/gemini/embed.ts`.
- `getGemini()` → `lib/gemini/client.ts`.
- `getServerClient()` → `lib/supabase/server.ts` (service-role).
- `getSession()` → `lib/auth/session.ts`.
- `ScoreBadge` → `components/ScoreBadge.tsx`.
- `CandidateInput` (has `experience: { start_date?, end_date? }[]`) → `lib/ingest/normalize.ts`.
- `upsertCandidate` → `lib/ingest/upsert.ts`.

## File Structure

- `supabase/migrations/006_filtered_search.sql` — `match_candidates_filtered` RPC + `candidates.years_experience` column (Task 1).
- `lib/search/normalizeCountry.ts` — country canonicalization (Task 2).
- `lib/ingest/normalize.ts` — add `computeYearsExperience`; `lib/ingest/upsert.ts` — write the column; `scripts/backfill-years.ts` — one-off backfill (Task 3).
- `lib/search/extractFilters.ts` — `ChipFilters` type + `extractSearchIntent` (Task 4).
- `lib/search/query.ts` — rewrite `searchCandidates(semanticQuery, filters)` (Task 5).
- `app/api/search/parse/route.ts` (new) + `app/api/search/route.ts` (rewrite) (Task 6).
- `app/(app)/search/page.tsx` (rewrite) + `components/FilterChips.tsx` (Task 7).

## v1 note (documented deviation from spec)

Country normalization is applied to the CHIP values only (the LLM/user side), not to stored `education.country`. The synthetic generator already writes canonical country names, so stored-side normalization is unnecessary for v1. Future scraped data may need an ingest-time normalization pass — out of scope here.

---

### Task 1: Migration 006 — filtered-search RPC + years_experience column

**Files:**
- Create: `supabase/migrations/006_filtered_search.sql`
- Test: `supabase/migrations/006_filtered_search.test.ts`

**Interfaces:**
- Produces: `candidates.years_experience int` (nullable) and RPC
  `match_candidates_filtered(query_embedding vector(768), match_count int, p_skills text[], p_any_foreign boolean, p_countries text[], p_min_years int, p_field_or_degree text[])` returning `(id uuid, similarity float)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/006_filtered_search.sql`:

```sql
-- Interactive filter-chip search. Additive: adds a nullable column and a NEW
-- function. Does NOT drop/alter existing tables, the jobs table, or the
-- existing match_candidates function.

alter table public.candidates add column if not exists years_experience int;

-- Vector search with hard filters applied in SQL BEFORE ranking. Every filter
-- param is null / false / empty = "no constraint".
--   p_skills:          candidate must have ALL of these skill names (AND)
--   p_any_foreign:     true => must have an education row with country <> 'Thailand'
--   p_countries:       must have an education row whose country is in this list
--   p_min_years:       candidates.years_experience >= this
--   p_field_or_degree: must have an education row whose field_of_study OR degree
--                      is in this list (ANY)
create or replace function match_candidates_filtered(
  query_embedding vector(768),
  match_count int,
  p_skills text[] default null,
  p_any_foreign boolean default false,
  p_countries text[] default null,
  p_min_years int default null,
  p_field_or_degree text[] default null
)
returns table (id uuid, similarity float)
language sql stable as $$
  select c.id, 1 - (c.embedding <=> query_embedding) as similarity
  from candidates c
  where c.embedding is not null
    and (p_min_years is null or c.years_experience >= p_min_years)
    and (p_any_foreign = false or exists (
      select 1 from education e
      where e.candidate_id = c.id and e.country is not null and e.country <> 'Thailand'))
    and (p_countries is null or exists (
      select 1 from education e
      where e.candidate_id = c.id and e.country = any(p_countries)))
    and (p_field_or_degree is null or exists (
      select 1 from education e
      where e.candidate_id = c.id
        and (e.field_of_study = any(p_field_or_degree) or e.degree = any(p_field_or_degree))))
    and (p_skills is null or (
      select count(distinct s.name)
      from candidate_skills cs join skills s on s.id = cs.skill_id
      where cs.candidate_id = c.id and s.name = any(p_skills)
    ) = array_length(p_skills, 1))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

- [ ] **Step 2: Apply the migration**

Run the file in the Supabase SQL editor (this project applies migrations manually — see `CLAUDE.md`).

- [ ] **Step 3: Write the failing test**

Create `supabase/migrations/006_filtered_search.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Integration: the new RPC exists and, with all filters null, returns rows
// shaped { id, similarity }. Uses a zero query vector (ranking value irrelevant).
test('match_candidates_filtered exists and returns id+similarity with no filters', async () => {
  const db = getServerClient()
  // Non-zero vector: cosine distance to an all-zero vector is undefined (NaN).
  const { data, error } = await db.rpc('match_candidates_filtered', {
    query_embedding: Array(768).fill(0.1),
    match_count: 3,
  })
  expect(error).toBeNull()
  expect(Array.isArray(data)).toBe(true)
  for (const row of data ?? []) {
    expect(typeof row.id).toBe('string')
    // PostgREST serializes float (double precision) as a numeric string over the
    // API, so assert it is a finite numeric value rather than a JS number type.
    expect(Number.isFinite(Number(row.similarity))).toBe(true)
  }
}, 30000)

test('candidates.years_experience column is selectable', async () => {
  const { error } = await getServerClient().from('candidates').select('years_experience').limit(1)
  expect(error).toBeNull()
}, 30000)
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run supabase/migrations/006_filtered_search.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/006_filtered_search.sql supabase/migrations/006_filtered_search.test.ts
git commit -m "feat(search): migration 006 - match_candidates_filtered RPC + years_experience"
```

---

### Task 2: Country normalization

**Files:**
- Create: `lib/search/normalizeCountry.ts`
- Test: `lib/search/normalizeCountry.test.ts`

**Interfaces:**
- Produces: `normalizeCountry(input: string): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/search/normalizeCountry.test.ts`:

```ts
import { normalizeCountry } from './normalizeCountry'

test('canonicalizes common country aliases', () => {
  expect(normalizeCountry('United States')).toBe('USA')
  expect(normalizeCountry('united states of america')).toBe('USA')
  expect(normalizeCountry('U.K.')).toBe('UK')
  expect(normalizeCountry('England')).toBe('UK')
})

test('passes through unmapped values trimmed', () => {
  expect(normalizeCountry('  Japan ')).toBe('Japan')
  expect(normalizeCountry('USA')).toBe('USA')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/search/normalizeCountry.test.ts`
Expected: FAIL with "Cannot find module './normalizeCountry'".

- [ ] **Step 3: Write the implementation**

Create `lib/search/normalizeCountry.ts`:

```ts
// Canonicalize country names so the education-abroad chip is robust to the many
// ways a country is written. Unmapped values pass through (trimmed). v1 covers
// the common English aliases; extend as needed.
const MAP: Record<string, string> = {
  'united states': 'USA',
  'united states of america': 'USA',
  'us': 'USA',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  'usa': 'USA',
  'america': 'USA',
  'united kingdom': 'UK',
  'great britain': 'UK',
  'britain': 'UK',
  'u.k.': 'UK',
  'uk': 'UK',
  'england': 'UK',
}

export function normalizeCountry(input: string): string {
  const trimmed = input.trim()
  return MAP[trimmed.toLowerCase()] ?? trimmed
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/search/normalizeCountry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/normalizeCountry.ts lib/search/normalizeCountry.test.ts
git commit -m "feat(search): normalizeCountry canonicalization"
```

---

### Task 3: years_experience computation + ingest + backfill

**Files:**
- Modify: `lib/ingest/normalize.ts` (add `computeYearsExperience`)
- Modify: `lib/ingest/upsert.ts` (write the column)
- Create: `scripts/backfill-years.ts`
- Test: `lib/ingest/years.test.ts`

**Interfaces:**
- Consumes: `CandidateInput.experience` (`{ start_date?: string; end_date?: string }[]`), `candidates.years_experience` (Task 1).
- Produces: `computeYearsExperience(experience: { start_date?: string; end_date?: string }[]): number`.

- [ ] **Step 1: Write the failing test**

Create `lib/ingest/years.test.ts`:

```ts
import { computeYearsExperience } from './normalize'

test('sums durations across roles, rounding to whole years', () => {
  const years = computeYearsExperience([
    { start_date: '2018-01-01', end_date: '2021-01-01' }, // 3y
    { start_date: '2021-01-01', end_date: '2023-01-01' }, // 2y
  ])
  expect(years).toBe(5)
})

test('ignores rows with no start date and inverted ranges', () => {
  const years = computeYearsExperience([
    { end_date: '2021-01-01' },
    { start_date: '2023-01-01', end_date: '2020-01-01' },
    { start_date: '2019-01-01', end_date: '2021-01-01' }, // 2y
  ])
  expect(years).toBe(2)
})

test('returns 0 for empty input', () => {
  expect(computeYearsExperience([])).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest/years.test.ts`
Expected: FAIL with "computeYearsExperience is not a function" (or not exported).

- [ ] **Step 3: Add `computeYearsExperience` to `lib/ingest/normalize.ts`**

Append to `lib/ingest/normalize.ts` (after `buildEmbedText`):

```ts
// Total years of experience = sum of each role's duration (open-ended roles run
// to now). Overlapping roles may slightly overcount — acceptable for v1.
// Precomputed and stored on candidates.years_experience for fast filtering.
export function computeYearsExperience(
  experience: { start_date?: string; end_date?: string }[]
): number {
  let totalMs = 0
  for (const e of experience ?? []) {
    if (!e.start_date) continue
    const start = new Date(e.start_date).getTime()
    const end = e.end_date ? new Date(e.end_date).getTime() : Date.now()
    if (isNaN(start) || isNaN(end) || end < start) continue
    totalMs += end - start
  }
  return Math.round(totalMs / (365.25 * 24 * 60 * 60 * 1000))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ingest/years.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Write the column on upsert**

In `lib/ingest/upsert.ts`, update the import and the `row` object. Change the import line:

```ts
import { buildEmbedText, type CandidateInput } from './normalize'
```

to:

```ts
import { buildEmbedText, computeYearsExperience, type CandidateInput } from './normalize'
```

Then in the `row` object (the one with `full_name`, `headline`, …), add the field after `source`:

```ts
    source: input.source,
    years_experience: computeYearsExperience(input.experience ?? []),
    raw_data: input.raw ?? null,
```

- [ ] **Step 6: Write the backfill script**

Create `scripts/backfill-years.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { computeYearsExperience } from '@/lib/ingest/normalize'

// One-off: recompute candidates.years_experience for existing rows from their
// experience records. Idempotent.
// Usage:  npx tsx scripts/backfill-years.ts
async function main() {
  const db = getServerClient()
  const { data: rows } = await db.from('candidates').select('id, experience(start_date, end_date)')
  let done = 0
  for (const c of (rows ?? []) as any[]) {
    const years = computeYearsExperience(c.experience ?? [])
    await db.from('candidates').update({ years_experience: years }).eq('id', c.id)
    done++
  }
  console.log(`Backfilled years_experience for ${done} candidates.`)
}

main().catch((e) => {
  console.error('Backfill failed:', e?.message ?? e)
  process.exit(1)
})
```

- [ ] **Step 7: Run the backfill**

Run: `npx tsx scripts/backfill-years.ts`
Expected: prints `Backfilled years_experience for <N> candidates.`

- [ ] **Step 8: Commit**

```bash
git add lib/ingest/normalize.ts lib/ingest/upsert.ts lib/ingest/years.test.ts scripts/backfill-years.ts
git commit -m "feat(search): compute + store candidates.years_experience (+ backfill)"
```

---

### Task 4: Extract search intent (LLM → chips)

**Files:**
- Create: `lib/search/extractFilters.ts`
- Test: `lib/search/extractFilters.test.ts`

**Interfaces:**
- Consumes: `getGemini()` (`lib/gemini/client.ts`).
- Produces:
  ```
  type ChipFilters = {
    skills?: string[]
    educationAbroad?: { anyForeign?: boolean; countries?: string[] }
    minYears?: number
    fieldOrDegree?: string[]
  }
  type SearchIntent = { semanticQuery: string; filters: ChipFilters }
  extractSearchIntent(nl: string): Promise<SearchIntent>
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/search/extractFilters.test.ts`:

```ts
import { vi } from 'vitest'

vi.mock('@/lib/gemini/client', () => ({
  getGemini: () => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          semanticQuery: 'data scientist machine learning',
          filters: {
            skills: ['Python'],
            educationAbroad: { countries: ['USA'] },
            minYears: 3,
          },
        }),
      }),
    },
  }),
}))

import { extractSearchIntent } from './extractFilters'

test('parses the LLM JSON into semanticQuery + filters', async () => {
  const out = await extractSearchIntent('data scientist in Python who studied in the US, 3+ years')
  expect(out.semanticQuery).toBe('data scientist machine learning')
  expect(out.filters.skills).toEqual(['Python'])
  expect(out.filters.educationAbroad).toEqual({ countries: ['USA'] })
  expect(out.filters.minYears).toBe(3)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/search/extractFilters.test.ts`
Expected: FAIL with "Cannot find module './extractFilters'".

- [ ] **Step 3: Write the implementation**

Create `lib/search/extractFilters.ts`:

```ts
import { getGemini } from '@/lib/gemini/client'

export type ChipFilters = {
  skills?: string[]
  educationAbroad?: { anyForeign?: boolean; countries?: string[] }
  minYears?: number
  fieldOrDegree?: string[]
}

export type SearchIntent = { semanticQuery: string; filters: ChipFilters }

// Turns a natural-language recruiter query into a semantic query string (for
// vector search over role/skills meaning) plus structured hard-filter chips.
// One gemini-flash-latest call. English output for the structured values.
export async function extractSearchIntent(nl: string): Promise<SearchIntent> {
  const prompt = `You extract structured search filters from a recruiter's natural-language request. Respond with JSON ONLY, no prose.

Schema:
{
  "semanticQuery": "<short English phrase describing the ROLE and core skills, for semantic search>",
  "filters": {
    "skills": ["<hard skill>", ...],
    "educationAbroad": { "anyForeign": true }  // if they say studied abroad generally
      OR { "countries": ["USA", "UK", ...] },   // if they name countries (use short forms USA, UK)
    "minYears": <integer years of experience>,
    "fieldOrDegree": ["<field of study or degree>", ...]
  }
}

Rules:
- Omit any filter key not mentioned. Omit "filters" entirely if none apply.
- Put the job title / role in semanticQuery, NOT in filters.
- Output English values.

Request: ${nl}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
  })
  const parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return {
    semanticQuery: String(parsed.semanticQuery ?? nl),
    filters: (parsed.filters ?? {}) as ChipFilters,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/search/extractFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/extractFilters.ts lib/search/extractFilters.test.ts
git commit -m "feat(search): extractSearchIntent (NL -> semanticQuery + chip filters)"
```

---

### Task 5: Rewrite searchCandidates to use the filtered RPC

**Files:**
- Modify: `lib/search/query.ts` (rewrite)
- Test: `lib/search/query.test.ts` (rewrite)

**Interfaces:**
- Consumes: `embedText`, `normalizeCountry` (Task 2), `ChipFilters` (Task 4), `match_candidates_filtered` (Task 1).
- Produces: `SearchResult = { id: string; full_name: string; headline?: string; score: number }`; `searchCandidates(semanticQuery: string, filters: ChipFilters): Promise<SearchResult[]>`.

- [ ] **Step 1: Rewrite the test**

Replace the ENTIRE contents of `lib/search/query.test.ts` with:

```ts
import { vi } from 'vitest'

let rpcArgs: any = null
vi.mock('@/lib/gemini/embed', () => ({ embedText: async () => new Array(768).fill(0.1) }))
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (_name: string, args: any) => {
      rpcArgs = args
      return { data: [ { id: 'c1', similarity: 0.92 }, { id: 'c2', similarity: 0.71 } ] }
    },
    from: () => ({
      select: () => ({
        in: () => ({
          data: [ { id: 'c1', full_name: 'A', headline: 'X' }, { id: 'c2', full_name: 'B', headline: 'Y' } ],
        }),
      }),
    }),
  }),
}))

import { searchCandidates } from './query'

test('maps chip filters to RPC params and normalizes country values', async () => {
  const r = await searchCandidates('data scientist', {
    skills: ['Python'],
    educationAbroad: { countries: ['United States'] },
    minYears: 3,
  })
  expect(rpcArgs.p_skills).toEqual(['Python'])
  expect(rpcArgs.p_countries).toEqual(['USA'])
  expect(rpcArgs.p_min_years).toBe(3)
  expect(rpcArgs.p_any_foreign).toBe(false)
  expect(r.map((x) => x.id)).toEqual(['c1', 'c2'])
  expect(r[0].score).toBe(92)
  expect(r[1].score).toBe(71)
})

test('passes nulls / false when no filters given', async () => {
  await searchCandidates('anyone', {})
  expect(rpcArgs.p_skills).toBeNull()
  expect(rpcArgs.p_countries).toBeNull()
  expect(rpcArgs.p_min_years).toBeNull()
  expect(rpcArgs.p_field_or_degree).toBeNull()
  expect(rpcArgs.p_any_foreign).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/search/query.test.ts`
Expected: FAIL (old `searchCandidates` signature / no `rpcArgs` capture — assertions on `p_*` fail).

- [ ] **Step 3: Rewrite the implementation**

Replace the ENTIRE contents of `lib/search/query.ts` with:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { normalizeCountry } from './normalizeCountry'
import type { ChipFilters } from './extractFilters'

export type SearchResult = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100 semantic similarity
}

// Semantic search with hard filters. Embeds the semanticQuery, then delegates
// filtering + ranking to the match_candidates_filtered RPC (filters applied in
// SQL before ranking). Country chip values are canonicalized first.
export async function searchCandidates(
  semanticQuery: string,
  filters: ChipFilters
): Promise<SearchResult[]> {
  const db = getServerClient()
  const emb = await embedText(semanticQuery, 'RETRIEVAL_QUERY')

  const countries = filters.educationAbroad?.countries?.map(normalizeCountry) ?? null

  const { data: matches } = await db.rpc('match_candidates_filtered', {
    query_embedding: emb,
    match_count: 20,
    p_skills: filters.skills?.length ? filters.skills : null,
    p_any_foreign: filters.educationAbroad?.anyForeign ?? false,
    p_countries: countries && countries.length ? countries : null,
    p_min_years: filters.minYears ?? null,
    p_field_or_degree: filters.fieldOrDegree?.length ? filters.fieldOrDegree : null,
  })

  // PostgREST serializes float as a numeric string over the API — coerce to number.
  const sims = new Map<string, number>((matches ?? []).map((m: any) => [m.id, Number(m.similarity)]))
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows } = await db
    .from('candidates')
    .select('id, full_name, headline')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  return (ids.map((id) => byId.get(id)).filter(Boolean) as any[])
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      score: Math.max(0, Math.min(100, Math.round((sims.get(c.id) ?? 0) * 100))),
    }))
    .sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/search/query.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/search/query.ts lib/search/query.test.ts
git commit -m "feat(search): searchCandidates via match_candidates_filtered + chip filters"
```

---

### Task 6: API — parse (LLM) + search (no LLM)

**Files:**
- Create: `app/api/search/parse/route.ts`
- Create: `app/api/search/parse/route.test.ts`
- Modify: `app/api/search/route.ts` (rewrite)
- Create: `app/api/search/route.test.ts`

**Interfaces:**
- Consumes: `getSession`, `extractSearchIntent` (Task 4), `searchCandidates` (Task 5).
- Produces: `POST /api/search/parse` body `{ query }` → `SearchIntent`; `POST /api/search` body `{ semanticQuery, filters }` → `SearchResult[]`. Both 401 without a session.

- [ ] **Step 1: Write the failing parse-route test**

Create `app/api/search/parse/route.test.ts`:

```ts
import { vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ userId: 'u1', role: 'member' }) }))
vi.mock('@/lib/search/extractFilters', () => ({
  extractSearchIntent: async () => ({ semanticQuery: 'data scientist', filters: { skills: ['Python'] } }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/search/parse', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('returns extracted intent for a valid query', async () => {
  const res = await post({ query: 'data scientist in python' })
  const json = await res.json()
  expect(json.semanticQuery).toBe('data scientist')
  expect(json.filters.skills).toEqual(['Python'])
})

test('rejects a missing query', async () => {
  const res = await post({})
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/api/search/parse/route.test.ts`
Expected: FAIL with "Cannot find module './route'".

- [ ] **Step 3: Write the parse route**

Create `app/api/search/parse/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { extractSearchIntent } from '@/lib/search/extractFilters'

// POST /api/search/parse  body: { query }
// Auth required. Calls the LLM once to turn NL into { semanticQuery, filters }.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { query } = await req.json()
  if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 })

  return NextResponse.json(await extractSearchIntent(query))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/api/search/parse/route.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Write the failing search-route test**

Create `app/api/search/route.test.ts`:

```ts
import { vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ userId: 'u1', role: 'member' }) }))
vi.mock('@/lib/search/query', () => ({
  searchCandidates: async (sq: string) => [{ id: 'c1', full_name: 'A', headline: 'X', score: 90 }],
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/search', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('returns results for a valid semanticQuery', async () => {
  const res = await post({ semanticQuery: 'data scientist', filters: {} })
  const json = await res.json()
  expect(json[0].id).toBe('c1')
  expect(json[0].score).toBe(90)
})

test('rejects a missing semanticQuery', async () => {
  const res = await post({ filters: {} })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run app/api/search/route.test.ts`
Expected: FAIL (old route expects `{ query }`, has no auth guard, `semanticQuery` assertions fail).

- [ ] **Step 7: Rewrite the search route**

Replace the ENTIRE contents of `app/api/search/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { searchCandidates } from '@/lib/search/query'

// POST /api/search  body: { semanticQuery, filters }
// Auth required. No LLM — vector + SQL only. This is what chip edits call.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { semanticQuery, filters } = await req.json()
  if (!semanticQuery) {
    return NextResponse.json({ error: 'semanticQuery is required' }, { status: 400 })
  }
  return NextResponse.json(await searchCandidates(semanticQuery, filters ?? {}))
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run app/api/search/route.test.ts`
Expected: PASS (both).

- [ ] **Step 9: Commit**

```bash
git add "app/api/search/parse/route.ts" "app/api/search/parse/route.test.ts" app/api/search/route.ts app/api/search/route.test.ts
git commit -m "feat(search): /api/search/parse (LLM) + /api/search (vector+SQL) with auth"
```

---

### Task 7: UI — chip search page

**Files:**
- Create: `components/FilterChips.tsx`
- Modify: `app/(app)/search/page.tsx` (rewrite)

**Interfaces:**
- Consumes: `ChipFilters` (Task 4), `POST /api/search/parse`, `POST /api/search`, `ScoreBadge`.
- Produces: the reworked `/search` experience.

- [ ] **Step 1: Write the FilterChips component**

Create `components/FilterChips.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { ChipFilters } from '@/lib/search/extractFilters'

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#eef2ff',
  color: '#3730a3',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 13,
}

// Editable filter chips. All edits call onChange with the next ChipFilters;
// the parent re-runs the search (no LLM).
export default function FilterChips({
  filters,
  onChange,
}: {
  filters: ChipFilters
  onChange: (f: ChipFilters) => void
}) {
  const [skill, setSkill] = useState('')
  const [field, setField] = useState('')
  const [country, setCountry] = useState('')

  const skills = filters.skills ?? []
  const fields = filters.fieldOrDegree ?? []
  const abroad = filters.educationAbroad
  const countries = abroad?.countries ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '12px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {skills.map((s) => (
          <span key={s} style={pillStyle}>
            สกิล: {s}
            <button
              aria-label={`ลบ ${s}`}
              onClick={() => onChange({ ...filters, skills: skills.filter((x) => x !== s) })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && skill.trim()) {
              onChange({ ...filters, skills: [...skills, skill.trim()] })
              setSkill('')
            }
          }}
          placeholder="+ สกิล"
          style={{ width: 100 }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!abroad?.anyForeign}
            onChange={(e) =>
              onChange({
                ...filters,
                educationAbroad: e.target.checked ? { anyForeign: true } : undefined,
              })
            }
          />{' '}
          จบต่างประเทศ (ทั่วไป)
        </label>
        {countries.map((c) => (
          <span key={c} style={pillStyle}>
            จบ: {c}
            <button
              aria-label={`ลบ ${c}`}
              onClick={() =>
                onChange({
                  ...filters,
                  educationAbroad: { countries: countries.filter((x) => x !== c) },
                })
              }
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && country.trim()) {
              onChange({ ...filters, educationAbroad: { countries: [...countries, country.trim()] } })
              setCountry('')
            }
          }}
          placeholder="+ ประเทศ"
          style={{ width: 100 }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {fields.map((f) => (
          <span key={f} style={pillStyle}>
            สาขา: {f}
            <button
              aria-label={`ลบ ${f}`}
              onClick={() => onChange({ ...filters, fieldOrDegree: fields.filter((x) => x !== f) })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && field.trim()) {
              onChange({ ...filters, fieldOrDegree: [...fields, field.trim()] })
              setField('')
            }
          }}
          placeholder="+ สาขา/ปริญญา"
          style={{ width: 130 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        ประสบการณ์ขั้นต่ำ (ปี):
        <input
          type="number"
          min={0}
          value={filters.minYears ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              minYears: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          style={{ width: 70 }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the search page**

Replace the ENTIRE contents of `app/(app)/search/page.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import FilterChips from '@/components/FilterChips'
import type { ChipFilters } from '@/lib/search/extractFilters'

export default function SearchPage() {
  const [nl, setNl] = useState('')
  const [semanticQuery, setSemanticQuery] = useState('')
  const [filters, setFilters] = useState<ChipFilters>({})
  const [res, setRes] = useState<any[]>([])
  const [parsing, setParsing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [ran, setRan] = useState(false)

  // Run search from a given semanticQuery + filters (no LLM).
  const runSearch = async (sq: string, f: ChipFilters) => {
    if (!sq.trim()) return
    setSearching(true)
    setRan(true)
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ semanticQuery: sq, filters: f }),
    })
    const json = await r.json()
    setRes(Array.isArray(json) ? json : [])
    setSearching(false)
  }

  // Parse NL -> chips (LLM), then search.
  const parseAndSearch = async () => {
    if (!nl.trim() || parsing) return
    setParsing(true)
    const r = await fetch('/api/search/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: nl }),
    })
    const intent = await r.json()
    setParsing(false)
    const sq = intent.semanticQuery ?? nl
    const f = intent.filters ?? {}
    setSemanticQuery(sq)
    setFilters(f)
    await runSearch(sq, f)
  }

  // Chip edits: update state and re-run immediately (no LLM).
  const onFiltersChange = (f: ChipFilters) => {
    setFilters(f)
    runSearch(semanticQuery, f)
  }

  return (
    <main>
      <h1>ค้นหาผู้สมัคร</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input
          style={{ flex: 1 }}
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && parseAndSearch()}
          placeholder="พิมพ์ภาษาธรรมชาติ เช่น data scientist สาย Python ที่จบจากอเมริกา 3 ปีขึ้นไป"
        />
        <button onClick={parseAndSearch} disabled={parsing || !nl}>
          {parsing ? 'กำลังอ่าน…' : 'ค้นหา'}
        </button>
      </div>

      {semanticQuery && (
        <>
          <div style={{ fontSize: 13, color: '#777', marginBottom: 4 }}>คำอธิบายที่ค้นหา (แก้ได้)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ flex: 1 }}
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(semanticQuery, filters)}
            />
            <button onClick={() => runSearch(semanticQuery, filters)} disabled={searching}>
              ค้นหาใหม่
            </button>
          </div>
          <FilterChips filters={filters} onChange={onFiltersChange} />
        </>
      )}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {res.map((c) => (
          <li
            key={c.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f2f2f2' }}
          >
            <ScoreBadge score={c.score} />
            <Link href={`/candidates/${c.id}`} style={{ fontWeight: 600 }}>
              {c.full_name}
            </Link>
            <span style={{ color: '#888' }}>{c.headline}</span>
          </li>
        ))}
      </ul>
      {ran && !searching && res.length === 0 && <p style={{ color: '#888' }}>ไม่พบผู้สมัคร</p>}
    </main>
  )
}
```

- [ ] **Step 3: Verify build + manual smoke test**

Run: `npm run build`
Expected: compiles; `/search`, `/api/search`, `/api/search/parse` all listed.

Then `npm run dev`, log in, open `/search`. Type "data scientist สาย Python ที่จบจากอเมริกา 3 ปีขึ้นไป" → confirm chips appear (Skill: Python, จบ: USA, ประสบการณ์ 3). Remove the Python chip → results re-rank without a spinner delay from the LLM. Edit the semantic box and press "ค้นหาใหม่" → results update.

- [ ] **Step 4: Commit**

```bash
git add components/FilterChips.tsx "app/(app)/search/page.tsx"
git commit -m "feat(search): chip-based search UI (editable semantic query + filter chips)"
```

---

## Self-Review

**Spec coverage:**
- NL → semanticQuery + editable chips → Tasks 4 (extract), 7 (UI).
- 5 chips (skills, education-abroad hybrid, min years, field/degree; role = semantic) → Task 4 type + Task 1 RPC + Task 7 UI.
- Hard filters in SQL before ranking → Task 1 RPC; Task 5 maps params.
- Skills AND / field-degree OR / education-abroad anyForeign|countries → encoded in Task 1 SQL.
- Precomputed years_experience → Task 1 (column) + Task 3 (compute/ingest/backfill).
- Country normalization (chip-side, v1) → Task 2, used in Task 5.
- API split parse(LLM)/search(no LLM), both auth-guarded → Task 6.
- Quota: LLM once per NL submit → Task 6 parse route + Task 7 (chip edits call /api/search only).
- jobs table + match_candidates untouched → Task 1 is additive.

**Placeholder scan:** none — every step has full code, exact paths, exact commands.

**Type consistency:**
- `ChipFilters` defined in Task 4, consumed identically in Tasks 5, 6 (via searchCandidates), 7 (FilterChips + page).
- RPC param names (`p_skills, p_any_foreign, p_countries, p_min_years, p_field_or_degree`) identical in Task 1 SQL and Task 5 call.
- `SearchResult` (`id, full_name, headline?, score`) defined in Task 5, read in Task 7.
- `computeYearsExperience(experience[])` defined in Task 3, used in upsert (Task 3) and backfill (Task 3).
- `searchCandidates(semanticQuery, filters)` signature consistent across Tasks 5, 6.

**Implementer note:** Tasks 1, 3 are integration tests hitting Supabase; Task 4's test mocks Gemini (offline). Run integration test files individually. Task 3's backfill and Task 1's migration must be applied before Task 7's manual min-years/country testing returns meaningful results.
