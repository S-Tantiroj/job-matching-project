# Job Matching (Job → Candidates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an HR user create a job, then see the best-matching candidates ranked by semantic similarity, with an on-demand LLM deep-fit score per candidate.

**Architecture:** Jobs are embedded into the same 768-dim space as candidates, so a job's stored vector can be ranked against candidate vectors via the existing `match_candidates` RPC (fast, no per-result LLM cost). Deep per-pair fit scoring reuses the existing `analyzeCandidate` + `analyses` cache through a new shared `scoreCandidateAgainst` helper — a job simply becomes a "requirement" string. New code lives in `lib/jobs/` and `app/(app)/jobs/`; the existing `jobs` table and `import_jobs.py` are never altered.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres + pgvector + service-role server client), Gemini via `@google/genai`, Vitest.

## Global Constraints

- Gemini SDK: `@google/genai` only — NOT `@google/generative-ai`.
- Embeddings: model `gemini-embedding-001`, `outputDimensionality: 768`, taskType `RETRIEVAL_DOCUMENT` when indexing (jobs are indexed as documents, same as candidates, so vectors are comparable) / `RETRIEVAL_QUERY` when embedding a live search query.
- Generation: model `gemini-flash-latest`.
- Data language stored in tables is English (romanized). AI reasoning (`analyze` output) stays Thai.
- Match score: integer 0–100 everywhere.
- DB migrations are additive — never drop or alter the existing `jobs` table (enabling RLS and adding a policy is allowed; altering/dropping columns is not).
- Service-role Supabase client (`lib/supabase/server.ts`) is server-only; never import into a client component.
- Secrets live in `.env` only (git-ignored).
- Vitest does not auto-load `.env`; integration tests start with `import 'dotenv/config'` and must clean up after themselves (unique name, delete on teardown).

## Existing building blocks this plan reuses (do not reimplement)

- `embedText(text, taskType?)` → `lib/gemini/embed.ts` (defaults to `RETRIEVAL_DOCUMENT`, returns `number[]`).
- `match_candidates(query_embedding vector(768), match_count int)` RPC → returns `{ id, similarity }[]` (similarity = `1 - cosine_distance`).
- `analyzeCandidate(profile, requirement)` → `lib/gemini/analyze.ts` returns `{ score: number; reasoning: string }` (Thai reasoning).
- `requirementHash(text)` → `lib/gemini/cache.ts`.
- `analyses` table: `(candidate_id, requirement_text, requirement_hash, score, reasoning)`, unique `(candidate_id, requirement_hash)`.
- `getServerClient()` → `lib/supabase/server.ts` (service-role, bypasses RLS).
- `getSession()` → `lib/auth/session.ts` returns `{ userId, role } | null`.
- `ScoreBadge` → `components/ScoreBadge.tsx` (`{ score: number }`).

## `jobs` table (verified live schema — do not change)

Columns: `id uuid pk`, `title varchar not null`, `company varchar`, `description text not null`, `required_skills text[]`, `min_experience_years int`, `location varchar`, `category varchar`, `redirect_url text`, `source varchar`, `external_id varchar`, `embedding vector(768)`, `created_at timestamp`. Unique constraint `unique_source_external_id (source, external_id)`. Index `jobs_embedding_idx` on `embedding`. RLS currently disabled.

## File Structure

- `supabase/migrations/005_jobs_matching.sql` — enable RLS + read policy on `jobs` (Task 1).
- `lib/jobs/normalize.ts` — `JobInput` type, `buildJobEmbedText`, `buildJobRequirementText` (Task 2).
- `lib/jobs/upsert.ts` — `upsertJob` (Task 3).
- `app/api/jobs/route.ts` — `POST` create job (Task 4).
- `lib/jobs/match.ts` — `matchCandidatesForJob` (Task 5).
- `lib/gemini/score.ts` — `scoreCandidateAgainst` (shared deep-score); `app/api/analyze/route.ts` refactored to use it; `app/api/jobs/[id]/analyze/route.ts` new (Task 6).
- `app/(app)/jobs/page.tsx`, `components/CreateJobForm.tsx`, `app/(app)/jobs/[id]/page.tsx`, `components/JobMatches.tsx`, nav link in `app/(app)/layout.tsx` (Task 7).
- `scripts/seed-jobs.ts`; `README.md` + `CLAUDE.md` updates (Task 8).

---

### Task 1: Enable RLS + read policy on `jobs`

**Files:**
- Create: `supabase/migrations/005_jobs_matching.sql`
- Test: `supabase/migrations/005_jobs_matching.test.ts`

