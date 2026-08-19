# CLAUDE.md

Guidance for AI agents working in this repo. Read before making changes.

## What this is

Internal HR platform for sourcing and evaluating candidates, focused on **Thai
people educated abroad**. A pared-down juicebox.ai: natural-language candidate
search plus AI fit scoring. Job-matching (candidate ↔ job) is a later phase — a
`jobs` table and `import_jobs.py` already exist and must not be broken.

Full spec and plan live in `docs/superpowers/`:
- `specs/2026-07-21-thai-candidate-sourcing-design.md`
- `plans/2026-07-21-thai-candidate-sourcing.md` (14 tasks, TDD, execute in order)

## Stack

- **Next.js 15** (App Router, TypeScript) — frontend + API routes in one codebase
- **Supabase** (Postgres + Auth + Storage + pgvector) — accessed two ways:
  - `lib/supabase/client.ts` — browser client (anon key)
  - `lib/supabase/server.ts` — server client (service-role key, bypasses RLS; never import into client components)
- **Gemini** via `@google/genai` (unified SDK, matches the Python `google-genai` in import_jobs.py)
- **Vitest** for tests

## Non-negotiable conventions

- **Gemini SDK:** `@google/genai` only — NOT `@google/generative-ai`.
- **Embeddings:** model `gemini-embedding-001`, `outputDimensionality: 768`,
  taskType `RETRIEVAL_DOCUMENT` when indexing / `RETRIEVAL_QUERY` when searching.
  768 dims is mandatory — it matches the `jobs` table so candidate and job
  vectors share one space for future matching. The `candidates.embedding`
  column is `vector(768)`.
- **Generation:** model `gemini-flash-latest` for parse / analyze / generate
  (the `gemini-2.5-flash` in import_jobs.py is deprecated for new API keys; the
  `-latest` alias tracks the current flash model and avoids repeat breakage).
- **Data language:** candidate data stored in the tables is **English** (romanized
  Thai names, English institutions/skills/etc.) for uniformity with future scraped
  LinkedIn data. Generators enforce this: `generate.ts` and `parse.ts` output
  English. AI **reasoning/advice** (the `analyze` output) stays **Thai**.
- **Match score:** integer 0–100 everywhere (search results and analysis use the same scale).
- **All ingestion paths land in one schema** (`candidates` + child tables) via
  `lib/ingest/upsert.ts`. `candidates.source` = `synthetic` | `csv` | `upload` | `scraper`.
  Adding a new source should only touch `lib/ingest`.
- **DB migrations are additive** — never drop or alter the existing `jobs` table.
- **RLS** protects user data; the service-role client is server-only.
- **Secrets** live in `.env` only (git-ignored). Never commit keys.

## Environment (.env)

