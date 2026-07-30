# Interactive Filter-Chip Search — Design Spec

Date: 2026-07-23
Status: Approved (design), pending spec review → implementation plan

## Goal

Replace the single free-text candidate search with a juicebox-style flow: the
user types a natural-language query, an LLM extracts it into an editable
free-text "semantic query" plus a set of editable structured filter chips, and
results update when the user edits chips — without re-calling the LLM on every
edit.

## Current state (what exists today)

- `/search` page: one text input + a single "foreign education only" checkbox →
  `POST /api/search` → `searchCandidates(query, filters)` in `lib/search/query.ts`.
- `searchCandidates` embeds the query (`RETRIEVAL_QUERY`), calls the
  `match_candidates(query_embedding, match_count)` RPC (ranks ALL candidates by
  cosine similarity, returns top 20), then post-filters in JS for
  `foreignEduOnly`, and maps similarity → integer score 0–100.
- `SearchFilters = { foreignEduOnly?: boolean; skill?: string }`.
- Data model: `candidates` (+ `embedding vector(768)`), child tables `education`
  (institution, country, degree, field_of_study, start_year, end_year),
  `experience` (company, title, start_date, end_date, description), and
  `skills`/`candidate_skills`.

## User flow

1. User types a natural-language query and submits.
2. LLM (`gemini-flash-latest`) parses it into `{ semanticQuery, filters }`:
   - `semanticQuery` — a short role/skills description used for the vector search.
   - `filters` — the structured chips (below).
3. The UI shows an editable `semanticQuery` box plus the filter chips (add /
   edit / remove).
4. Results = vector ranking over `semanticQuery` **intersected with** the hard
   filter chips.
5. Editing a chip re-runs the search using the existing `semanticQuery`
   embedding + the new filters — no LLM call. The LLM is called again only when
   the user edits the `semanticQuery` text and re-submits.

## Filter chips (v1)

All chips are hard filters (a candidate must match to appear) EXCEPT role/title,
which is handled by the vector search via `semanticQuery`.

| Chip | Source field | Semantics |
|---|---|---|
| Skills (multi) | `candidate_skills` → `skills.name` | candidate must have ALL listed skills |
| Education abroad (hybrid) | `education.country` | see below |
| Min years experience | derived from `experience` dates | candidate's total years ≥ value |
| Field / degree (multi) | `education.field_of_study`, `education.degree` | candidate matches ANY listed value |
| (Role / title) | — | NOT a chip; lives in `semanticQuery` (vector) |

### Education-abroad chip — hybrid value

The chip holds one of:
- `{ anyForeign: true }` — any `education.country` that is not "Thailand".
- `{ countries: ["USA", "UK", ...] }` — candidate studied in ANY listed country.

The LLM maps intent: "studied abroad" → `anyForeign`; "studied in the US" →
`countries: ["USA"]`; "US or UK" → `countries: ["USA", "UK"]`. The UI lets the
user switch between "any foreign" and a specific country list.

## Architecture

New and changed units, each with one responsibility:

1. `lib/search/extractFilters.ts` (new) —
   `extractSearchIntent(nl: string): Promise<{ semanticQuery: string; filters: ChipFilters }>`.
   One Gemini `gemini-flash-latest` call; returns JSON. English output for the
   structured values (uniform with stored data). This is the ONLY LLM call in
   the flow.

2. `ChipFilters` type (in `lib/search/extractFilters.ts` or a shared
   `lib/search/types.ts`):
   ```
   type ChipFilters = {
     skills?: string[]
     educationAbroad?: { anyForeign?: boolean; countries?: string[] }
     minYears?: number
     fieldOrDegree?: string[]
   }
   ```
   The legacy `SearchFilters.foreignEduOnly` is superseded by
   `educationAbroad.anyForeign` (keep back-compat only if trivial; otherwise
   migrate the one caller).