**Interfaces:**
- Consumes: existing `jobs` table.
- Produces: `jobs` readable by authenticated users; writes remain service-role/`import_jobs.py` only.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/005_jobs_matching.sql`:

```sql
-- Job-matching support. Additive: enables RLS + a read policy on the existing
-- jobs table (created by import_jobs.py). Does NOT drop or alter any jobs column.
-- Deep job-fit scores reuse the existing `analyses` table (keyed by
-- candidate_id + requirement_hash), so no new score table is needed.

alter table public.jobs enable row level security;

drop policy if exists "read jobs for authed" on public.jobs;
create policy "read jobs for authed" on public.jobs
  for select using (auth.role() = 'authenticated');

-- No insert/update policy: job writes go through the service-role server client
-- (bypasses RLS) and import_jobs.py (direct postgres connection, bypasses RLS).
```

- [ ] **Step 2: Apply the migration**

Run the file in the Supabase SQL editor (or `supabase db push`). This project applies migrations manually — see `CLAUDE.md`.

- [ ] **Step 3: Write the failing round-trip test**

Create `supabase/migrations/005_jobs_matching.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Integration: proves the jobs table is writable/readable via the service-role
// client after migration 005. Uses a zero vector (embedding value is irrelevant
// here) and cleans up.
test('jobs table round-trips via server client', async () => {
  const db = getServerClient()
  const embedding = Array(768).fill(0)
  const { data, error } = await db
    .from('jobs')
    .insert({ title: `__test__ job ${Date.now()}`, description: 'x', source: 'test', embedding })
    .select('id')
    .single()
  expect(error).toBeNull()
  const id = (data as any).id

  const { data: read } = await db.from('jobs').select('id').eq('id', id).single()
  expect((read as any).id).toBe(id)

  await db.from('jobs').delete().eq('id', id)
}, 30000)
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run supabase/migrations/005_jobs_matching.test.ts`
Expected: PASS (fails before the migration is applied if RLS/table access is misconfigured).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_jobs_matching.sql supabase/migrations/005_jobs_matching.test.ts
git commit -m "feat(jobs): enable RLS + read policy on jobs table (migration 005)"
```

---

### Task 2: Job normalization helpers

**Files:**
- Create: `lib/jobs/normalize.ts`
- Test: `lib/jobs/normalize.test.ts`

**Interfaces:**
- Produces:
  - `type JobInput = { title: string; company?: string; description: string; required_skills?: string[]; min_experience_years?: number; location?: string; category?: string; source?: string; external_id?: string }`
  - `buildJobEmbedText(j: JobInput): string`
  - `buildJobRequirementText(j: JobInput): string`

- [ ] **Step 1: Write the failing test**

Create `lib/jobs/normalize.test.ts`:

```ts
import { buildJobEmbedText, buildJobRequirementText } from './normalize'

const job = {
  title: 'Data Scientist',
  company: 'Acme',
  description: 'Build ML models',
  required_skills: ['Python', 'SQL'],
  min_experience_years: 3,
  location: 'Bangkok',
}

test('buildJobEmbedText includes title, skills, and description', () => {
  const t = buildJobEmbedText(job)
  expect(t).toContain('Data Scientist')
  expect(t).toContain('Python')
  expect(t).toContain('Build ML models')
})

test('buildJobRequirementText includes role, skills, and min experience', () => {
  const t = buildJobRequirementText(job)
  expect(t).toContain('Data Scientist')
  expect(t).toContain('Python')
  expect(t).toContain('3')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/jobs/normalize.test.ts`
Expected: FAIL with "Cannot find module './normalize'".

- [ ] **Step 3: Write the implementation**

Create `lib/jobs/normalize.ts`:

```ts
export type JobInput = {
  title: string
  company?: string
  description: string
  required_skills?: string[]
  min_experience_years?: number
  location?: string
  category?: string
  source?: string
  external_id?: string
}

// Flatten a job into one text blob for embedding — same 768-dim space as
// candidates so job and candidate vectors are directly comparable.
export function buildJobEmbedText(j: JobInput): string {
  return [
    j.title,
    j.company,
    j.category,
    j.location,
    (j.required_skills ?? []).join(', '),
    j.min_experience_years != null ? `${j.min_experience_years}+ years experience` : '',
    j.description,
  ]
    .filter(Boolean)
    .join('\n')
}

// Human-readable requirement string fed to the LLM deep-scorer (reuses
// analyzeCandidate + the analyses cache). English for uniformity with stored
// data; the model still returns Thai reasoning.
export function buildJobRequirementText(j: JobInput): string {
  const parts = [`Role: ${j.title}`]
  if (j.company) parts.push(`Company: ${j.company}`)
  if (j.required_skills?.length) parts.push(`Required skills: ${j.required_skills.join(', ')}`)
  if (j.min_experience_years != null) parts.push(`Minimum experience: ${j.min_experience_years} years`)
  if (j.location) parts.push(`Location: ${j.location}`)
  parts.push(`Description: ${j.description}`)
  return parts.join('. ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/jobs/normalize.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/normalize.ts lib/jobs/normalize.test.ts
git commit -m "feat(jobs): job normalize + embed/requirement text builders"
```

