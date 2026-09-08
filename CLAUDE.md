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
- **Generation:** ชื่อรุ่นทั้งหมดอยู่ที่ `lib/gemini/models.ts` **ที่เดียว** และปักหมุด
  ไว้ชัดเจน มีเทสต์ดักไม่ให้ไฟล์อื่นใน `lib/` หรือ `app/` เขียนชื่อรุ่นตรงๆ
  `MODEL_TEXT` = `gemini-3.8-flash` · `MODEL_FAST` = `gemini-3.5-flash-lite`
  `THINKING_LOW` = `{ thinkingLevel: ThinkingLevel.LOW }` — **การตั้งค่าที่กระทบราคา
  อยู่ที่ไฟล์นี้ด้วย ไม่ใช่แค่ชื่อรุ่น** และ `models.test.ts` ดักได้แค่ชื่อรุ่น ไม่ดัก thinkingLevel
  **เลิกใช้ alias `gemini-flash-latest` แล้ว** — 2026-09-06 มันขยับไป 3.8-flash เอง
  โดยไม่มีใคร deploy อะไร แล้ววัดได้ว่า output 87-90% เป็น thinking token ที่จ่ายแล้วทิ้ง
  ทำให้การค้นหาช้าลง 3 เท่าและแพงขึ้น 10 เท่าเงียบๆ

  **ใครใช้อะไร (วัดเมื่อ 2026-09-08 ด้วย `scripts/compare-gemini-models.ts` กับ CV จริง):**

  | งาน | รุ่น | เหตุผล |
  |---|---|---|
  | `extractFilters` | FAST | วิ่งทุกครั้งที่ค้นหา ความเร็วคือ UX · เป็นรุ่นเดียวที่ผลนิ่งทั้ง 3 รอบ |
  | `parse` (resume ข้อความ) | FAST | ผลเหมือน 3.8 ทุกฟิลด์และนิ่งทั้ง 3 รอบ · ถูกลง 4.9× |
  | `assess` | FAST | ผ่าน 3/3 ผลนิ่ง · ถูกลง 5.5× |
  | `analyze` | FAST | ดูหัวข้อ "คะแนน analyze ไม่นิ่ง" ข้างล่าง — **เลือกเพราะเร็วและถูก ไม่ใช่เพราะพิสูจน์ว่าเท่ากัน** |
  | `parsePdf` | TEXT + `THINKING_LOW` | ดูย่อหน้าถัดไป |
  | `generate` | TEXT | สร้าง seed data ตอนพัฒนา ไม่กระทบผู้ใช้ |

  **`parsePdf` ห้ามย้ายไป FAST** — flash-lite ผ่านตัวตรวจทุกครั้งและถูกกว่า แต่
  **ทำ education หายไปหนึ่งรายการ (4 แทนที่จะเป็น 5) ใน 2 จาก 3 รอบการวัด**
  `validateProfileDraft` ดูแค่ว่ารูปทรงถูก ไม่ได้ดูว่าครบ ข้อมูลที่หายตั้งแต่ต้นคือสิ่งที่
  ผู้ใช้ตรวจร่างมักไม่ทันสังเกต ต่างจากค่าที่ผิดซึ่งเห็นแล้วรู้ทันที
  **`THINKING_LOW` สกัดได้เท่าตัวเต็ม** (edu 5 · exp 10) และ**เร็วกว่า 3 เท่าทุกรอบ**
  (4.6-6.6 วินาที เทียบ 13.9-19.0)
  **เหตุผลที่ใช้ LOW คือความคาดเดาได้ ไม่ใช่ราคาเฉลี่ย** — 3.8-flash เต็มรูปแบบใช้
  thinking token แกว่งสุดขั้วจาก input เดียวกัน (3,181 / 0 / 1,979 ในสามรอบ) ทำให้
  ราคาสวิงระหว่าง $7.03-$19.09 ต่อ 1,000 ครั้ง ส่วน LOW คงที่ $7.12-$7.14 ทุกรอบ
  และตัวเต็มเคยจัด `industry` เป็น "Utilities" ทั้งที่อีกสองรุ่นได้ "Technology,
  Information and Media" — รุ่นใหญ่ก็พลาด และพลาดคนละแบบ

  **คะแนน `analyze` ไม่นิ่ง — เป็นคุณสมบัติของระบบที่ต้องรู้ ไม่ใช่แค่เรื่องเลือกรุ่น**
  วัดด้วยผู้สมัครสี่คนที่ต่างกันทีละมิติ (ตรงเป๊ะ / โทในไทย / ประสบการณ์ไม่ถึง /
  ตำแหน่งใกล้เคียง) ทุกรุ่นแยกแยะได้เหมือนกัน คือให้ 100 เฉพาะคนที่ตรงเงื่อนไข
  แล้วหักคะแนนสามคนที่เหลือลงมาที่ 60-75 **แต่คะแนนของผู้สมัครคนเดียวกันแกว่งได้
  10 แต้มจากการรันซ้ำด้วย input เดียวกันบนรุ่นเดียวกัน** (3.8-flash ได้ชุดคะแนน
  คนละแบบทั้งสามรอบ) ซึ่งเท่ากับหรือมากกว่าช่องว่างระหว่างรุ่น จึงพิสูจน์ไม่ได้ว่า
  รุ่นไหนตัดสินดีกว่า — เลือก FAST เพราะเร็วกว่า 4.6× และถูกกว่า 13×
  **ผลที่ตามมาที่สำคัญกว่าเรื่องรุ่น:** `analyses` cache คะแนนแรกที่ได้ไว้ตลอดไปตาม
  `requirement_hash` ผู้สมัครสองคนที่เทียบกับความต้องการเดียวกันจึงได้คะแนนจากการ
  สุ่มคนละครั้ง และคนเดียวกันที่ถูกให้คะแนนคนละวันอาจต่างกัน 10 แต้มโดยไม่มีใคร
  แก้อะไรเลย **ข้อห้ามใน `/terms` ข้อ 4 เรื่องห้ามใช้คะแนน AI ตัดสินคนโดยลำพัง
  มีมูลกว่าที่คิดตอนเขียนมัน**

  **ข้อจำกัดของการวัดที่ต้องรู้:** ใช้ CV จริงฉบับเดียว ข้อสรุปว่า "flash-lite ทำ
  education หาย" ซ้ำได้ 2 ใน 3 รอบแต่ยังเป็นเอกสารเดียว · ตัวชี้วัดของ `assess`
  เทียบแค่**จำนวนข้อ** ไม่ได้เทียบเนื้อหา ควรอ่านคำแนะนำจริงเทียบด้วยตาเป็นระยะ
  · `gemini-2.5-flash-lite` ตอบ 404 ทุกงาน คีย์นี้ไม่มีสิทธิ์ใช้ ตัดออกจากสคริปต์แล้ว
  · **ห้ามสรุปจากการรันครั้งเดียว** — เคยเขียนตัวเลข parsePdf ลงไฟล์นี้จากรอบเดียว
  แล้วรอบถัดมาไม่ซ้ำเลย ตั้ง `COMPARE_REPEATS` อย่างน้อย 3 เสมอ ถ้าตั้ง 1 คอลัมน์ ⚠
  จะว่างทั้งตารางเพราะไม่มีรอบที่สองให้เทียบ ซึ่งเป็นข้อมูลชิ้นที่สำคัญที่สุด

  **สคริปต์วัดต้องมี resume PDF จริง** — ตั้ง `COMPARE_PDF` ชี้พาธ **นอก repo**
  (ไฟล์เป็นข้อมูลส่วนบุคคล ห้าม commit) ไม่ตั้งไว้จะข้ามงาน `parsePdf` ไปเงียบๆ
  prompt ทุกตัวในสคริปต์ **import จากโมดูลจริง** ไม่ใช่สำเนา จึงไม่ drift
  และผลของแต่ละรุ่นถูกส่งเข้า `parseProfileResponse`/`normalizeAssessment` ตัวจริง
  ทำให้มีคอลัมน์ "ผ่าน" — **ดูคอลัมน์นั้นก่อนราคาเสมอ**
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
- **`candidates` เปิดให้ `authenticated` อ่านได้แค่ `id, full_name, headline`**
  (migration 016) RLS กรอง "แถว" ส่วน column-level grant กรอง "คอลัมน์" ต้องมีทั้งคู่
  เดิม policy เป็น `auth.role() = 'authenticated'` ทั้ง SELECT และ INSERT ซึ่งแปลว่า
  **ใครที่ล็อกอินก็ยิง `GET /rest/v1/candidates?select=*` ด้วย anon key ที่เป็นค่า
  สาธารณะ แล้วดูดทั้งตารางรวมอีเมลได้** การกั้น role ที่ชั้นแอปกันได้แค่หน้าจอ
  **ห้ามรัน `grant all on all tables in schema public to authenticated`** — คำสั่งนี้
  โผล่ในคู่มือทั่วไปบ่อย และมันจะเปิดช่องนี้กลับมาทันที
  สามคอลัมน์ที่เหลือไว้เพราะ `app/(app)/shortlists/page.tsx` เป็น client component
  ที่ select ซ้อนผ่าน anon key ถ้าตัดหมด PostgREST จะคืน null ให้ resource ที่ซ้อน
  **โดยไม่ error** หน้า Shortlist จะไม่มีชื่อผู้สมัครแบบหาสาเหตุยาก