3. Migration 006 (additive) — `match_candidates_filtered(query_embedding
   vector(768), match_count int, p_skills text[], p_any_foreign boolean,
   p_countries text[], p_min_years int, p_field_or_degree text[])`. Filters in
   SQL (joins/EXISTS against child tables) BEFORE ordering by cosine distance,
   so hard filters are correct and the approach scales to the target
   thousands–tens-of-thousands (unlike top-20-then-post-filter, which can filter
   an entire page away). Every filter param is nullable / empty-array =
   "no constraint". Does NOT drop or alter existing tables or the existing
   `match_candidates` function.

4. Migration 006 also adds `candidates.years_experience int` (nullable),
   precomputed so the min-years filter is a simple column comparison instead of
   a per-query aggregate over `experience`. Populated on ingest (see #6) and
   backfilled once for existing rows.

5. `lib/search/query.ts` (changed) — `searchCandidates(semanticQuery,
   filters: ChipFilters)` embeds `semanticQuery` and calls
   `match_candidates_filtered` with the mapped params; returns the same
   `SearchResult[]` shape (`id, full_name, headline, score`), score clamped
   0–100.

6. `lib/ingest/upsert.ts` (changed) — compute `years_experience` from the
   candidate's `experience` rows (sum of each role's duration in years, rounded)
   and write it on insert/update. A one-off backfill script updates the existing
   ~68 rows.

7. `lib/search/normalizeCountry.ts` (new) — a light canonicalization map
   ("United States" → "USA", "U.K." → "UK", etc.) applied to both stored
   `education.country` comparisons and the chip's country values, so the hybrid
   country filter is robust to future scraped data. v1 covers the common cases;
   unmapped values pass through unchanged.

8. API split:
   - `POST /api/search/parse` (new) — body `{ query }` → `{ semanticQuery,
     filters }` (calls `extractSearchIntent`). Auth required.
   - `POST /api/search` (changed) — body `{ semanticQuery, filters }` →
     `SearchResult[]` (no LLM). Auth required. This is what chip edits call.

9. UI — `/search` page reworked: NL input → on submit calls `/api/search/parse`,
   renders the editable `semanticQuery` box + chip editor (`components/
   FilterChips.tsx`), and the results list (reusing `ScoreBadge`). Chip
   add/edit/remove and `semanticQuery` re-submit both call `/api/search`; only a
   `semanticQuery` text change re-calls `/api/search/parse`.

## Quota

Gemini free tier = 5 generate/min per model. The LLM runs once per NL submit
(`/api/search/parse`); chip edits hit only vector + SQL (`/api/search`). This
keeps the interactive editing loop free of generation cost.

## Testing

- Unit: `extractSearchIntent` output shape and intent mapping (mock Gemini) —
  e.g. "studied abroad" → `anyForeign`, "US or UK" → `countries`.
- Unit: `normalizeCountry` canonicalization.
- Unit: years-experience computation from `experience` rows.
- Integration: `match_candidates_filtered` returns only candidates satisfying
  the hard filters, ranked by similarity, scores 0–100 (seed a temp candidate,
  assert, clean up).
- Integration: `searchCandidates` end-to-end with a mix of filters.

## Out of scope (YAGNI — later phases)

- Location chip and region/tier grouping for education (kept binary/country only).
- Saved / re-openable searches.
- Live-as-you-type result updates (edits re-run on discrete chip actions /
  submit, not per keystroke).
- "Autopilot" follow-up conversational ranking and per-result match-rationale
  highlighting (the existing per-candidate deep analyze already covers rationale
  on demand).

## Non-negotiable constraints (inherited)

- Gemini SDK `@google/genai`; embeddings `gemini-embedding-001` @ 768 dims
  (`RETRIEVAL_QUERY` for the search query); generation `gemini-flash-latest`.
- Match score integer 0–100 everywhere.
- Migrations additive; never drop/alter the `jobs` table (untouched here).
- Service-role client server-only; secrets in `.env`.
- Stored data English; AI reasoning Thai (not applicable to this flow, which
  produces structured English filters, no Thai reasoning).
