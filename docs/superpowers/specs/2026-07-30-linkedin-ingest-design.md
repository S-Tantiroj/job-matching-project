# LinkedIn CSV Ingest — Design Spec

Date: 2026-07-30
Status: Approved (design), pending spec review → implementation plan

## Goal

Import real candidates from a PhantomBuster LinkedIn CSV export into the existing
candidate schema, deterministically (no LLM), deduped by LinkedIn profile URL,
via a simple CSV upload page.

## Scope

Phase 1 (this spec): CSV upload through a new `/import` page. A later phase (out
of scope here) may add a live PhantomBuster API / webhook integration (source
stays `scraper`, same downstream path).

## Context (what exists today)

- Ingest is API-only (`POST /api/ingest`, types `csv` and `upload`) — no upload
  UI page exists yet.
- All ingestion lands in one schema via `upsertCandidate(input, userId)`
  (`lib/ingest/upsert.ts`), which embeds and dedups. `candidates.source` enum
  already includes `'scraper'`.
- `CandidateInput` (`lib/ingest/normalize.ts`) has `full_name, headline,
  location, summary, source, education[], experience[], skills[], raw`.
  `experience` items use `start_date`/`end_date` (ISO strings), `education`
  items use `start_year`/`end_year` (ints).
- `toIsoDate` (`lib/ingest/normalize.ts`) coerces loose date strings to ISO.
- `computeYearsExperience` already derives `years_experience` on upsert.

## Key decisions (from brainstorming)

- Deterministic mapping only — no LLM (so no quota cost, no JSON-parse risk).
- Education `country` is dropped. "Educated abroad" is guaranteed at scrape time
  (the PhantomBuster search targets Thai-educated-abroad people), so no in-app
  country/abroad filter is needed for scraped rows. `education.country` is left
  null for scraped candidates. (The educationAbroad search chip is already
  hidden; full removal is a separate follow-up.)
- Header-tolerant parsing: accept BOTH PhantomBuster header styles — camelCase
  keys (`firstName`) and friendly labels (`First Name`). Both normalize (lower
  case, strip non-alphanumerics) to the same lookup key.

## Data flow

1. User exports the PhantomBuster result as CSV (search pre-filtered to
   Thai-educated-abroad).
2. User opens `/import`, selects the CSV file (read as text in the browser), and
   clicks "นำเข้า".
3. Browser POSTs `{ type: 'linkedin', csv }` → server parses with
   `parseLinkedInCsv` and `upsertCandidate`s each row → returns
   `{ imported, updated, errors }`.
4. UI shows the result summary (imported / updated / errors).

## Field mapping (deterministic)

Looked up via a header-normalizing accessor `get(row, key)` that matches either
PhantomBuster style.

| Candidate field | PhantomBuster source |
|---|---|
| `full_name` | `firstName` + " " + `lastName` |
| `headline` | `linkedinHeadline` |
| `location` | `location` |
| `summary` | `linkedinDescription` |
| `linkedin_url` | `linkedinProfileUrl` (fallback `profileUrl`) |
| `professional_email` | `professionalEmail` |
| `refreshed_at` | `refreshedAt` |
| `experience[0]` | `linkedinJobTitle`, `companyName`, `linkedinJobDescription`, dates from `linkedinJobDateRange` |
| `experience[1]` | `linkedinPreviousJobTitle`, `previousCompanyName`, `linkedinPreviousJobDescription`, dates from `linkedinPreviousJobDateRange` |
| `education[0]` | `linkedinSchoolName`, `linkedinSchoolDegree`, `linkedinSchoolFieldOfStudy`, years from `linkedinSchoolDateRange`; `country` = null |
| `education[1]` | `linkedinPreviousSchoolName`, `linkedinPreviousSchoolDegree`, `linkedinPreviousSchoolFieldOfStudy`, years from `linkedinPreviousSchoolDateRange`; `country` = null |
| `skills[]` | split `linkedinSkillsLabel` on `, ; \| newline` |
| `raw` | the whole original CSV row (jsonb) |
| `source` | `'scraper'` |

Experience/education entries are only added when they have at least a title or
institution. A row is skipped entirely if `full_name` is empty.

## Components / files

- `lib/ingest/linkedin.ts` (new) — `parseLinkedInCsv(text: string):
  CandidateInput[]`. Uses Papa (header mode) + a header-normalizing accessor +
  the mappers below.
- `lib/ingest/linkedinDate.ts` (new) —
  `parseLinkedInDateRange(s?: string): { start_date: string | null; end_date: string | null }`.
  Handles "2015 - 2019", "Jan 2020 - Present", "2020 - Present", "2020", ""/null.
  "Present"/blank end → null. Month names mapped to month numbers; year-only →
  `YYYY-01-01`. Reuses nothing external; education years are derived by the
  caller as `Number(start_date?.slice(0,4))`.