---

### Task 3: Upsert a job (embed + dedup)

**Files:**
- Create: `lib/jobs/upsert.ts`
- Test: `lib/jobs/upsert.test.ts`

**Interfaces:**
- Consumes: `JobInput` (Task 2), `embedText` (`lib/gemini/embed.ts`), `getServerClient`.
- Produces: `upsertJob(input: JobInput): Promise<{ id: string; updated: boolean }>`.

- [ ] **Step 1: Write the failing test**

Create `lib/jobs/upsert.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertJob } from './upsert'

// Integration: requires Supabase env + Gemini key (embeds on insert). Uses a
// unique external_id so the second call dedups on (source, external_id).
const EXT = `__test__${Date.now()}`

test('upsertJob inserts, then updates the same job on duplicate source+external_id', async () => {
  const base = {
    title: '__test__ Data Scientist',
    description: 'Build ML models',
    source: 'test',
    external_id: EXT,
  }

  const a = await upsertJob(base)
  expect(a.updated).toBe(false)

  const b = await upsertJob({ ...base, company: 'Acme' })
  expect(b.updated).toBe(true)
  expect(b.id).toBe(a.id)

  await getServerClient().from('jobs').delete().eq('id', a.id)
}, 30000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/jobs/upsert.test.ts`
Expected: FAIL with "Cannot find module './upsert'".

- [ ] **Step 3: Write the implementation**

Create `lib/jobs/upsert.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildJobEmbedText, type JobInput } from './normalize'

// Writes a job to the DB with a 768-dim embedding (RETRIEVAL_DOCUMENT, the
// embedText default). Dedup: when external_id is present, upsert on the existing
// unique (source, external_id) constraint; otherwise insert a new row. Returns
// the row id and whether an existing row was updated.
export async function upsertJob(input: JobInput): Promise<{ id: string; updated: boolean }> {
  const db = getServerClient()
  const embedding = await embedText(buildJobEmbedText(input))
  const source = input.source ?? 'manual'

  const row = {
    title: input.title,
    company: input.company ?? null,
    description: input.description,
    required_skills: input.required_skills ?? null,
    min_experience_years: input.min_experience_years ?? null,
    location: input.location ?? null,
    category: input.category ?? null,
    source,
    external_id: input.external_id ?? null,
    embedding,
  }

  if (input.external_id) {
    const { data: existing } = await db
      .from('jobs')
      .select('id')
      .eq('source', source)
      .eq('external_id', input.external_id)
      .maybeSingle()

    const { data } = await db
      .from('jobs')
      .upsert(row, { onConflict: 'source,external_id' })
      .select('id')
      .single()

    return { id: (data as any).id, updated: !!existing }
  }

  const { data } = await db.from('jobs').insert(row).select('id').single()
  return { id: (data as any).id, updated: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/jobs/upsert.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/upsert.ts lib/jobs/upsert.test.ts
git commit -m "feat(jobs): upsertJob with embedding + (source, external_id) dedup"
```

---

### Task 4: Create-job API

**Files:**
- Create: `app/api/jobs/route.ts`
- Test: `app/api/jobs/route.test.ts`

**Interfaces:**
- Consumes: `getSession`, `upsertJob`, `JobInput`.
- Produces: `POST /api/jobs` — body `JobInput`; `401` if unauthenticated; `400` if missing `title`/`description`; else `{ id, updated }`.

- [ ] **Step 1: Write the failing test**

Create `app/api/jobs/route.test.ts`:

```ts
import { vi } from 'vitest'

const upsertMock = vi.fn(async () => ({ id: 'job1', updated: false }))
vi.mock('@/lib/jobs/upsert', () => ({ upsertJob: (...a: any[]) => upsertMock(...a) }))
vi.mock('@/lib/auth/session', () => ({
  getSession: async () => ({ userId: 'u1', role: 'member' }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/jobs', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('creates a job from a valid body', async () => {
  const res = await post({ title: 'Data Scientist', description: 'Build models' })
  const json = await res.json()
  expect(json.id).toBe('job1')
})

test('rejects a body missing title or description', async () => {
  const res = await post({ title: 'No description' })
  expect(res.status).toBe(400)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/jobs/route.test.ts`