- **`profiles` คืนสิทธิ์ UPDATE ให้เฉพาะ `display_name` กับ `settings`** (migration 019)
  **policy ที่เขียนว่า "แก้ได้เฉพาะแถวของตัวเอง" ไม่ได้แปลว่า "แก้คอลัมน์ไหนก็ได้ในแถวนั้น
  เป็นเรื่องปลอดภัย"** — migration 003 สร้าง
  `for update using (id = auth.uid()) with check (id = auth.uid())` พร้อมคอมเมนต์ว่า
  "Role changes are still restricted" ซึ่งถูกครึ่งเดียว มันกันการแก้แถวคนอื่นได้จริง
  แต่ไม่ได้กันการแก้คอลัมน์ `role` **ในแถวของตัวเอง** ยืนยันกับฐานจริง 2026-09-08 ว่า
  `anon` และ `authenticated` มีสิทธิ์ครบทุกชนิดบนตารางนี้ตามค่าตั้งต้นของ Supabase
  ผลคือใครที่ล็อกอินก็ยิง `PATCH /rest/v1/profiles?id=eq.<ตัวเอง>` ด้วย `{"role":"admin"}`
  ผ่าน anon key ที่เป็นค่าสาธารณะแล้วได้สิทธิ์แอดมินทันที
  **คอลัมน์ใหม่ที่เพิ่มทีหลังจะไม่ได้สิทธิ์เขียนโดยอัตโนมัติ ซึ่งเป็นสิ่งที่ต้องการ** —
  ถ้าคอลัมน์ใหม่ต้องให้ผู้ใช้แก้เองจริงๆ ต้องเพิ่มชื่อเข้า `grant update (...)` อย่างตั้งใจ
  การเปลี่ยน role ยังทำได้ผ่าน `POST /api/admin/users` ซึ่งใช้ service-role
  เทสต์อยู่ที่ `019_lock_profile_columns.int.test.ts` — **สร้างบัญชีจริงแล้วล็อกอินด้วย
  anon key ยิง PostgREST ตรงๆ** ไม่ใช่ตรวจว่าหน้าจอมีช่องให้แก้หรือไม่ เพราะช่องโหว่
  ไม่ได้อยู่ที่หน้าจอ และตรวจค่าในฐานซ้ำ ไม่เชื่อค่า `error` อย่างเดียว