- `lib/ingest/normalize.ts` (modify) — extend `CandidateInput` with optional
  `linkedin_url?: string`, `professional_email?: string`,
  `refreshed_at?: string`.
- `lib/ingest/upsert.ts` (modify) — write the four new columns; when
  `input.linkedin_url` is present, dedup on it (find existing by `linkedin_url`,
  update in place) instead of the `full_name`+country rule.
- `app/api/ingest/route.ts` (modify) — add `type: 'linkedin'`: parse the CSV
  with `parseLinkedInCsv` and `upsertCandidate` each row, returning
  `{ imported, updated, errors }` (same shape as the `csv`/`upload` types).
- `app/(app)/import/page.tsx` (new) — upload UI: file picker → "นำเข้า" button →
  result summary (imported / updated / errors). Auth-guarded by existing
  middleware (add `/import` to the matcher).
- `supabase/migrations/008_linkedin_fields.sql` (new) — additive columns + dedup
  index.

## Migration 008 (additive)

```sql
alter table candidates add column if not exists linkedin_url text;
alter table candidates add column if not exists professional_email text;
alter table candidates add column if not exists refreshed_at timestamptz;
create unique index if not exists candidates_linkedin_url_key
  on candidates (linkedin_url) where linkedin_url is not null;
```

Additive only; does not touch the `jobs` table or existing columns.

## Dedup

`upsertCandidate` gains a linkedin-first rule: if `input.linkedin_url` is set,
look up an existing candidate by `linkedin_url`; if found, update it (and its
child rows) in place — so re-importing the same CSV updates rather than
duplicates. When `linkedin_url` is absent, the existing `full_name` (+ first
education country) dedup is unchanged. Single ingest path preserved.

## Error handling

- Rows with no `full_name` are skipped silently (not counted).
- Malformed date ranges → both dates null (entry still imported).
- Per-candidate upsert failures are caught and returned in `errors[]` (name +
  message); the batch continues.
- Non-CSV / unparseable upload → `parseLinkedInCsv` returns `[]`; the API
  returns `{ imported: 0, updated: 0, errors: [] }` and the UI shows "no rows
  found / nothing imported".

## Testing

- Unit `lib/ingest/linkedinDate.test.ts` — the range parser across "2015 - 2019",
  "Jan 2020 - Present", "2020", "", null.
- Unit `lib/ingest/linkedin.test.ts` — a two-row CSV (one camelCase-header, one
  friendly-label header) → correct `CandidateInput` with 2 experience, 2
  education, split skills, `linkedin_url`, `source` `scraper`. Confirms header
  tolerance.
- Integration `lib/ingest/linkedin.upsert.test.ts` — upsert a scraped candidate,
  then re-run with the same `linkedin_url` → `updated: true`, same id; clean up.
- Route `app/api/ingest/route.test.ts` (extend) — `type:'linkedin'` parses the
  CSV and calls `upsertCandidate` per row, returning `{ imported, updated,
  errors }` (mock `parseLinkedInCsv` + `upsertCandidate`).

## Out of scope (later phases)

- Country inference / education-abroad filtering for scraped data.
- Live PhantomBuster API / webhook (Phase C).
- Profile photo (`photo_url`) — not provided by the scraper.
- More than 2 jobs / 2 schools of history — this PhantomBuster export only
  returns current + previous (flat columns). The candidate schema already holds
  unlimited `experience[]`/`education[]`, so the ceiling is the data source, not
  the DB. Fuller history would require switching to a richer phantom that emits
  full experience/education JSON arrays — a separate future parser
  (`lib/ingest/linkedinProfile.ts`), same `upsertCandidate` downstream.
- Extra metadata (industry, connection/follower counts, and the
  `linkedinIsOpenToWorkBadge` "open to work" signal) — retained in `raw` only,
  not promoted to columns. `open_to_work` can be promoted to a column + filter
  later (backfilled from `raw`) if a recruiting-prioritization feature needs it.

## Non-negotiable constraints (inherited)

- Gemini SDK `@google/genai`; embeddings `gemini-embedding-001` @ 768 dims
  (`RETRIEVAL_DOCUMENT` on ingest, via `upsertCandidate`).
- Match score integer 0–100 (not applicable to ingest).
- Stored data English (LinkedIn data is already English/romanized).
- DB migrations additive; never drop/alter the `jobs` table.
- Service-role client server-only; `/api/ingest` requires an authenticated
  session (already enforced).
- Secrets in `.env` only.