Expected: FAIL with "Cannot find module './route'".

- [ ] **Step 3: Write the implementation**

Create `app/api/jobs/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { upsertJob } from '@/lib/jobs/upsert'
import type { JobInput } from '@/lib/jobs/normalize'

// POST /api/jobs  body: JobInput. Auth required. Creates (or upserts) a job.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<JobInput>
  if (!body.title || !body.description) {
    return NextResponse.json({ error: 'title and description are required' }, { status: 400 })
  }

  const result = await upsertJob(body as JobInput)
  return NextResponse.json(result)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/jobs/route.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/jobs/route.ts app/api/jobs/route.test.ts
git commit -m "feat(jobs): POST /api/jobs create endpoint"
```

---

### Task 5: Rank candidates for a job

**Files:**
- Create: `lib/jobs/match.ts`
- Test: `lib/jobs/match.test.ts`

**Interfaces:**
- Consumes: `getServerClient`, `match_candidates` RPC, existing candidate rows.
- Produces:
  - `type JobMatch = { id: string; full_name: string; headline?: string; score: number }`
  - `matchCandidatesForJob(jobId: string, matchCount?: number): Promise<JobMatch[]>`

- [ ] **Step 1: Write the failing test**

Create `lib/jobs/match.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertJob } from './upsert'
import { matchCandidatesForJob } from './match'

// Integration: seeds a temp job, ranks existing candidates, asserts shape and
// score bounds. Requires candidates to already exist in the DB. Cleans up.
test('matchCandidatesForJob returns candidates scored 0..100 descending', async () => {
  const { id } = await upsertJob({
    title: '__test__ Data Scientist',
    description: 'Python machine learning, studied abroad',
    source: 'test',
    external_id: `__test__match${Date.now()}`,
  })

  const results = await matchCandidatesForJob(id, 10)
  expect(Array.isArray(results)).toBe(true)
  for (const r of results) {
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(typeof r.full_name).toBe('string')
  }
  const scores = results.map((r) => r.score)
  expect(scores).toEqual([...scores].sort((a, b) => b - a))

  await getServerClient().from('jobs').delete().eq('id', id)
}, 30000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/jobs/match.test.ts`
Expected: FAIL with "Cannot find module './match'".

- [ ] **Step 3: Write the implementation**

Create `lib/jobs/match.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'

export type JobMatch = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100, vector similarity in the shared 768-dim space
}

// Rank candidates for a job by cosine similarity, reusing the match_candidates
// RPC with the job's stored embedding (no new embedding call, no LLM cost).
export async function matchCandidatesForJob(
  jobId: string,
  matchCount = 20
): Promise<JobMatch[]> {
  const db = getServerClient()

  const { data: job } = await db.from('jobs').select('embedding').eq('id', jobId).single()
  if (!job || !(job as any).embedding) return []

  // pgvector may come back as a JSON string; match_candidates wants an array.
  const raw = (job as any).embedding
  const embedding = typeof raw === 'string' ? JSON.parse(raw) : raw

  const { data: matches } = await db.rpc('match_candidates', {
    query_embedding: embedding,
    match_count: matchCount,
  })
  const sims = new Map<string, number>((matches ?? []).map((m: any) => [m.id, m.similarity]))
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
      score: Math.round((sims.get(c.id) ?? 0) * 100),
    }))
    .sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/jobs/match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/match.ts lib/jobs/match.test.ts
git commit -m "feat(jobs): matchCandidatesForJob vector ranking"
```

---

### Task 6: Shared deep-score helper + job deep-score API

**Files:**
- Create: `lib/gemini/score.ts`
- Create: `lib/gemini/score.test.ts`
- Modify: `app/api/analyze/route.ts` (refactor to use the helper — behavior unchanged)
- Create: `app/api/jobs/[id]/analyze/route.ts`

**Interfaces:**
- Consumes: `analyzeCandidate`, `requirementHash`, `getServerClient`, `buildJobRequirementText`.
- Produces:
  - `scoreCandidateAgainst(candidateId: string, requirement: string): Promise<{ score: number; reasoning: string; cached: boolean }>`
  - `POST /api/jobs/[id]/analyze` — body `{ candidateId }` → `{ score, reasoning, cached }`.

- [ ] **Step 1: Write the failing test**

Create `lib/gemini/score.test.ts`:

```ts
import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { scoreCandidateAgainst } from './score'
import { requirementHash } from './cache'

// Integration: picks any existing candidate, scores once (LLM), then again
// (cache hit). Requires candidates to exist. Cleans up the analyses row.
const REQUIREMENT = `__test__ requirement ${Date.now()}`

test('scoreCandidateAgainst returns a 0..100 score and caches on the second call', async () => {
  const db = getServerClient()
  const { data: c } = await db.from('candidates').select('id').limit(1).single()
  const candidateId = (c as any).id

  const first = await scoreCandidateAgainst(candidateId, REQUIREMENT)
  expect(first.cached).toBe(false)
  expect(first.score).toBeGreaterThanOrEqual(0)
  expect(first.score).toBeLessThanOrEqual(100)

  const second = await scoreCandidateAgainst(candidateId, REQUIREMENT)
  expect(second.cached).toBe(true)
  expect(second.score).toBe(first.score)

  await db
    .from('analyses')
    .delete()
    .eq('candidate_id', candidateId)
    .eq('requirement_hash', requirementHash(REQUIREMENT))
}, 30000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/gemini/score.test.ts`
Expected: FAIL with "Cannot find module './score'".

- [ ] **Step 3: Write the shared helper**

Create `lib/gemini/score.ts`:

```ts
import { getServerClient } from '@/lib/supabase/server'
import { analyzeCandidate } from './analyze'
import { requirementHash } from './cache'

// Cache-first deep score of a candidate against a free-text requirement. Shared
// by /api/analyze (search) and /api/jobs/[id]/analyze (job matching) so both
// reuse the same analyses cache keyed by (candidate_id, requirement_hash).
export async function scoreCandidateAgainst(
  candidateId: string,
  requirement: string
): Promise<{ score: number; reasoning: string; cached: boolean }> {
  const db = getServerClient()
  const hash = requirementHash(requirement)

  const { data: cached } = await db
    .from('analyses')
    .select('score,reasoning')
    .eq('candidate_id', candidateId)
    .eq('requirement_hash', hash)
    .maybeSingle()
  if (cached) {
    return { score: (cached as any).score, reasoning: (cached as any).reasoning, cached: true }
  }

  const { data: c } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', candidateId)
    .single()
  if (!c) throw new Error('candidate not found')

  const profile = {
    full_name: (c as any).full_name,
    headline: (c as any).headline,
    summary: (c as any).summary,
    source: (c as any).source,
    education: (c as any).education,
    experience: (c as any).experience,
    skills: (c as any).candidate_skills?.map((x: any) => x.skills.name),
  }

  const result = await analyzeCandidate(profile as any, requirement)
  await db.from('analyses').insert({
    candidate_id: candidateId,
    requirement_text: requirement,
    requirement_hash: hash,
    score: result.score,
    reasoning: result.reasoning,
  })
  return { ...result, cached: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/gemini/score.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor the existing analyze route to use the helper**

Replace the entire contents of `app/api/analyze/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { scoreCandidateAgainst } from '@/lib/gemini/score'

// POST /api/analyze  body: { candidateId, requirement }
// Returns { score, reasoning, cached }. Cache-first on (candidate, requirement_hash).
export async function POST(req: NextRequest) {
  const { candidateId, requirement } = await req.json()
  if (!candidateId || !requirement) {
    return NextResponse.json({ error: 'candidateId and requirement are required' }, { status: 400 })
  }
  try {
    const result = await scoreCandidateAgainst(candidateId, requirement)
    return NextResponse.json(result)
  } catch (e: any) {
    if (e?.message === 'candidate not found') {
      return NextResponse.json({ error: 'candidate not found' }, { status: 404 })
    }
    throw e
  }
}
```

- [ ] **Step 6: Write the job deep-score route**

Create `app/api/jobs/[id]/analyze/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { scoreCandidateAgainst } from '@/lib/gemini/score'
import { buildJobRequirementText } from '@/lib/jobs/normalize'

