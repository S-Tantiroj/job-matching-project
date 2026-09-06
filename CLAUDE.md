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

TDD per the plan: write the failing test, make it pass, commit.

**สองชุดแยกกันด้วยชื่อไฟล์** — `*.int.test.ts` คือ integration ที่แตะ Supabase และ
Gemini จริง ส่วนที่เหลือเป็น unit ที่ไม่แตะเครือข่ายเลย

- `npm test` — unit เท่านั้น (32 ไฟล์) **ต้องเขียวเสมอ** ถ้าแดงแปลว่าโค้ดผิดจริง
- `npm run test:integration` — integration (9 ไฟล์) รันเมื่อบริการพร้อม
- `npm run test:all` — ทั้งสองชุด

integration ต้องเก็บกวาดของตัวเอง (ใช้ชื่อขึ้นต้น `__test__` แล้วลบตอนจบ)

**`fileParallelism: false` ในชุด integration ห้ามเอาออก** — ทุกไฟล์ใช้ฐานข้อมูล
เดียวกัน การรันขนานทำให้ fixture ของไฟล์หนึ่งถูกลบระหว่างที่อีกไฟล์กำลังอ่านอยู่

**อย่าใช้ `.limit(1)` โดยไม่มี `.order()` ในเทสต์** — ไม่มี ORDER BY แปลว่า Postgres
คืนแถวแรกในฮีป และหลังมีการลบข้อมูล ช่องว่างต้นฮีปจะถูกใช้ซ้ำกับแถวที่แทรกใหม่
fixture ของเทสต์อื่นจึงกลายเป็นแถวแรกได้ เคยทำให้ `score.int.test.ts` พังแบบสุ่ม

**ความล้มเหลวชั่วคราวของบริการภายนอกให้ "ข้าม" ไม่ใช่ "ตก"** — ห่อด้วย
`tolerateOutage` จาก `test-utils/integration.ts` ซึ่งข้ามเฉพาะ 503 / 429 / timeout
และพิมพ์เหตุผลออกมา ส่วนความล้มเหลวอื่นยังตกตามปกติ เทสต์ที่แดงเพราะ Gemini
ถูกจำกัดความจุคือสัญญาณลวง และสัญญาณลวงสอนให้คนเลิกสนใจสีแดง

**เพดานเวลาการเรียก Gemini** อยู่ที่ `lib/gemini/withTimeout.ts` ปรับด้วย
`GEMINI_TIMEOUT_MS` — เคยวัดได้ว่า free tier ตอบคำขอ 20 token ช้าถึง 52 วินาที
และคืน 503 หลังรอ 155 วินาที การไม่มีเพดานแปลว่าผู้ใช้รอค้างโดยไม่มีอะไรบอก

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
- [~] Edit main fields — **ถอดออกแล้ว** (เคยเป็น `PATCH /api/candidates/[id]` →
      `lib/candidates/update.ts` + `EditCandidateModal`, ลบทั้งสามไฟล์)
      **อย่าเพิ่มกลับโดยไม่แก้เรื่องนี้ก่อน:** ตาราง `candidates` เป็นภาพสะท้อนของ
      แหล่งข้อมูลภายนอก และการแก้แถวที่ `source = 'scraper'` ไร้ผลอยู่แล้ว —
      `updateCandidateFields` อัปเดต `embed_hash` ตามข้อความที่แก้ รอบ sync ถัดไป
      จึงพบว่า hash ของข้อมูลที่ scrape มาไม่ตรง แล้วเขียนทับทั้งแถวเงียบๆ ผู้ใช้
      เห็นว่าแก้สำเร็จแล้วค่ากลับคืนเองในคืนถัดมาโดยไม่มีคำอธิบาย
      ถ้าจะทำใหม่ ต้องมีคอลัมน์ระบุว่าฟิลด์ไหนถูกแก้ด้วยมือ แล้วให้ `upsertCandidate`
      เว้นฟิลด์เหล่านั้นไว้ ไม่ใช่แค่เปิด UI กลับมา