- **`search_path` ของ RPC ต้องมี `extensions` ด้วยเสมอ** — pgvector ติดตั้งใน schema
  `extensions` ไม่ใช่ `public` ตัวดำเนินการ `<=>` จึงอยู่ที่นั่น ตั้งเป็น
  `public, pg_temp` เฉยๆ แล้ว RPC ทั้งสี่พังทันทีด้วย
  `operator does not exist: extensions.vector <=> extensions.vector`
  (เกิดขึ้นจริง 2026-09-07 ตอนทำ migration 017 รอบแรก)
- **`.rpc()` และ `.from()` ต้องเช็ค `error` เสมอ ห้าม destructure เอาแต่ `data`** —
  ตอน RPC พังข้างบน `lib/search/query.ts` อ่านแค่ `data` ซึ่งเป็น null แล้วคืน `[]`
  **หน้าค้นหาจึงขึ้น "ไม่พบผลลัพธ์" ทั้งที่ระบบค้นหาพังสนิท** ไม่มี log ไม่มีสัญญาณเลย
  "ไม่มีใครตรงเงื่อนไข" กับ "ค้นหาไม่ได้" เป็นคนละเรื่อง ต้องแยกให้ผู้ใช้เห็น
- **RPC ทั้งสี่ (`match_candidates`, `match_candidates_filtered`, `match_jobs`,
  `duplicate_candidate_names`) เรียกได้เฉพาะ `service_role`** (migration 017)
  ถอน EXECUTE จาก PUBLIC/anon/authenticated แล้ว **ต้องถอนจาก PUBLIC ด้วยเสมอ**
  ไม่ใช่แค่สอง role ที่ระบุชื่อ ไม่งั้นทุกคนยังเรียกได้ผ่าน PUBLIC อยู่ดี
  ทั้งสี่ถูกเรียกจากฝั่งเซิร์ฟเวอร์เท่านั้น ถ้าวันไหนต้องเรียกจาก client component
  อย่า grant กลับ — ให้ทำเป็น route handler แล้วเรียกด้วย service-role แทน