// POST /api/jobs/[id]/analyze  body: { candidateId }
// Deep LLM fit score of a candidate against this job (Thai reasoning), cached.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { candidateId } = await req.json()
  if (!candidateId) {
    return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
  }

  const db = getServerClient()
  const { data: job } = await db
    .from('jobs')
    .select('title, company, description, required_skills, min_experience_years, location, category')
    .eq('id', id)
    .single()
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const requirement = buildJobRequirementText(job as any)
  const result = await scoreCandidateAgainst(candidateId, requirement)
  return NextResponse.json(result)
}
```

- [ ] **Step 7: Verify the full suite still passes**

Run: `npx vitest run lib/gemini/score.test.ts lib/gemini/cache.test.ts lib/gemini/analyze.test.ts`
Expected: PASS (refactor left analyze behavior unchanged).

- [ ] **Step 8: Commit**

```bash
git add lib/gemini/score.ts lib/gemini/score.test.ts app/api/analyze/route.ts "app/api/jobs/[id]/analyze/route.ts"
git commit -m "feat(jobs): shared scoreCandidateAgainst + job deep-score API; refactor /api/analyze"
```

---

### Task 7: Jobs UI (list, create, detail with ranked candidates)

**Files:**
- Create: `app/(app)/jobs/page.tsx`
- Create: `components/CreateJobForm.tsx`
- Create: `app/(app)/jobs/[id]/page.tsx`
- Create: `components/JobMatches.tsx`
- Modify: `app/(app)/layout.tsx` (add nav link)

**Interfaces:**
- Consumes: `getServerClient`, `POST /api/jobs`, `matchCandidatesForJob` (via server component), `POST /api/jobs/[id]/analyze`, `ScoreBadge`.
- Produces: `/jobs` (list + create) and `/jobs/[id]` (details + ranked candidates + deep-score buttons).

- [ ] **Step 1: Add the nav link**

In `app/(app)/layout.tsx`, add a `จัดการงาน` link. Change:

```tsx
        <Link href="/search">ค้นหา</Link>
        <Link href="/shortlists">Shortlist</Link>
```

to:

```tsx
        <Link href="/search">ค้นหา</Link>
        <Link href="/jobs">งาน</Link>
        <Link href="/shortlists">Shortlist</Link>