- [x] Change password (verifies the current one via `signInWithPassword` first —
      Supabase's `updateUser` does not check it), forgot/reset password
- [x] Email confirmation on signup → `/auth/confirm` auto-logs in then redirects.
      That page exists because `middleware.ts` guards `/dashboard` from cookies
      server-side and would bounce the user before the client can store the
      session; `/auth/*` is deliberately outside the middleware matcher.

### Phase 7 — v3 Self-assessment (user uploads their own resume PDF)
Spec/plan: `docs/superpowers/{specs,plans}/2026-08-20-self-assessment*`
- [x] Migration 011 — **dropped the orphaned `resumes` and `matches` tables** (both
      empty, unreferenced, not created by any migration here, and RLS-disabled) and
      created `self_profiles` + `resume_assessments` with owner-scoped RLS.
      `matches` MUST be dropped before `resumes` — there is a real FK
      `matches.resume_id -> resumes(id)`; the reverse order aborts the migration.
- [x] Migration 012 — `match_jobs` RPC, the mirror of `match_candidates` over `jobs`.
      The 768-dim shared space is what makes ranking jobs for a profile possible.
- [x] PDF read natively by Gemini (`inlineData: { mimeType, data: <base64> }` —
      camelCase; the Python docs' snake_case does not work in the JS SDK). No
      PDF-parsing library. `lib/gemini/parsePdf.ts` + `lib/gemini/assess.ts` are
      deliberately two calls: extraction is factual, assessment is judgment, and
      the assessment can be re-run from `parsed_data` without a re-upload.
- [x] Upload is `FormData`, NOT base64 JSON like the other routes — base64 inflates
      ~33% and Vercel caps bodies at 4.5MB. If any Gemini/embed step fails, nothing
      is written; a profile with a null embedding would silently never rank.
- [x] **Rebuilt as two phases** (`2026-09-06-self-assessment-template`) —
      `POST /api/self-assessment/parse` (FormData `{ file }`) only reads the PDF
      and returns a draft; it writes nothing. `POST /api/self-assessment` (JSON
      `{ draft, fileName? }`) takes a **user-confirmed** draft, assesses, embeds,
      and inserts in one call. `components/SelfAssessmentStart.tsx` (two visible
      entry points — upload or "กรอกข้อมูลด้วยตัวเอง", not manual entry hidden
      behind an upload failure) hands the draft to `components/ProfileForm.tsx`
      for review before anything is saved. `raw_text` is no longer written
      (column stays, migration is additive) — the user now confirms the data
      themselves, so that provenance trail lost its purpose.
- [x] `/self-assessment` page + `matchJobsForProfile`. Ranking makes ZERO LLM calls;
      role scores cache in `resume_assessments` by `requirement_hash`.
- [x] `ProfileDraft` (`lib/self/profileDraft.ts`) adds per-education `gpa` (string,
      not number — scales differ and Thai honors text like "เกียรตินิยมอันดับหนึ่ง"
      is valid). **`gpa` must never enter `buildEmbedText`** — that function is
      shared with the candidate-ingest side, and touching it changes `embed_hash`
      for every row in `candidates`, forcing a full re-embed.
- **Privacy is structural:** `self_profiles` is a separate table from `candidates`,
  so uploaded data cannot reach recruiter search. Every route uses the service-role
  client, which bypasses RLS — `.eq('owner_id', session.userId)` IS the access
  control, not a second layer. Id-bearing routes answer **404, not 403**, to a
  non-owner so the response cannot confirm an id exists.

### Phase 8 — v4 Scraper automation
Spec/plan: `docs/superpowers/{specs,plans}/2026-08-24-scraper-automation*`
- [x] Migration 013 — `ingest_runs` (ตามรอยที่มา, หลักฐาน PDPA), `pending_candidates`
      (คิวรอตรวจ), `suppressed_profiles` (ระงับตามคำขอ) + `candidates.ingest_run_id`
      และ `candidates.embed_hash`
- [x] **`embed_hash` คือสิ่งที่ทำให้ฟีเจอร์นี้อยู่รอด** — `upsertCandidate` เรียก `embedText`
      ก่อนเช็คว่าแถวมีอยู่แล้วไหม การรันทุกคืนกับ search เดิมจึงจะ re-embed ทุกคนทุกครั้ง
      สคริปต์เทียบ hash ก่อนเรียก Gemini จึงข้ามแถวที่ไม่เปลี่ยนได้ และ **resume ได้เอง
      โดยไม่ต้องมีตาราง checkpoint** — สคริปต์จึง idempotent รันซ้ำได้เสมอ
- [x] **เช็ครายชื่อระงับอยู่ใน `upsertCandidate` ก่อน embed** ไม่ใช่ในสคริปต์ — ถ้าเช็คแค่ใน
      สคริปต์ การวาง CSV ด้วยมือที่ `/import` จะพาคนที่ขอให้ลบกลับเข้ามา
- [x] การลบตามคำขอเป็นการกระทำเดียว (บันทึกรายชื่อระงับ **ก่อน** ลบ) — ถ้าลบก่อนแล้วบันทึกล้ม
      จะได้สถานะที่แย่ที่สุดคือข้อมูลหายแต่คืนถัดไปกลับมาใหม่
- [x] `classifyRow` คัดกรองสี่เกณฑ์ (headline, experience, linkedin_url, education)
      ครบเข้า `candidates` เลย ไม่ครบเข้าคิว — อนุมัติทีละคน ปฏิเสธเป็นกลุ่มได้
- [x] รันบน GitHub Actions ไม่ใช่ Vercel Cron เพราะ 500+ แถว × 1 embedding เกินเพดานเวลา
      ของ serverless แน่นอน — สคริปต์เรียก `upsertCandidate` ตรงๆ ไม่ผ่าน HTTP
- **`upsertCandidate` คืน `{ id, updated, suppressed }`** — `id` เป็น null เมื่อ suppressed
  ผู้เรียกต้องเช็ค `suppressed` ก่อนใช้ `id`
- cron ของ GitHub เป็น **UTC** — `0 19 * * *` = 02:00 เวลาไทยของวันถัดไป
- ยังไม่ได้ยืนยัน `lib/ingest/phantombuster.ts` กับ API จริง (ยังไม่มีบัญชี) แยกไฟล์ไว้
  เพื่อให้แก้จุดเดียวเมื่อพบรูปร่างจริง

#### รูปร่าง CSV จริงจาก PhantomBuster (ยืนยันกับไฟล์ตัวอย่างแล้ว)

- **มี phantom สองแบบและตั้งชื่อคอลัมน์ไม่เหมือนกัน** — profile scraper ใช้ชื่อขึ้นต้น
  `linkedin*` (`linkedinJobTitle`) ส่วน search export ใช้ชื่อสั้น (`jobTitle`)
  **ไฟล์ไม่ได้บอกว่ามาจาก phantom ตัวไหน** `parseLinkedInCsv` จึงรับทั้งสองชื่อทุกฟิลด์
  ผ่าน `makeGetter(...aliases)` ที่คืนค่าแรกที่ไม่ว่าง — ส่งชื่อ `linkedin*` ก่อนเสมอ
  เพราะ profile scraper เป็นแหล่งที่ข้อมูลครบกว่า
- **search export ไม่มี `skills`, `jobDescription`, `fieldOfStudy`, `professionalEmail`
  เลย ไม่ใช่แค่ชื่อไม่ตรง** — สามในนั้นป้อน `buildEmbedText` โดยตรง ถ้าใช้ phantom นี้
  เป็นแหล่งหลัก embedding จะบางกว่าที่ระบบค้นหาถูกออกแบบมารองรับ ตัวใกล้เคียงที่สุดคือ
  `additionalInfo` ซึ่งแมปเข้า `summary`
- **`additionalInfo` ถูก HTML-escape แต่คอลัมน์อื่นไม่** (`&amp;` ในไฟล์จริง) จึง decode
  entity ที่ชั้น `get()` ไม่ใช่รายฟิลด์ — ค่านี้ทั้งแสดงต่อผู้ใช้และเข้า embedding
  ("amp" จะกลายเป็น token ขยะ) ลำดับการ decode สำคัญ: `&amp;` ต้องเป็นตัวสุดท้าย
- **แถวที่ scrape ไม่สำเร็จมาเป็นแถวว่างพร้อม URL** — ตัวอย่างจริง 15 แถวใช้ได้ 10
  `parseLinkedInCsv` ทิ้งแถวไม่มีชื่ออยู่แล้ว ไม่ต้องแก้อะไรเพิ่ม
- **ตารางในฐานข้อมูลไม่ต้องแก้เพราะ header ไม่ตรง** — ฟิลด์ที่ขาดเป็น NULL ได้ทั้งหมด
  (migration 014 เพิ่ม `industry` ด้วยเหตุผลอื่น ดูหัวข้อถัดไป)

#### ผลกระทบของการไม่มี skills / jobDescription / fieldOfStudy

- **`fieldOfStudy` และ `jobDescription` ไม่เคยอยู่ใน `buildEmbedText` ตั้งแต่แรก** —
  education ใช้แค่ `degree institution country` และ experience ใช้แค่ `title company`
  การขาดสองฟิลด์นี้จึงไม่กระทบการจัดอันดับเลย กระทบเฉพาะ `analyzeCandidate`
  ซึ่งรับแถว education/experience เต็มจาก `score.ts`
- **วัดแล้วด้วย `scripts/ablate-embedding.ts`** (25 คน 4 งาน): ตัด skills ออก
  Spearman 0.951 / top-10 8.5-10 · ตัด summary ออกด้วย Spearman 0.856
  **summary สำคัญกว่า skills** ซึ่งเข้าทางเรา เพราะ search export ให้ `additionalInfo` มา
- **ตัวเลขนั้นเป็นขอบบน** — ผู้สมัครที่ทดสอบทั้งหมดเป็น `source = 'synthetic'`
  ซึ่ง skills มักพูดซ้ำสิ่งที่ headline บอกอยู่แล้ว ของจริงอาจมี skills ที่ headline
  ไม่ได้บอก ให้รันสคริปต์นี้ซ้ำเมื่อมีคนจริงพร้อม skills สัก 30 คน

#### migration 014 — `candidates.industry`

- `industry` มาจาก PhantomBuster ทั้งสอง phantom และเป็นคู่เทียบของ `jobs.category`
  ที่อยู่ใน `buildJobEmbedText` อยู่แล้ว — เป็นสัญญาณฟรีที่เดิมถูกทิ้ง
- **กับดัก: ทุกคอลัมน์ที่ `buildEmbedText` ใช้ ต้องอยู่ใน `.select()` ของ
  `lib/candidates/update.ts`** แม้จะแก้จากหน้าเว็บไม่ได้ก็ตาม ถ้าลืม ค่านั้นจะหายจาก
  `after` แล้วการ re-embed จะเขียนทับ embedding ด้วยข้อความที่ขาดค่านั้นไปเงียบๆ
  ค่าประเภทนี้อยู่ใน `shared` เพื่อให้ทั้ง `before` และ `after` ถือค่าเดียวกัน
- `updateCandidateFields` เดิม**ไม่อัปเดต `embed_hash`** ตอน re-embed แก้แล้ว —
  hash ต้องขยับพร้อม embedding เสมอ ไม่งั้นการรัน sync คืนถัดไปเทียบกับ hash ที่ไม่ตรง
  กับ embedding ที่เก็บอยู่จริง
- การเพิ่ม `industry` เข้า `buildEmbedText` **ไม่ทำให้แถวเดิมต้อง re-embed** เพราะ
  `filter(Boolean)` ตัดค่า null ทิ้ง ข้อความที่ embed ของคนที่ยังไม่มี industry จึงเท่าเดิม
  เป๊ะ hash จึงตรงเหมือนเดิม — จะ re-embed เฉพาะคนที่รอบใหม่ได้ industry มาจริง
  ซึ่งเป็นพฤติกรรมที่ต้องการอยู่แล้ว

#### `buildJobEmbedText` เรียงให้สมมาตรกับฝั่งผู้สมัคร

ลำดับบรรทัดจงใจให้ตรงคู่กัน `title↔headline`, `category↔industry`,
`description↔summary`, `required_skills↔skills` และเพิ่มบรรทัด `title company`
ให้ตรงกับบรรทัด experience ของผู้สมัคร เพราะผู้สมัครที่ scrape มาอาจเหลือแค่ตำแหน่ง
กับบริษัทเท่านั้น **แก้ไฟล์นี้แล้วต้อง re-embed งานทั้งหมด** — `npx tsx scripts/seed-jobs.ts`
ทำให้เอง (upsert บน `source,external_id` แล้วคำนวณ embedding ใหม่)

### Not done / deliberately deferred
- Google sign-in — deferred from v2. Risk: an existing email/password user
  signing in with Google may get a NEW auth user (and so a new profile, role
  `member`, no access to their old shortlists) instead of a linked identity.
  Verify on a preview deploy before enabling.
- Invite-only membership (admin creates members, no public signup) — discussed,
  not specced. Note that deleting the `/signup` page does not close signups: the
  anon key is public, so `POST /auth/v1/signup` still works. The real switch is
  Supabase → Authentication → Providers → Email → "Allow new users to sign up".
- `/api/ingest`'s 403 role gate has no test — `route.test.ts` stubs
  `hasRole: () => true`.

## หน้าสาธารณะ

`/` และ `/help` อยู่ในกลุ่ม `(public)` เปิดให้เข้าโดยไม่ต้องล็อกอิน — `matcher` ใน
`middleware.ts` เป็นรายการเจาะจงที่ไม่ครอบสองเส้นทางนี้ **อย่าเพิ่มเข้าไป**

`app/page.tsx` เดิมถูกลบและย้ายเข้ากลุ่ม พร้อม**เอา redirect ไป `/dashboard` ออก** —
ของเดิมทำให้เจ้าของระบบดูหน้าแนะนำของตัวเองไม่ได้เลยเวลาล็อกอินอยู่

**ตาราง UAT ไม่เผยแพร่บนเว็บ** — เป็นเอกสารภายในสำหรับการส่งมอบงาน เนื้อหาอยู่ที่
`docs/uat/skouth-uat.md` เท่านั้น หน้า `/help` แสดงเฉพาะคู่มือผู้ใช้

**อย่าเอาไฟล์ที่ไม่อยากให้คนนอกเห็นไปวางใน `public/`** — Next.js เสิร์ฟทุกอย่าง
ในโฟลเดอร์นั้นเป็นไฟล์สาธารณะแม้ไม่มีลิงก์ชี้ไป การลบปุ่มดาวน์โหลดไม่ได้ซ่อนไฟล์
เคยมี `public/skouth-uat.pdf` ที่มีตาราง UAT อยู่ข้างใน แล้วลบออกด้วยเหตุผลนี้

**เนื้อหาคู่มืออยู่ที่ `lib/help/guide.ts` ที่เดียว** — `components/help/UserGuide.tsx`
import ตรง ส่วนส่วนที่ 1 ของ `docs/uat/skouth-uat.md` สร้างด้วย
`npx tsx scripts/sync-guide-doc.ts` แก้เนื้อหาแล้วต้องรันสคริปต์ ไม่งั้น
`lib/help/guide.test.ts` จะตก (มันเทียบไฟล์ md กับ `renderGuideMarkdown()` ตัวต่อตัว)
สคริปต์แตะเฉพาะช่วงระหว่าง "## ส่วนที่ 1" กับ "## ส่วนที่ 2" — ตาราง UAT ปลอดภัย
เดิมทั้งสองที่ถือข้อความคนละชุดและเริ่มไม่ตรงกันแล้วจริง (ข้อ 1.1 และ 1.3 ต่างกัน)

**ไม่มีไฟล์ PDF คู่มือให้ดูแลแล้ว** — `/help` คือฉบับเดียว ผู้ใช้ที่อยากได้ไฟล์
กด Ctrl+P สั่งพิมพ์เป็น PDF เอง `@media print` ใน `globals.css` ซ่อนแถบนำทาง
สารบัญ และคำแนะนำการพิมพ์ แล้วกัน `.guide-block` ไม่ให้ถูกตัดคร่อมหน้า
**อย่าซ่อน `.btn` ทั้งหมดตอนพิมพ์** — ปุ่มเดียวที่เหลือบนหน้า `/help` คืออีเมลติดต่อ
ซ่อนแล้วฉบับพิมพ์จะมีหัวข้อ "ติดต่อเรา" ที่ไม่มีอีเมลอยู่ใต้มัน จึงทำให้แบนแทน

**ถ้าจะทำ PDF จาก `skouth-uat.md` ต้องทำบนเครื่อง Windows** — sandbox ไม่มีฟอนต์ไทย
และติดตั้งเพิ่มไม่ได้ (PyPI และ apt ถูกปิดด้วย 403) ไฟล์ที่สร้างจากที่นั่นจะเป็น
สี่เหลี่ยมเปล่าทั้งฉบับ และอย่าวางผลลัพธ์ใน `public/`

**ปุ่มหลักบนหน้าแรกอยู่ที่ `lib/public/cta.ts`** จุดเดียว จะเปลี่ยนเป็น
"สมัครด้วยอีเมลองค์กร" เมื่องานจำกัดโดเมนเสร็จ (ดู "งานถัดไป" ใน
`docs/superpowers/specs/2026-08-29-public-pages-design.md`)

**`lib/help/contact.test.ts` ดักการ deploy ด้วยอีเมล placeholder** — หน้าที่บอก
ช่องทางติดต่อที่ไม่มีอยู่แย่กว่าไม่มีหน้านั้นเลย

## เอกสารทางกฎหมาย

`/terms` และ `/privacy` อยู่ในกลุ่ม `(public)` เนื้อหาอยู่ที่ `components/legal/`
ค่าคงที่ทั้งหมดอยู่ที่ `lib/legal/meta.ts` — ผู้ควบคุมข้อมูล เวอร์ชัน วันที่มีผล
ระยะเวลาเก็บ และรายการผู้ประมวลผลภายนอก

**ยังไม่ผ่านการตรวจโดยนักกฎหมาย** ร่างจากสิ่งที่ระบบทำจริง แต่ต้องให้ผู้มีคุณสมบัติ
ตรวจก่อนใช้อ้างอิงจริง

**`lib/legal/meta.test.ts` ตั้งใจให้ตกไว้ก่อน** จนกว่าจะระบุผู้ควบคุมข้อมูลจริง —
นโยบายที่ไม่บอกว่าใครรับผิดชอบทำให้เจ้าของข้อมูลไม่รู้ว่าจะใช้สิทธิ์กับใคร

**เพิ่มบริการภายนอกที่แตะข้อมูลส่วนบุคคลเมื่อไร ต้องเพิ่มใน `PROCESSORS`** ทั้งสามราย
ที่มีอยู่ (Supabase, Gemini, Vercel) อยู่นอกประเทศไทย จึงเป็นการโอนข้อมูลข้ามพรมแดน
ที่ต้องแจ้ง มีเทสต์ดักไว้บางส่วนแต่ดักการเพิ่มรายใหม่ไม่ได้

**ข้อห้ามใช้คะแนน AI ตัดสินคนโดยลำพังอยู่ในสองที่** — ข้อ 4 ของ `TermsOfUse.tsx`
และข้อ 3 ของ `PrivacyPolicy.tsx` แก้ที่หนึ่งต้องดูอีกที่

### งานค้างที่หน้าเว็บนี้ยังแก้ไม่ได้

**การเผยแพร่ `/privacy` ไม่ได้ทำให้พ้นหน้าที่แจ้งตาม PDPA มาตรา 25** ผู้สมัครที่เก็บ
ข้อมูลมาจากแหล่งสาธารณะจะไม่มีวันเข้ามาอ่านหน้านี้ กฎหมายกำหนดให้ต้องแจ้งเจ้าของข้อมูล
เมื่อเก็บจากแหล่งอื่น การมีหน้าเว็บเป็นเพียงส่วนหนึ่งของการทำหน้าที่นั้น ไม่ใช่ทั้งหมด

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
