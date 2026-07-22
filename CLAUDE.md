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
`requirement_hash`), and `profiles` (Supabase Auth + `role` admin|member).

## Progress

- [x] Task 1 — scaffold + Supabase clients
- [x] Task 2 — schema, pgvector, `match_candidates`, RLS
- [x] Task 3 — Gemini client + embedding
- [x] Task 4 — normalize + upsert (dedup)
- [x] Task 5 — CSV parse + column mapping
- [x] Task 6 — Gemini parse (resume) + analyze (score)
- [x] Task 7 — analyze API + cache
- [x] Task 8 — RAG + hybrid search + score (search score = vector similarity; LLM deep-score on candidate page only, to respect free-tier quota)
- [ ] Task 9 — ingest API (csv + upload)
- [ ] Task 10 — auth (login/signup), role, route guard
- [ ] Task 11 — UI: dashboard, candidate+timeline, search, shortlist
- [x] Task 12 — synthetic Thai seed data (`scripts/seed-synthetic.ts`)
- [ ] Task 13 — user settings (optional)
- [ ] Task 14 — admin user management + deploy

## Gemini free-tier note

Free tier = 5 generate requests/min per model. Do NOT call the generation model
once per search result. Search ranks by vector similarity; the LLM (`analyze`)
runs only on-demand per candidate. For heavy demo/production, enable billing or
add a queue/rate-limit.

## Known environment note

Git and npm cannot run against this drive from the Cowork Linux sandbox
(mount permission limits + blocked npm registry). Run `npm install`, tests, and
git commits natively on Windows.