```

- [ ] **Step 2: Write the create-job form (client)**

Create `components/CreateJobForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Client form that POSTs a new job to /api/jobs, then refreshes the list.
export default function CreateJobForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [skills, setSkills] = useState('')
  const [minExp, setMinExp] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!title.trim() || !description.trim() || saving) return
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        company: company || undefined,
        description,
        required_skills: skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        min_experience_years: minExp ? Number(minExp) : undefined,
        location: location || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setMsg('บันทึกไม่สำเร็จ')
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
  }

  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 520, margin: '12px 0 24px' }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ตำแหน่งงาน (เช่น Data Scientist)" />
      <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="บริษัท (ไม่บังคับ)" />
      <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="สกิลที่ต้องการ คั่นด้วยจุลภาค เช่น Python, SQL" />
      <input value={minExp} onChange={(e) => setMinExp(e.target.value)} placeholder="ประสบการณ์ขั้นต่ำ (ปี)" type="number" />
      <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="สถานที่ (ไม่บังคับ)" />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" rows={4} />
      <div>
        <button onClick={save} disabled={saving || !title || !description}>
          {saving ? 'กำลังบันทึก…' : 'เพิ่มงาน'}
        </button>
        {msg && <span style={{ marginLeft: 10, color: '#16a34a' }}>{msg}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the jobs list page (server)**

Create `app/(app)/jobs/page.tsx`:

```tsx
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import CreateJobForm from '@/components/CreateJobForm'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const db = getServerClient()
  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, company, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <main>
      <h1>งาน</h1>
      <CreateJobForm />

      <h2>งานทั้งหมด</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(jobs ?? []).map((j: any) => (
          <li key={j.id} style={{ padding: '8px 0', borderBottom: '1px solid #f2f2f2' }}>
            <Link href={`/jobs/${j.id}`} style={{ fontWeight: 600 }}>
              {j.title}
            </Link>
            {j.company && <span style={{ color: '#888', marginLeft: 8 }}>{j.company}</span>}
          </li>
        ))}
      </ul>
      {(jobs ?? []).length === 0 && <p style={{ color: '#888' }}>ยังไม่มีงาน เพิ่มงานด้านบนได้เลย</p>}
    </main>
  )
}
```

- [ ] **Step 4: Write the ranked-candidates client component**

Create `components/JobMatches.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'

type Match = { id: string; full_name: string; headline?: string; score: number }
type Deep = { score: number; reasoning: string }

// Loads vector-ranked candidates for a job, with an on-demand LLM deep-score
// button per candidate (POST /api/jobs/[id]/analyze).
export default function JobMatches({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [deep, setDeep] = useState<Record<string, Deep | 'loading'>>({})

  useEffect(() => {
    ;(async () => {
      const r = await fetch(`/api/jobs/${jobId}/match`)
      const json = await r.json()
      setRows(Array.isArray(json) ? json : [])
      setLoading(false)
    })()
  }, [jobId])

  const analyze = async (candidateId: string) => {
    setDeep((d) => ({ ...d, [candidateId]: 'loading' }))
    const r = await fetch(`/api/jobs/${jobId}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })
    const json = await r.json()
    setDeep((d) => ({ ...d, [candidateId]: { score: json.score, reasoning: json.reasoning } }))
  }

  if (loading) return <p style={{ color: '#888' }}>กำลังจัดอันดับผู้สมัคร…</p>
  if (!rows.length) return <p style={{ color: '#888' }}>ยังไม่มีผู้สมัครที่เข้าเกณฑ์</p>

  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {rows.map((c) => {
        const d = deep[c.id]
        return (
          <li key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #f2f2f2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ScoreBadge score={c.score} />
              <Link href={`/candidates/${c.id}`} style={{ fontWeight: 600 }}>
                {c.full_name}
              </Link>
              <span style={{ color: '#888' }}>{c.headline}</span>
              <button
                onClick={() => analyze(c.id)}
                disabled={d === 'loading'}
                style={{ marginLeft: 'auto' }}
              >
                {d === 'loading' ? 'กำลังวิเคราะห์…' : 'วิเคราะห์เชิงลึก'}
              </button>
            </div>
            {d && d !== 'loading' && (
              <div style={{ marginTop: 6, marginLeft: 40, fontSize: 14 }}>
                <ScoreBadge score={d.score} /> <span style={{ color: '#555' }}>{d.reasoning}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 5: Add the match GET route the component calls**

Create `app/api/jobs/[id]/match/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { matchCandidatesForJob } from '@/lib/jobs/match'

// GET /api/jobs/[id]/match → JobMatch[] (vector-ranked candidates).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await matchCandidatesForJob(id))
}
```

- [ ] **Step 6: Write the job detail page (server)**

Create `app/(app)/jobs/[id]/page.tsx`:

```tsx
import { getServerClient } from '@/lib/supabase/server'
import JobMatches from '@/components/JobMatches'

export const dynamic = 'force-dynamic'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()
  const { data: j } = await db
    .from('jobs')
    .select('title, company, location, min_experience_years, required_skills, description')
    .eq('id', id)
    .single()

  if (!j) return <main><p>ไม่พบงานนี้</p></main>

  const skills: string[] = (j as any).required_skills ?? []

  return (
    <main>
      <h1>{(j as any).title}</h1>
      {(j as any).company && <p style={{ color: '#666' }}>{(j as any).company}</p>}
      {(j as any).location && <p style={{ color: '#888' }}>{(j as any).location}</p>}
      {(j as any).min_experience_years != null && (
        <p style={{ color: '#888' }}>ประสบการณ์ขั้นต่ำ {(j as any).min_experience_years} ปี</p>
      )}
      {skills.length > 0 && (
        <div style={{ margin: '12px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {skills.map((s) => (
            <span key={s} style={{ background: '#eef2ff', color: '#3730a3', padding: '2px 10px', borderRadius: 999, fontSize: 13 }}>
              {s}
            </span>
          ))}
        </div>
      )}
      {(j as any).description && <p>{(j as any).description}</p>}

      <h2>ผู้สมัครที่เข้าเกณฑ์</h2>
      <JobMatches jobId={id} />
    </main>
  )
}
```

- [ ] **Step 7: Verify build + manual smoke test**

Run: `npm run build`
Expected: compiles successfully; routes `/jobs`, `/jobs/[id]`, `/api/jobs`, `/api/jobs/[id]/match`, `/api/jobs/[id]/analyze` all listed.

Then `npm run dev`, log in, open `/jobs`, add a job (e.g. "Data Scientist", skills "Python, SQL", description mentioning "machine learning, studied abroad"), open it, confirm ranked candidates appear and "วิเคราะห์เชิงลึก" returns a Thai reasoning score.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/jobs" components/CreateJobForm.tsx components/JobMatches.tsx "app/api/jobs/[id]/match/route.ts" "app/(app)/layout.tsx"
git commit -m "feat(jobs): jobs list/create UI + job detail with ranked candidates & deep score"
```

---

### Task 8: Synthetic job seed script + docs

**Files:**
- Create: `scripts/seed-jobs.ts`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `upsertJob`.
- Produces: a runnable seed command; updated docs.

- [ ] **Step 1: Write the seed script**

Create `scripts/seed-jobs.ts`:

```ts
import 'dotenv/config'
import { upsertJob } from '@/lib/jobs/upsert'
import type { JobInput } from '@/lib/jobs/normalize'

// Seeds a fixed set of synthetic jobs (English fields) for demoing job → candidate
// matching. Idempotent: dedups on (source, external_id).
// Usage:  npx tsx scripts/seed-jobs.ts
const JOBS: JobInput[] = [
  {
    title: 'Data Scientist',
    company: 'Siam Analytics',
    description: 'Build and deploy machine learning models on large datasets. Python, strong statistics, experience studying or working abroad a plus.',
    required_skills: ['Python', 'Machine Learning', 'SQL', 'Statistics'],
    min_experience_years: 3,
    location: 'Bangkok',
    category: 'Data',
    source: 'synthetic',
    external_id: 'seed-data-scientist',
  },
  {
    title: 'Frontend Engineer',
    company: 'Bangkok Fintech',
    description: 'Build responsive web apps with React and TypeScript. Care about UX and accessibility.',
    required_skills: ['React', 'TypeScript', 'CSS'],
    min_experience_years: 2,
    location: 'Bangkok',
    category: 'Engineering',
    source: 'synthetic',
    external_id: 'seed-frontend-engineer',
  },
  {
    title: 'Product Manager',
    company: 'Chiang Mai Ventures',
    description: 'Own product roadmap for a consumer app. Work with design and engineering. International education preferred.',
    required_skills: ['Product Strategy', 'Analytics', 'Communication'],
    min_experience_years: 5,
    location: 'Remote',
    category: 'Product',
    source: 'synthetic',
    external_id: 'seed-product-manager',
  },
  {
    title: 'Marketing Analyst',
    company: 'Thai Commerce Group',
    description: 'Analyze campaign performance and customer segments. SQL and data storytelling.',
    required_skills: ['SQL', 'Excel', 'Marketing Analytics'],
    min_experience_years: 2,
    location: 'Bangkok',
    category: 'Marketing',
    source: 'synthetic',
    external_id: 'seed-marketing-analyst',
  },
]

async function main() {
  let done = 0
  for (const job of JOBS) {
    try {
      await upsertJob(job)
      done++
      console.log(`seeded ${done}/${JOBS.length}: ${job.title}`)
    } catch (e: any) {
      console.error('  skip one job:', e?.message ?? e)
    }
  }
  console.log(`Done. ${done} synthetic jobs in the database.`)
}

main().catch((e) => {
  console.error('Seed failed:', e?.message ?? e)
  process.exit(1)
})
```

- [ ] **Step 2: Run the seed script**

Run: `npx tsx scripts/seed-jobs.ts`
Expected: prints `seeded 1/4 … 4/4` then `Done. 4 synthetic jobs in the database.` Re-running does not create duplicates.

- [ ] **Step 3: Update the README**

In `README.md`, under the seed step, add after the candidate seed command:

```markdown
Seed demo jobs (for job → candidate matching):

​```
npx tsx scripts/seed-jobs.ts
​```
```

- [ ] **Step 4: Update CLAUDE.md progress**

In `CLAUDE.md`, under `## Progress`, append below Task 14:

```markdown

### Phase 2 — Job matching (job → candidates)
- [x] Jobs RLS + read policy (migration 005)
- [x] Job normalize + upsert (embed, dedup on source+external_id)
- [x] Create-job API + jobs UI (list/create/detail)
- [x] Vector ranking (matchCandidatesForJob, reuses match_candidates)
- [x] Shared scoreCandidateAgainst + job deep-score API (reuses analyses cache)
- [x] Synthetic job seed (scripts/seed-jobs.ts)
```

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-jobs.ts README.md CLAUDE.md
git commit -m "feat(jobs): synthetic job seed script + docs"
```

---

## Self-Review

**Spec coverage (against the chosen scope):**
- Direction job → candidates → Tasks 5, 7 (match lib + job detail UI).
- Create-job form → Tasks 4, 7. Seed script → Task 8. (Both job-ingest paths chosen are covered.)
- Vector + LLM scoring → Task 5 (vector) + Task 6 (LLM deep-score, cached).
- Jobs get embeddings in the shared 768 space → Tasks 2, 3.
- No new score table (reuses `analyses`) → Task 6. `jobs` table never altered → Task 1 only enables RLS.

**Type consistency:**
- `JobInput` defined in Task 2, consumed identically in Tasks 3, 4, 8.
- `JobMatch` shape (`id, full_name, headline?, score`) defined in Task 5; `Match` type in `JobMatches.tsx` (Task 7) matches it.
- `scoreCandidateAgainst(candidateId, requirement)` defined in Task 6, called by both routes with the same signature.
- `match_candidates` RPC params (`query_embedding`, `match_count`) match existing usage in `lib/search/query.ts`.
- `upsertJob` returns `{ id, updated }` — consumed only for `id` in the API/seed, consistent.

**Placeholder scan:** none — every code step contains full source, exact paths, and exact run commands.

**Note for the implementer:** Tasks 3, 5, 6 are integration tests that call Gemini (embeddings + one generate). The Gemini free tier allows 5 generate/min per model — run these test files one at a time, not the whole suite in a tight loop, to avoid rate-limit flakes.
```