- **`is_admin()` ห้ามถอน EXECUTE จาก authenticated** แม้ Supabase advisor จะเตือน —
  RLS policy ของ `profiles` เรียกมันอยู่ (`using ((id = auth.uid()) OR is_admin())`)
  และ Postgres ประเมิน policy ด้วยสิทธิ์ของผู้ query ถอนแล้วการอ่าน `profiles`
  ทุกครั้งจะ error ทำให้ `/settings` และ `AnalyzePanel` พัง ตัวมันเองไม่รั่วอะไร:
  anon ได้ false เสมอ ส่วน authenticated รู้สถานะตัวเองซึ่งอ่านจากแถวตัวเองได้อยู่แล้ว
- **คำเตือน `rls_enabled_no_policy` 9 ตารางเป็นการออกแบบ ไม่ใช่บั๊ก** — เปิด RLS
  โดยไม่มี policy = ปฏิเสธทุกอย่างผ่าน anon key ส่วนแอปใช้ service-role ซึ่ง bypass
  **อย่า "แก้" ด้วยการเพิ่ม policy** นั่นคือการเปิดช่องที่ตอนนี้ปิดสนิทอยู่
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

**ห้าม stub ฟังก์ชันที่กำลังจะทดสอบ** — `app/api/ingest/route.test.ts` เคย mock
`hasRole: () => true` ทั้งไฟล์ ผลคือประตูสิทธิ์ของ endpoint ที่แทรกและเขียนทับแถวใน
`candidates` เป็นชุด**ไม่เคยถูกทดสอบเลย** ลบ `if (!hasRole(...))` ออกจาก route
แล้วเทสต์ทั้งชุดยังเขียว ตอนนี้ mock เฉพาะ `getSession` (ผ่าน `vi.hoisted` เพื่อให้
แต่ละเทสต์ตั้ง role เองได้) ส่วน `hasRole` ใช้ตัวจริงผ่าน `importOriginal` —
`hasRole` เป็นฟังก์ชันบริสุทธิ์ และ `getSession` import `next/headers` แบบ dynamic
อยู่แล้ว โมดูลนี้จึง import ของจริงได้ในเทสต์ที่รันบน Node เปล่าๆ

**ประตูสิทธิ์ต้องทดสอบว่า "ปฏิเสธก่อนทำงาน" ไม่ใช่แค่ status code** — เทสต์ยืนยันว่า
`member` ไม่ทำให้ `upsertCandidate` ถูกเรียก และไม่ทำให้ `parseResume` (ซึ่งเสียเงิน
ค่า token) ถูกเรียก ประตูที่อยู่หลังการทำงานคืนสถานะถูกแต่รั่วจริง และรวมกรณี role
ที่ enum ไม่รู้จักด้วย เพราะ `getSession` cast ค่าจาก `profiles.role` ด้วย `as Role`
โดยไม่ตรวจ — `ROLE_RANK[unknown] ?? 0` ต้องปิดประตู ไม่ใช่เปิด

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
- [x] **ตัวกรองแสดงตั้งแต่เปิดหน้า** ไม่ใช่โผล่หลัง AI ตอบ — `FilterChips` เคยอยู่ใน
      `{semanticQuery && ...}` จึงมองไม่เห็นจนกว่าจะค้นหาสำเร็จหนึ่งครั้ง
      **การจัดอันดับยังต้องมีข้อความเสมอ** (`runSearch` คืนทันทีเมื่อ `!sq.trim()`)
      เพราะการเรียงใช้ embedding ของข้อความ ตัวกรองเป็นเงื่อนไขตัดออกเท่านั้น —
      แผงจึงบอกไว้ว่า "ตั้งไว้ล่วงหน้าได้ จะถูกใช้เมื่อกดค้นหา" ไม่ปล่อยให้กดแล้วเงียบ