```
DATABASE_URL=postgresql://postgres:[pw]@db.xxxxx.supabase.co:5432/postgres
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Vitest does not auto-load `.env`; integration tests start with `import 'dotenv/config'`.

## Commands

- `npm install` — install deps
- `npm run dev` — Next.js dev server
- `npx vitest run <path>` — run a test file
- `npx tsx scripts/<file>.ts` — run a script (e.g. `scripts/test-gemini.ts`)
- DB migrations: run `supabase/migrations/*.sql` in the Supabase SQL editor

## Testing

TDD per the plan: write the failing test, make it pass, commit. Unit tests
(pure logic) run offline; integration tests hit real Supabase + Gemini and must
clean up after themselves (use a unique name, delete on teardown).

## Data model (see migration 001)

`candidates` (+ `embedding vector(768)`, `source`, `raw_data` jsonb) with child
tables `education`, `experience`, `skills`/`candidate_skills`,
`shortlists`/`shortlist_candidates`, `analyses` (AI-score cache keyed by
`requirement_hash`), and `profiles` (Supabase Auth + `role`
admin|data_manager|member, see migration 009).

## Progress

- [x] Task 1 — scaffold + Supabase clients
- [x] Task 2 — schema, pgvector, `match_candidates`, RLS
- [x] Task 3 — Gemini client + embedding
- [x] Task 4 — normalize + upsert (dedup)
- [x] Task 5 — CSV parse + column mapping
- [x] Task 6 — Gemini parse (resume) + analyze (score)
- [x] Task 7 — analyze API + cache
- [x] Task 8 — RAG + hybrid search + score (search score = vector similarity; LLM deep-score on candidate page only, to respect free-tier quota)
- [x] Task 9 — ingest API (csv + upload)
- [x] Task 10 — auth (login/signup), role, route guard (profile auto-created by trigger, migration 002)
- [x] Task 11 — UI: dashboard, candidate+timeline, search, shortlist
- [x] Task 12 — synthetic Thai seed data (`scripts/seed-synthetic.ts`)
- [x] Task 13 — user settings (optional) — needs migration 003 (profile update policy)
- [x] Task 14 — admin user management + deploy (README)

### Phase 2 — Job matching (job → candidates)
Plan: `docs/superpowers/plans/2026-07-23-job-matching.md`
- [x] Jobs RLS + read policy (migration 005)
- [x] Job normalize + upsert (embed, dedup on source+external_id)
- [x] Create-job API + jobs UI (list/create/detail)
- [x] Vector ranking (matchCandidatesForJob, reuses match_candidates)
- [x] Shared scoreCandidateAgainst + job deep-score API (reuses analyses cache)
- [x] Synthetic job seed (scripts/seed-jobs.ts)

### Phase 3 — LinkedIn CSV ingest
- [x] Migration 008 — linkedin_url / professional_email / refreshed_at + partial
      unique index on linkedin_url for dedup
- [x] `parseLinkedInDateRange`, `parseLinkedInCsv` (deterministic, header-tolerant)
- [x] `/api/ingest` type `linkedin`, `/import` page

### Phase 4 — Filter-chip search
- [x] Migration 006/007 — `match_candidates_filtered` (hard filters applied in SQL
      before vector ranking) + `candidates.years_experience`
- [x] `extractSearchIntent` (one flash call: NL → semanticQuery + chips),
      `searchCandidates` via the filtered RPC, query-embedding cache
- [x] Chip UI + coverage strip. Note: `educationAbroad`/country filtering was
      REMOVED — the RPC still has `p_any_foreign`/`p_countries` params, left at
      their defaults.

### Phase 5 — UI redesign
Spec/plan: `docs/superpowers/{specs,plans}/2026-07-30-ui-redesign*`
- [x] `app/globals.css` — design tokens + ~40 reusable classes. Every page uses
      these; avoid new ad-hoc inline styles.
- [x] Every page/component restyled onto it; sticky nav; dashboard shortlist cards

### Phase 6 — v2 Data management
Spec/plan: `docs/superpowers/{specs,plans}/2026-08-06-v2-data-management*`
- [x] Migration 009 — role `data_manager` added to the `user_role` enum.
      **`hasRole` is now hierarchical** (`member` 1 < `data_manager` 2 < `admin` 3)
      via `ROLE_RANK` in `lib/auth/session.ts`.
- [x] `/candidates` data table (server component; sort/search/paginate via URL
      params, whitelisted in `lib/candidates/listParams.ts`)
- [x] Data-quality badges — `lib/candidates/quality.ts`. A candidate with a NULL
      `embedding` never appears in search (both RPCs filter it out); this table is
      the only place that surfaces it. Migration 010 = `duplicate_candidate_names`.
- [x] Edit main fields — `PATCH /api/candidates/[id]` → `lib/candidates/update.ts`.
      **Never build candidate edits on `upsertCandidate`** — that deletes and
      rewrites the education/experience/skills child rows. Re-embed is decided by
      comparing `buildEmbedText(before) !== buildEmbedText(after)`, so it stays
      correct for any field without maintenance.
- [x] Change password (verifies the current one via `signInWithPassword` first —
      Supabase's `updateUser` does not check it), forgot/reset password
- [x] Email confirmation on signup → `/auth/confirm` auto-logs in then redirects.
      That page exists because `middleware.ts` guards `/dashboard` from cookies
      server-side and would bounce the user before the client can store the
      session; `/auth/*` is deliberately outside the middleware matcher.

### Not done / deliberately deferred
- Google sign-in — deferred from v2. Risk: an existing email/password user
  signing in with Google may get a NEW auth user (and so a new profile, role
  `member`, no access to their old shortlists) instead of a linked identity.
  Verify on a preview deploy before enabling.
- Invite-only membership (admin creates members, no public signup) — discussed,
  not specced. Note that deleting the `/signup` page does not close signups: the
  anon key is public, so `POST /auth/v1/signup` still works. The real switch is
  Supabase → Authentication → Providers → Email → "Allow new users to sign up".
- Tables `public.resumes` and `public.matches` have RLS DISABLED and are exposed
  through PostgREST (Supabase advisor, ERROR level). Not created by any migration
  in this repo.
- `/api/ingest`'s 403 role gate has no test — `route.test.ts` stubs
  `hasRole: () => true`.

## Gemini free-tier note

Free tier = 5 generate requests/min per model. Do NOT call the generation model
once per search result. Search ranks by vector similarity; the LLM (`analyze`)
runs only on-demand per candidate. For heavy demo/production, enable billing or
add a queue/rate-limit.

## Known environment note

From the Cowork Linux sandbox, this drive is mounted read-mostly:

- **Working-tree file writes work.** Creating and editing source files is fine —
  that is how implementation happens from a session.
- **Git reads work:** `git log`, `git status`, `git diff`, `git branch`, `git show`.
- **Git writes do NOT work.** Anything needing `.git/index.lock` — `git add`,
  `git commit`, `git checkout -- <file>` — fails with `Operation not permitted`,
  because the sandbox cannot create or unlink files inside `.git/`.
- **npm does not work** (blocked registry), so `npm install`, `npm run build`,
  and `npx vitest` must run on Windows.

**Trap:** a failed git write leaves a stale zero-byte `.git/index.lock` that the
sandbox cannot delete. Every later git command on Windows then fails with
"Another git process seems to be running." Fix on Windows with
`Remove-Item .git\index.lock -Force`. Do not attempt git writes from a session —
hand the user the commands instead.

**Line endings:** the repo is checked out CRLF on Windows. Files rewritten from
the sandbox can come back LF, which shows up as a whole-file diff with no real
content change (`next-env.d.ts` is the usual victim). Check `git diff` before
staging and `git checkout --` anything that is pure line-ending churn.