- [x] **`lib/search/mergeFilters.ts` — AI ห้ามเขียนทับตัวกรองของผู้ใช้** เดิม
      `setFilters(intent.filters)` ทับได้อย่างปลอดภัยเพราะผู้ใช้ตั้งค่าก่อนไม่ได้อยู่แล้ว
      พอตัวกรองแสดงตั้งแต่แรก การทับกลายเป็นการทิ้งงานของผู้ใช้เงียบๆ
      **แต่การ "รวม" เฉยๆ ก็ผิด** — ค้น "data scientist Python" ได้ชิป Python แล้วค้นใหม่
      ว่า "graphic designer" ชิปเดิมจะติดค้างและกรองผลลัพธ์ทิ้งโดยไม่มีอะไรบอกว่ามาจาก
      คำค้นหาที่เลิกใช้แล้ว จึงต้องจำว่าชิปไหนเป็นของ AI (`AiOwned`) แล้วถอดเฉพาะของ AI
      รอบถัดไป ค่าที่ผู้ใช้พิมพ์เอง**แม้ AI จะเสนอมาด้วย**ต้องนับเป็นของผู้ใช้ ไม่งั้นรอบหน้า
      จะถอดทิ้งทั้งที่ผู้ใช้พิมพ์มากับมือ เทียบค่าแบบไม่สนตัวพิมพ์ ("python" กับ "Python"
      ต้องไม่กลายเป็นสองชิปที่ดูเหมือนกันแต่ลบทีละอัน)
- [x] **หน้าค้นหาต้องแยก error ออกจาก "ไม่พบผู้สมัคร"** เดิมเป็น
      `setRes(Array.isArray(json) ? json : [])` ซึ่งกลืนการตอบ `{ error }` ที่ route
      คืนมาตอน 500 — คือบั๊กเดียวกับที่ `lib/search/query.ts` เคยกลืน error ของ RPC
      แล้วเสียเวลาไล่หาสาเหตุนาน ตอนนี้เช็ค `r.ok` ก่อน แยกข้อความของ 401 ออกจาก 500
      และห่อ fetch ด้วย try/catch สำหรับเครือข่ายขาด
- [x] **แผงตัวกรองพับได้ แต่หัวการ์ดต้องบอกเสมอว่ากรองอะไรอยู่**
      (`lib/search/describeFilters.ts`) ค่าตั้งต้นคือเปิด — ทั้งงานนี้ทำมาเพื่อให้เห็น
      ตัวกรองทันที การพับเป็นสิ่งที่ผู้ใช้เลือกเอง **ตัวกรองที่ทำงานอยู่แต่มองไม่เห็นคือ
      สาเหตุที่ผลลัพธ์น้อยผิดปกติโดยไม่มีอะไรอธิบาย** ซึ่งเป็นความผิดพลาดชนิดเดียวกับ
      ชิปของ AI ที่สะสมข้ามคำค้นหา `countActiveFilters` เช็ค `minYears != null`
      ไม่ใช่ค่าความจริง เพราะ `minYears: 0` เป็นค่าที่ตั้งใจตั้ง ไม่ใช่ค่าว่าง

### Phase 5 — UI redesign
Spec/plan: `docs/superpowers/{specs,plans}/2026-07-30-ui-redesign*`
- [x] `app/globals.css` — design tokens + ~40 reusable classes. Every page uses
      these; avoid new ad-hoc inline styles.
- [x] Every page/component restyled onto it; sticky nav; dashboard shortlist cards
- [x] **แถบเมนูของกลุ่ม `(app)` เป็น sidebar ซ้ายที่พับได้** (`components/nav/`)
      Spec: `docs/superpowers/specs/2026-09-07-sidebar-nav-design.md`
      รายการเมนูทั้งหมดอยู่ที่ `navItems.ts` **ที่เดียว** ทั้ง sidebar ปุ่มมุมขวาบน และ
      ชื่อหน้าบนแถบบนอ่านจากที่นั่น `app/(app)/layout.tsx` ยังเป็น server component
      ที่เรียก `getSession()` แล้วส่ง boolean สองตัวเข้า `AppShell` ซึ่งเป็น client component
      **`pageTitle` ต้องเลือกคำนำหน้าที่ยาวที่สุด** ไม่ใช่อันแรกที่เจอ ไม่งั้นคำตอบจะขึ้นกับ
      ลำดับในอาร์เรย์โดยไม่มีใครรู้ว่ามีความหมาย และต้องเทียบที่ขอบเส้นทาง
      (`/searching` ไม่ใช่หน้าลูกของ `/search`)
      **`navItems.test.ts` เทียบกับ `matcher` ของ `middleware.ts` สองทิศ** — ทุก href
      ที่ต้องล็อกอินต้องอยู่ใน matcher (ลืมใส่ = หน้านั้นเปิดได้โดยไม่ล็อกอินแบบเงียบๆ)
      และ `/help` ต้องไม่อยู่ใน matcher (ใส่เข้าไป = คนที่ยังไม่ล็อกอินอ่านคู่มือไม่ได้)
      พิสูจน์แล้วว่าจับได้จริงด้วยการทำให้พังชั่วคราว
      **บนจอแคบ drawer ต้องปิดเองเมื่อเปลี่ยนหน้า** — layout ของ Next.js อยู่ข้าม
      การเปลี่ยนหน้า state ของ client component จึงไม่ถูกล้าง ไม่มี `useEffect` ที่ผูกกับ
      `pathname` แล้ว drawer จะค้างทับเนื้อหาทุกครั้งที่กดเมนู
      **ข้อความในเมนูซ่อนด้วย CSS ไม่ใช่เงื่อนไขใน JSX** — บนจอแคบ sidebar กางเต็ม
      เสมอแม้ผู้ใช้เคยกดหุบบนจอกว้าง ตัดใน JSX แล้วป้ายจะหายทั้งที่มีที่ให้แสดง
      ไม่ทำไฮไลต์เมนูหน้าปัจจุบัน (ตัดสินใจแล้ว) ไม่จำสถานะพับ/กาง ไม่มี focus trap
- [x] **`.content` ห้ามเป็น flex column** — `.container` ใช้ `margin: 0 auto` และ
      **auto margin บนแกนขวางของ flexbox ยกเลิกการ stretch แล้วหดกล่องเหลือเท่าเนื้อหา**
      เกิดขึ้นจริง 2026-09-07: หน้าเว็บทั้งหน้าเหลือกว้างราว 375px กลางจอ เหมือนเปิดบน
      มือถือ ทั้งที่ `.container` ตั้ง `max-width` ไว้ชัดเจน block ธรรมดาให้ผลที่ถูกต้อง
      อยู่แล้วเพราะ topbar กับ container ซ้อนกันเองตามลำดับ
      `.container` ขยายเป็น **1280px** (หน้ากลุ่ม `(app)` เป็นการ์ดและตารางเป็นหลัก)
      ส่วน `.pub-wrap` ของหน้าอ่านยังอยู่ที่ 960px โดยตั้งใจ — บรรทัดยาวเกินอ่านยาก

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
- [x] **ตัวเลือกในฟอร์ม** (`lib/self/taxonomy.ts`) — ระดับการศึกษา 6 ระดับ และกลุ่ม
      อุตสาหกรรม **20 กลุ่มบนสุดของ LinkedIn Industry Codes V2** (ไม่ใช่ 434 รายการย่อย)
      **`value` เป็นอังกฤษ `label` เป็นไทยสำหรับแสดงเท่านั้น** — value คือสิ่งที่เข้า
      `buildEmbedText` ซึ่งอยู่สเปซเดียวกับตาราง `jobs` เก็บไทยแล้วเวกเตอร์จะไปกอง
      คนละมุมและจับคู่งานแย่ลงโดยไม่มีอาการ ค่ารายการเดียวกันนี้ถูกฉีดเข้า prompt ของ
      `parsePdf.ts` ด้วย จึงแก้ที่ `taxonomy.ts` ที่เดียว
      **ตัวตรวจฝั่งเซิร์ฟเวอร์ยังรับค่าอิสระเหมือนเดิมโดยตั้งใจ** — ถ้าบังคับให้ตรงรายการ
      โปรไฟล์เก่าที่เก็บ "MS"/"Banking" ไว้จะบันทึกไม่ผ่านทันที ฟอร์มจึงแสดงค่าเดิมเป็น
      option "ค่าเดิม: X" (`isLegacyChoice`) แทนการเด้งเป็นว่างแล้วให้ผู้ใช้ทับโดยไม่รู้ตัว
- [x] **วันที่ประสบการณ์เหลือแค่เดือน/ปี** (`lib/self/monthYear.ts`) — `<input type="date">`
      ให้เบราว์เซอร์เลือกรูปแบบตาม locale เครื่องภาษาอังกฤษจึงขึ้น MM/DD/YYYY ที่คนไทย
      อ่านสลับกับ DD/MM/YYYY ได้ง่าย และบังคับรูปแบบไม่ได้ ค่าที่เก็บยังเป็น ISO เหมือนเดิม
      ของใหม่ลงวันที่ 01 เสมอ **แถวเก่าที่มีวันจริงจะไม่ถูกเขียนทับถ้าผู้ใช้ไม่แตะช่องนั้น**
- [x] **403 PERMISSION_DENIED มีถังของตัวเอง** (`isServiceBlocked` ใน `withTimeout.ts`)
      เจอจริง 2026-09-07: Google ตั้งสถานะโปรเจกต์เป็น Restricted แล้ว Gemini ตอบ 403
      ตอนนั้นโค้ดจัดมันเป็น "ไฟล์มีปัญหา" แล้วบอกผู้ใช้ให้ไปตรวจไฟล์ที่ไม่ได้ผิดอะไร
      **ห้ามลองใหม่อัตโนมัติกับกรณีนี้** และต้องเช็คก่อน `isTransient` เสมอ

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

### Phase 9 — แก้ไขและลบตำแหน่งงาน
Spec/plan: `docs/superpowers/{specs,plans}/2026-09-07-job-edit-delete*`
- [x] Migration 018 — `analyses.job_id` nullable + FK `on delete cascade` + index
      **nullable โดยตั้งใจ** — การให้คะแนนจากหน้าผู้สมัครไม่มีงานผูกอยู่
      **แถวเก่าก่อน migration เป็น NULL ตลอดไป** กวาดย้อนหลังไม่ได้
- [x] **`analyses` ไม่เคยมีอะไรชี้กลับไปหางาน** มันคีย์ด้วย
      `(candidate_id, requirement_hash)` โดย hash มาจากข้อความความต้องการ ผลคือ
      **แก้งานหนึ่งครั้ง คะแนนที่ cache ไว้เข้าไม่ถึงอีกและไม่มีทางกวาด** เพราะ
      cascade ยิงเฉพาะตอนลบแถวใน `jobs` ส่วนงานที่แค่ถูกแก้ยังอยู่ `job_id` จึงยัง
      ถูกต้องแต่ hash ไม่ตรง — แถวนั้นอยู่ในสภาพ "ความสัมพันธ์ถูก แต่ไม่มีใครอ่านได้"
      **`updateJob` จึงต้องลบ `analyses where job_id = id` เองเมื่อ
      `requirementTextChanged`** ไม่งั้นทุกครั้งที่แก้งานจะทิ้งขยะเพิ่มถาวร
- [x] **ลบหลังบันทึกสำเร็จเท่านั้น** — ลบก่อนแล้วบันทึกล้ม = เสีย cache ฟรีทั้งที่งาน
      ยังเป็นข้อความเดิม และถ้าการลบล้มหลังบันทึกสำเร็จ **ห้ามโยน error**
      งานถูกบันทึกแล้วจริง บอกผู้ใช้ว่า "ล้มเหลว" ตอนนั้นจะผิด (เหตุผลเดียวกับ `logActivity`)
- [x] **`embedTextChanged` กับ `requirementTextChanged` ไม่ซ้ำซ้อนกัน อย่ายุบเป็นตัวเดียว**
      `category` อยู่ใน `buildJobEmbedText` แต่ไม่อยู่ใน `buildJobRequirementText`
      แก้หมวดงานจึงต้อง re-embed (เสียเงิน) แต่ cache คะแนนยังใช้ได้ มีเทสต์ดักไว้
      และพิสูจน์แล้วว่าจับได้จริงด้วยการยุบสองฟังก์ชันชั่วคราว
- [x] **`POST /api/jobs` เดิมมีแค่ `getSession()`** — `member` คนไหนก็สร้างงานได้
      ตอนนี้กั้น `data_manager` เท่ากับ PATCH/DELETE **เป็นการเปลี่ยนพฤติกรรมของของเดิม**
- [x] **PATCH ตัด `source`/`external_id` ทิ้งที่ route** ไม่ใช่แค่ไม่แสดงในฟอร์ม —
      body มาจาก client ที่เชื่อไม่ได้ และการเปลี่ยน `external_id` อาจชนกับ
      unique constraint `(source, external_id)` แล้วพังแบบอธิบายยาก
- [x] **กับดัก seed เขียนทับไม่มีจริงสำหรับงานที่สร้างจากหน้าเว็บ** — งานจากฟอร์มได้
      `source: 'manual'`, `external_id: null` ส่วน `seed-jobs.ts` upsert บน
      `(source, external_id)` ด้วย `source: 'synthetic'` เท่านั้น **ต่างจากกรณี
      `candidates` ที่ทุกแถวมาจากแหล่งภายนอก** เสี่ยงเฉพาะสี่งานจาก seed
      ซึ่งจัดการด้วยแถบเตือน ไม่ใช่การห้าม
- [x] แก้บั๊กพ่วง: `upsertJob` และ `matchCandidatesForJob` ไม่เช็ค `error`
- [x] **`scoreCandidateAgainst` เช็ค `error` ครบทั้งสามจุดแล้ว** (`lib/gemini/score.test.ts`)
      **อ่าน cache พังให้ log แล้วไปต่อ ไม่โยน** — คำนวณใหม่ยังได้คำตอบที่ถูก แค่แพงกว่า
      การทำให้ทั้งคำขอล้มเพราะ cache อ่านไม่ได้คือการทำให้แย่กว่าเดิม แต่ต้อง log
      ไม่งั้นจะเงียบสนิท เห็นแค่ค่า Gemini ที่สูงผิดปกติโดยไม่รู้สาเหตุ
      **อ่านผู้สมัครเปลี่ยนจาก `.single()` เป็น `.maybeSingle()`** เพราะ `.single()`
      คืน `data = null` ทั้งกรณี "ไม่มีแถว" และ "ฐานข้อมูลพัง" โค้ดเดิมจึงโยน
      `'candidate not found'` เหมือนกันทั้งคู่ และ route แปลงข้อความนั้นเป็น **404** —
      **ฐานข้อมูลล่มแล้วผู้ใช้เห็นว่า "ไม่พบผู้สมัครคนนี้"** แล้วไปตามหาสาเหตุผิดที่
      `.maybeSingle()` คืน `error = null` เมื่อไม่มีแถว จึงแยกสองกรณีได้:
      error → `'candidate read failed'` (500) · `!c` → `'candidate not found'` (404)
      **เขียน cache ล้มไม่โยน** — คะแนนคำนวณเสร็จและถูกต้องแล้ว
      เทสต์ mock supabase client แบบต่อลูกโซ่เพื่อทดสอบ "ทางที่พัง" ซึ่ง integration
      test ทำไม่ได้เพราะฐานจริงไม่ล่มตามสั่ง พิสูจน์แล้วด้วยการถอดการเช็คออกชั่วคราว
- **ยังไม่มี:** ประวัติการแก้ไขงาน (`activity_log` ยังไม่มี `entity_type = 'job'`),
  การกู้คืนงานที่ลบไปแล้ว, การแก้เป็นชุด

### Not done / deliberately deferred
- Google sign-in — deferred from v2. Risk: an existing email/password user
  signing in with Google may get a NEW auth user (and so a new profile, role
  `member`, no access to their old shortlists) instead of a linked identity.
  Verify on a preview deploy before enabling.
- Invite-only membership (admin creates members, no public signup) — discussed,
  not specced. Note that deleting the `/signup` page does not close signups: the
  anon key is public, so `POST /auth/v1/signup` still works. The real switch is
  Supabase → Authentication → Providers → Email → "Allow new users to sign up".
- ~~`/api/ingest`'s 403 role gate has no test~~ — **ทำแล้ว** ดูหัวข้อถัดไป

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
- **Git writes DO work** (`git add`, `git commit`, `git restore`) — this was
  false when first written and cost a session one uncommitted task because an
  agent trusted this file over trying. Verify with a probe rather than assuming.
- **npm install does NOT work** (registry returns 403), and `node_modules` is
  installed from Windows, so anything needing a native binary fails on Linux:
  **`npx vitest` and `npm run build`** (rollup wants `@rollup/rollup-linux-x64-gnu`)
  and **`npx tsx`** (esbuild wants `@esbuild/linux-x64`). Run those on Windows.
- **`npx tsc --noEmit` DOES work** and is the strongest check available in a
  session. Baseline: **0 errors outside `*.test.ts`**; the ~500 errors inside
  test files are pre-existing (vitest globals are not in `tsconfig` `types`),
  so filter with `| grep -v "\.test\.ts"`.
- **No DNS to Supabase or Gemini** (both `EAI_AGAIN`) — no integration test and
  no script that calls either service can run from a session.

**Trap:** a failed git write leaves a stale zero-byte `.git/index.lock` that the
sandbox cannot delete. Every later git command on Windows then fails with
"Another git process seems to be running." Fix on Windows with
`Remove-Item .git\index.lock -Force`. Do not attempt git writes from a session —
hand the user the commands instead.

**Line endings:** the repo is checked out CRLF on Windows. Files rewritten from
the sandbox can come back LF, which shows up as a whole-file diff with no real
content change (`next-env.d.ts` is the usual victim). Check `git diff` before
staging and `git checkout --` anything that is pure line-ending churn.
