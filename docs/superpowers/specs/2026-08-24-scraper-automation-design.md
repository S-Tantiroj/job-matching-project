# v4 — Scraper automation: นำเข้าผู้สมัครอัตโนมัติทุกคืน

**เป้าหมาย:** ดึงข้อมูลผู้สมัครจาก PhantomBuster เข้าฐานข้อมูลอัตโนมัติทุกคืน โดยข้อมูลที่ครบถ้วนเข้า
`candidates` ทันที ข้อมูลที่ไม่ครบเข้าคิวให้ `data_manager` ตรวจ พร้อมกลไกตามรอยที่มาและการระงับ
ตามคำขอ (PDPA)

**สถาปัตยกรรมโดยรวม:** สคริปต์ `scripts/sync-phantombuster.ts` รันบน GitHub Actions ตามตารางเวลา
เรียกใช้ `parseLinkedInCsv` และ `upsertCandidate` ที่มีอยู่โดยตรง (ไม่ผ่าน HTTP จึงไม่มีเพดานเวลา)
คอลัมน์ `candidates.embed_hash` ทำให้ข้ามแถวที่ไม่มีอะไรเปลี่ยนได้โดยไม่ต้องเรียก Gemini —
เป็นสิ่งที่ทำให้การรันทุกคืนอยู่รอดได้บนโควตาจำกัด

**Stack:** Next.js 15, Supabase (Postgres + pgvector), Gemini (`gemini-embedding-001`),
GitHub Actions, plain CSS, Vitest — ไม่มี dependency ใหม่

---

## ขอบเขต

**อยู่ใน v4:**

1. Migration 013 — `ingest_runs`, `pending_candidates`, `suppressed_profiles`,
   `candidates.ingest_run_id`, `candidates.embed_hash`
2. เช็ครายชื่อระงับใน `upsertCandidate` และเขียน `embed_hash`
3. `fetchLatestCsv` — ชั้นเชื่อม PhantomBuster แยกไฟล์เดียว
4. `classifyRow` — ตัดสินว่าเข้า `candidates` เลยหรือเข้าคิว
5. `scripts/sync-phantombuster.ts` — throttle, retry, resume, dry-run, เพดานต่อรอบ
6. GitHub Actions workflow ตามตารางเวลา + กดรันเองได้
7. UI ใต้ `/import` — ประวัติการนำเข้า, คิวรอตรวจ, รายชื่อระงับ
8. ปุ่ม "ลบและห้ามนำเข้าอีก" บนหน้า `/candidates/[id]`

**ไม่อยู่ในขอบเขต:**

- เขียน scraper เอง (ใช้ PhantomBuster เป็นผู้ดึงข้อมูล)
- ระบบหมุนเงื่อนไขค้นหาอัตโนมัติ
- คิวอนุมัติเต็มรูปแบบสำหรับทุกแถว (ดูเหตุผลใน "การตัดสินใจที่สำคัญ")
- แจ้งเตือนผ่าน email/Slack เมื่อ run ล้ม (ใช้การแจ้งเตือนของ GitHub Actions ไปก่อน)
- ปุ่มแก้ไขข้อมูลในคิวก่อนอนุมัติ (อนุมัติหรือปฏิเสธเท่านั้น)

---

## Global Constraints

- ไม่เพิ่ม dependency ใหม่ ใช้ plain CSS และคลาสจาก `app/globals.css`
- **ทุกเส้นทาง ingest ต้องลงที่ `lib/ingest/upsert.ts`** ตามกติกาเดิมของโปรเจกต์ —
  การเช็ครายชื่อระงับจึงต้องอยู่ในนั้น ไม่ใช่กระจายตามผู้เรียก
- ไม่แตะ `lib/gemini/*`, `lib/search/*`, `lib/jobs/*`, `lib/candidates/*`, `lib/self/*`
- Migration เป็น additive ห้าม drop หรือ alter ตารางเดิม
- Embedding: `gemini-embedding-001`, 768 มิติ, taskType `RETRIEVAL_DOCUMENT`
- **ห้ามเรียก generation model** — ทั้งฟีเจอร์นี้ใช้แค่ embedding
- ข้อมูลใน `candidates` เป็นภาษาอังกฤษตามเดิม, ข้อความ UI เป็นภาษาไทย
- Server component ยังเป็น server, client component ยังเป็น client
- ห้ามแสดง error ดิบจาก Postgres, Gemini หรือ PhantomBuster ให้ผู้ใช้เห็น
- ทุกหน้าและ API ของฟีเจอร์นี้ gate ด้วย `hasRole(session.role, 'data_manager')`
  (member ไม่เห็น, admin เห็นเพราะลำดับชั้น)
- API route ใช้ service-role client ซึ่ง bypass RLS — การกรองในโค้ดคือกลไกป้องกันตัวจริง
- เทสต์เดิมทั้งหมดต้องยังเขียว

---

## 1. Data model — Migration 013

### `ingest_runs`

```sql
create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,          -- 'scheduled' | 'manual'
  source text not null,           -- 'phantombuster' | 'csv_upload'
  criteria jsonb,                 -- agent id / search URL ที่ใช้ดึง
  status text not null,           -- 'running' | 'success' | 'partial' | 'failed'
  imported int not null default 0,
  updated int not null default 0,
  pending int not null default 0,
  skipped_unchanged int not null default 0,
  skipped_suppressed int not null default 0,
  errors jsonb,
  started_at timestamptz default now(),
  finished_at timestamptz
);
```

`criteria` คือส่วนที่ตอบคำถาม PDPA ว่า "ข้อมูลนี้ได้มาจากไหน ด้วยเกณฑ์อะไร" ซึ่งตอบไม่ได้เลย
ในระบบปัจจุบัน

`skipped` แยกสองคอลัมน์โดยตั้งใจ — "ข้ามเพราะไม่มีอะไรเปลี่ยน" กับ "ข้ามเพราะถูกระงับ"
เป็นคนละเรื่องกันสิ้นเชิงตอนอ่านรายงาน

**การนำเข้าด้วยมือผ่าน `/import` ต้องสร้างแถว `ingest_runs` ด้วย** (`trigger: 'manual'`,
`source: 'csv_upload'`) เพื่อให้ทุกข้อมูลสืบย้อนได้ด้วยกลไกเดียวกัน ไม่ต้องมีธงแยกว่ามาจาก
automation หรือไม่ — `candidates.ingest_run_id` ชี้ไปที่ run ก็รู้ทันที

### `pending_candidates`

```sql
create table public.pending_candidates (
  id uuid primary key default gen_random_uuid(),
  ingest_run_id uuid references public.ingest_runs(id) on delete set null,
  linkedin_url text unique,
  full_name text not null,
  payload jsonb not null,         -- CandidateInput ทั้งก้อน พร้อมส่งเข้า upsertCandidate
  missing text[] not null,        -- เหตุที่ค้าง
  status text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create index pending_candidates_status_idx on public.pending_candidates (status);
```

`unique (linkedin_url)` ทำให้คืนถัดไปที่ดึงคนเดิมมาไม่สร้างแถวซ้ำในคิว

**เก็บ `payload` เป็น jsonb ทั้งก้อน** เพื่อให้ตอนอนุมัติเรียก `upsertCandidate(payload)` ได้ตรงๆ
ไม่ต้องประกอบข้อมูลใหม่ ซึ่งจะเป็นการเขียนตรรกะซ้ำและเสี่ยงหลุด

### `suppressed_profiles`

```sql
create table public.suppressed_profiles (
  id uuid primary key default gen_random_uuid(),
  linkedin_url text not null unique,
  full_name text,
  reason text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
```

เก็บ `linkedin_url` เป็นข้อความตรงๆ ซึ่งดูขัดกับหลักลดข้อมูล แต่เป็นการเก็บขั้นต่ำที่จำเป็น
**เพื่อคุ้มครองบุคคลนั้นเอง** และทำให้ตรวจสอบได้ ทางที่เข้มกว่าคือเก็บเป็น hash — ไม่ทำในเฟสนี้

### เพิ่มคอลัมน์บน `candidates`

```sql
alter table public.candidates add column if not exists ingest_run_id uuid
  references public.ingest_runs(id) on delete set null;
alter table public.candidates add column if not exists embed_hash text;
create index if not exists candidates_embed_hash_idx on public.candidates (embed_hash);
```

### RLS

ทั้งสามตารางใหม่เปิด RLS และ**ไม่สร้าง policy ใดๆ** — เข้าถึงได้เฉพาะผ่าน service-role client
ในโค้ดฝั่ง server ซึ่ง gate ด้วย role อยู่แล้ว ไม่มีเส้นทางที่ anon key ควรแตะข้อมูลเหล่านี้

> รูปแบบนี้ตรงกับ `analyses`, `education`, `experience` ที่มีอยู่ (RLS เปิด ไม่มี policy)
> Supabase advisor จะขึ้น INFO `rls_enabled_no_policy` ซึ่งเป็นพฤติกรรมที่ตั้งใจ ไม่ใช่ข้อบกพร่อง

---

## 2. `embed_hash` — กลไกที่ทำให้ฟีเจอร์นี้อยู่รอด

### ปัญหา

`upsertCandidate` เรียก `embedText` **เป็นบรรทัดแรกสุด ก่อนจะเช็คว่าแถวนั้นมีอยู่แล้วหรือยัง**
(`lib/ingest/upsert.ts:11`)

คืนที่สองที่ดึง search เดิมจะได้คน 500 คนเดิม ทั้ง 500 คนถูก embed ใหม่หมด ทั้งที่อาจมีคนใหม่
จริงแค่ 20 คน — เผาโควตา 480 ครั้งเพื่อเขียนข้อมูลที่เหมือนเดิม ที่ปริมาณเป้าหมายและเพดาน
ของ free tier นี่คือความต่างระหว่างฟีเจอร์ที่ใช้ได้กับใช้ไม่ได้

### วิธีแก้

ไฟล์ใหม่ `lib/ingest/embedHash.ts`:

```ts
export function embedHash(input: CandidateInput): string
```

คืน sha256 ของ `buildEmbedText(input)` — ใช้รูปแบบเดียวกับ `requirementHash` ใน
`lib/gemini/cache.ts` ที่มีอยู่

**`upsertCandidate` เขียนค่านี้ลงคอลัมน์ `embed_hash` ทุกครั้งที่ embed**

**สคริปต์ตัดสินก่อนเรียก Gemini:**

```
hash ของ payload ใหม่ == embed_hash ที่เก็บไว้  →  ข้าม ไม่ embed ไม่เขียน
ต่างกัน หรือยังไม่มีแถวนี้                      →  ส่งเข้า upsertCandidate
```

เป็นหลักการเดียวกับที่ v2 ใช้ตัดสิน re-embed (`buildEmbedText(before) !== buildEmbedText(after)`)
แต่ย้ายมาตัดสินได้โดย**ไม่ต้องดึงข้อมูลลูกมาประกอบ** ซึ่งสำคัญเมื่อต้องทำหลายร้อยรอบ

### ผลพลอยได้: resume ได้เองโดยไม่ต้องจดตำแหน่ง

ถ้า run ล้มกลางทางที่คนที่ 300 จาก 500 รอบถัดไปจะข้าม 300 คนแรกอัตโนมัติเพราะ hash ตรง
**สคริปต์จึง idempotent โดยธรรมชาติ** รันซ้ำกี่ครั้งก็ไม่เสียโควตาซ้ำ และไม่ต้องมีตาราง
checkpoint หรือกลไกจดความคืบหน้าใดๆ

---

## 3. รายชื่อระงับ (PDPA)

### เช็คที่ไหน

**ใน `upsertCandidate` ก่อนเรียก `embedText`** — ไม่ใช่ในสคริปต์

เหตุผล: ถ้าเช็คแค่ในสคริปต์ วันที่ใครเอา CSV ชุดเดิมมาวางที่ `/import` ด้วยมือ คนที่ขอให้ลบ
จะกลับเข้ามาใหม่ กติกาของโปรเจกต์เขียนไว้ว่าทุกเส้นทาง ingest ลงที่ไฟล์นี้ การป้องกันจึงต้อง
อยู่จุดเดียวกัน

เช็ค**ก่อน** embed เพื่อไม่เสียโควตากับคนที่จะไม่ถูกเขียนอยู่แล้ว

### พฤติกรรม

`upsertCandidate` คืนค่าเพิ่มสถานะ `suppressed` — ผู้เรียกนับเข้า `skipped_suppressed`
ไม่ใช่ throw error เพราะการข้ามคนที่ขอให้ลบคือพฤติกรรมที่ถูกต้อง ไม่ใช่ความผิดพลาด

### ลายเซ็นใหม่ของ `upsertCandidate`

ปัจจุบันคือ `upsertCandidate(input: CandidateInput, createdBy: string | null = null)`
คืน `{ id, updated }`

เปลี่ยนเป็น:

```ts
export async function upsertCandidate(
  input: CandidateInput,
  createdBy: string | null = null,
  ingestRunId: string | null = null
): Promise<{ id: string | null; updated: boolean; suppressed: boolean }>
```

**พารามิเตอร์ที่สามเป็น optional และมีค่าเริ่มต้น** เพื่อให้ผู้เรียกเดิมทั้งหมด
(`/api/ingest`, `scripts/seed-synthetic.ts`) ยังทำงานได้โดยไม่ต้องแก้ — เป็นการเปลี่ยนแบบ
เพิ่มเติม ไม่ใช่การเปลี่ยนสัญญา

`id` เป็น `null` เมื่อ `suppressed` เป็น `true` เพราะไม่มีแถวถูกเขียน ผู้เรียกต้องเช็ค
`suppressed` ก่อนใช้ `id`

### การลบตามคำขอเป็นการกระทำเดียว

`POST /api/candidates/[id]/suppress` ลบแถวใน `candidates` **และ** เพิ่มเข้า `suppressed_profiles`
ในคำขอเดียว

**ห้ามแยกเป็นสองขั้น** — ถ้ามีใครทำครึ่งเดียว (ลบแต่ไม่ระงับ) คืนถัดไป cron จะพาคนนั้นกลับมา
ทำให้การใช้สิทธิ์ของเจ้าของข้อมูลไร้ผล

ถ้าผู้สมัครไม่มี `linkedin_url` จะระงับไม่ได้ (ไม่มี key ให้จำ) — ต้องตอบ 400 พร้อมข้อความ
ภาษาไทยที่อธิบายว่าลบได้แต่ป้องกันการนำเข้าซ้ำไม่ได้ ให้ผู้ใช้ตัดสินใจเอง

---

## 4. การคัดกรอง — `classifyRow`

ไฟล์ใหม่ `lib/ingest/classify.ts`:

```ts
export type MissingField = 'headline' | 'experience' | 'linkedin_url' | 'education'
export function classifyRow(input: CandidateInput): MissingField[]
```

คืน array ว่าง = ครบ เข้า `candidates` เลย · คืนไม่ว่าง = เข้าคิว

**เกณฑ์ทั้งสี่ อ้างอิงจากฟิลด์ที่ `parseLinkedInCsv` ให้จริง:**

| ขาดอะไร | ผลถ้าปล่อยเข้า |
|---|---|
| `headline` | ข้อความสำหรับ embed น้อยเกินไป ค้นหาเจอยาก |
| `experience` ว่าง | `computeYearsExperience` ได้ 0 → หลุดจากตัวกรองประสบการณ์ทุกครั้ง |
| `linkedin_url` | **ไม่มี dedup key** — dedup จะตกไปใช้ชื่อแทน ซึ่งชนคนชื่อซ้ำได้ |
| `education` ว่าง | ยืนยันเงื่อนไข "จบจากต่างประเทศ" ไม่ได้ ซึ่งเป็นแกนของแพลตฟอร์ม |

`full_name` ไม่ต้องเช็ค — `parseLinkedInCsv` ทิ้งแถวที่ไม่มีชื่อไปแล้ว (`lib/ingest/linkedin.ts:30`)

`linkedin_url` เป็นเกณฑ์ที่ร้ายแรงที่สุด เพราะ dedup ของ scraper อาศัยคอลัมน์นี้ตาม migration 008

---

## 5. ชั้นเชื่อม PhantomBuster

ไฟล์ใหม่ `lib/ingest/phantombuster.ts`:

```ts
export async function fetchLatestCsv(agentId: string): Promise<string>
```

คืน CSV เป็นข้อความ ส่งต่อให้ `parseLinkedInCsv` ตัวเดิม

> **ส่วนนี้ยังไม่ได้ยืนยันกับ API จริง** — ขณะเขียน spec นี้ยังไม่มีบัญชี PhantomBuster
> รูปร่าง endpoint และ response ที่แท้จริงต้องตรวจสอบกับเอกสารของผู้ให้บริการก่อน implement
> ผมแยกเป็นฟังก์ชันเดียวโดยตั้งใจ เพื่อให้เมื่อพบว่าจริงๆ มันคืนอะไร **แก้ไฟล์เดียวจบ**
> ไม่กระทบส่วนอื่น

อ่านค่าจาก env: `PHANTOMBUSTER_API_KEY`, `PHANTOMBUSTER_AGENT_ID`

---

## 6. สคริปต์ `scripts/sync-phantombuster.ts`

รันด้วย `npx tsx` — pattern เดียวกับ `scripts/seed-synthetic.ts` และ `scripts/seed-jobs.ts` ที่มีอยู่

### ลำดับการทำงาน

1. สร้างแถว `ingest_runs` สถานะ `running` พร้อม `criteria`
2. `fetchLatestCsv()` → `parseLinkedInCsv()` → ได้ `CandidateInput[]`
3. ตัดที่ `MAX_ROWS_PER_RUN` ถ้าเกิน (บันทึกว่าถูกตัด)
4. วนทีละแถว:
   - `classifyRow()` → ถ้าไม่ครบ ใส่ `pending_candidates` (upsert บน `linkedin_url`) นับ `pending`
   - ถ้าครบ: เทียบ `embedHash(input)` กับ `embed_hash` ที่เก็บไว้ (ค้นด้วย `linkedin_url`)
     - ตรง → นับ `skipped_unchanged` ไปแถวถัดไป **ไม่เรียก Gemini**
     - ไม่ตรง → `upsertCandidate(input, null, runId)` นับ `imported`/`updated`/`skipped_suppressed`
   - หน่วงตาม `EMBED_DELAY_MS` ก่อนแถวถัดไป
5. ปิด run ด้วยสถานะและตัวนับ

### สองกรณีที่ต้องระบุให้ชัด

**แถวที่ครบต้องมี `linkedin_url` เสมอ** เพราะ `classifyRow` ส่งแถวที่ไม่มีเข้าคิวไปแล้ว
การค้นหา `embed_hash` ด้วย `linkedin_url` จึงปลอดภัยเสมอในเส้นทางนี้ ไม่ต้องเผื่อกรณี null

**คนที่เคยเข้าคิว แล้วรอบต่อมามีข้อมูลครบ** — เกิดได้จริงเมื่อ PhantomBuster ดึงข้อมูล
ได้สมบูรณ์ขึ้นในรอบหลัง สคริปต์ต้อง:

1. เขียนเข้า `candidates` ตามปกติ (เพราะตอนนี้ครบแล้ว)
2. **ลบแถวเดิมออกจาก `pending_candidates`** เพราะไม่มีอะไรให้ตรวจอีกแล้ว

ถ้าไม่ลบ คิวจะสะสมแถวที่แก้ตัวเองไปแล้ว และคนตรวจจะเสียเวลากับรายการที่เข้าระบบไปแล้ว —
ซึ่งจะทำให้คิวสูญเสียความน่าเชื่อถือไปเรื่อยๆ

### ตัวแปรควบคุมจาก env

| ตัวแปร | ค่าเริ่มต้น | ทำอะไร |
|---|---|---|
| `MAX_ROWS_PER_RUN` | 600 | เพดานต่อรอบ |
| `EMBED_DELAY_MS` | 1200 | หน่วงระหว่างการ embed |
| `MAX_RETRIES` | 3 | จำนวนครั้งที่ลองใหม่เมื่อโดน 429/503 |

**เพดานต่อรอบเป็นความเสี่ยงจริง ไม่ใช่สมมติ** — search URL ที่กว้างเกินไปครั้งเดียวอาจคืนมา
หลายหมื่นแถว แล้วเผาโควตาจนหมดพร้อมกับเติมฐานข้อมูลด้วยข้อมูลที่ไม่ต้องการ

### โหมด `--dry-run`

ดึงจริง แยกแยะจริง รายงานว่า**จะ**เพิ่ม/อัปเดต/เข้าคิว/ข้ามกี่รายการ **แต่ไม่เขียนอะไรเลย**
ไม่สร้างแถว `ingest_runs` ด้วย

รอบแรกที่ต่อกับ PhantomBuster ต้องรันโหมดนี้ก่อนเสมอ เพื่อดูว่า search ที่ตั้งไว้ให้คนตรงกลุ่ม
เป้าหมายจริงไหม ก่อนที่ข้อมูลหลายร้อยแถวจะลงฐานข้อมูล

---

## 7. ตารางเวลา — GitHub Actions

ไฟล์ `.github/workflows/sync-candidates.yml`

```yaml
on:
  schedule:
    - cron: '0 19 * * *'      # 02:00 ตามเวลาไทยของวันถัดไป (GitHub ใช้ UTC)
  workflow_dispatch:
concurrency:
  group: sync-candidates
  cancel-in-progress: false
```

**cron ของ GitHub Actions เป็น UTC ไม่ใช่เวลาไทย** — `0 2 * * *` จะได้ 09:00 เช้าตามเวลาไทย
ซึ่งไม่ใช่ "ทุกคืน" ต้องมีคอมเมนต์กำกับในไฟล์

**`workflow_dispatch` เป็นเครื่องมือทดสอบหลัก** ไม่ใช่ของแถม — รอบแรกๆ ต้องลองและปรับหลายครั้ง
การรอถึงตี 2 ทุกครั้งเป็นไปไม่ได้

**`concurrency`** กันสองรอบทับกันเมื่อรอบก่อนโดน throttle จนยาวข้ามไปถึงรอบถัดไป

### Secret ที่ต้องตั้งใน GitHub

`NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `GEMINI_API_KEY` ·
`PHANTOMBUSTER_API_KEY` · `PHANTOMBUSTER_AGENT_ID`

> `SUPABASE_SERVICE_ROLE_KEY` **bypass RLS ทั้งหมด** — ใครที่แก้ workflow ในรีโปได้
> ก็เขียน job ที่อ่านหรือลบข้อมูลทั้งฐานได้ ถ้ารีโปเป็น public ต้องมั่นใจว่า PR จากภายนอก
> แก้ไฟล์ workflow ไม่ได้โดยไม่ผ่านการรีวิว

---

## 8. UI

ทุกหน้า gate ด้วย `hasRole(session.role, 'data_manager')` — member ไม่เห็น admin เห็น

### `/import` — ศูนย์รวมงานนำเข้า (แก้ไขหน้าเดิม)

ฟอร์มวาง CSV ด้วยมือที่มีอยู่ (ตอนนี้ต้องสร้างแถว `ingest_runs` ด้วย) ·
ตารางประวัติ 20 รอบล่าสุด (เวลา · ทริกเกอร์ · เพิ่ม/อัปเดต/เข้าคิว/ข้าม · สถานะ) ·
ลิงก์ไป `/import/pending` และ `/import/suppressed`

การมีประวัติที่นี่ทำให้**ไม่ต้องเข้า GitHub ไปอ่าน log** เพื่อรู้ว่าเมื่อคืนเกิดอะไรขึ้น

### `/import/pending` — คิวรอตรวจ

แต่ละแถว: ชื่อ · headline · ลิงก์ LinkedIn (เปิดแท็บใหม่) · **badge บอกว่าขาดอะไร** ·
ปุ่มอนุมัติ · checkbox สำหรับปฏิเสธเป็นกลุ่ม

**การแสดงเหตุที่ค้างสำคัญมาก** — คนตรวจตัดสินได้ในไม่กี่วินาทีว่า "ขาด education แต่เป็น CEO
ที่รู้จัก อนุมัติ" หรือ "ขาดทุกอย่าง ปฏิเสธ" ถ้าไม่บอกเหตุ ต้องไปเปิด LinkedIn ทีละคน

**อนุมัติทีละคน แต่ปฏิเสธเป็นกลุ่มได้ — ความไม่สมมาตรนี้ตั้งใจ**

การปฏิเสธไม่เพิ่มข้อมูลเข้าระบบ จึงปลอดภัยที่จะทำเป็นกลุ่ม ส่วนการอนุมัติคือการเอาข้อมูลเข้าให้
recruiter ค้นเจอ ถ้ามีปุ่ม "อนุมัติทั้งหมด" คิวนี้จะกลายเป็นตราประทับเปล่า ซึ่งเป็นสิ่งที่เรา
หลบมาตั้งแต่ตอนเลือกไม่ทำคิวเต็มรูปแบบ

### `/import/suppressed` — รายชื่อระงับ

รายการ + เหตุผล + วันที่ + ผู้เพิ่ม พร้อมปุ่มถอนออก (เผื่อเพิ่มผิด)

### ปุ่มบนหน้า `/candidates/[id]` (แก้ไขหน้าเดิม)

ปุ่ม "ลบและห้ามนำเข้าอีก" สีเตือน พร้อมกล่องยืนยันที่ให้กรอกเหตุผลสั้นๆ

เหตุผลถูกเก็บไว้เป็นหลักฐานว่าลบเพราะอะไร ซึ่งเป็นสิ่งที่ต้องมีเมื่อมีการใช้สิทธิ์ตาม PDPA

### Nav

**ไม่เพิ่มลิงก์ใหม่** — เข้าถึงทุกอย่างผ่าน `/import` ที่มีลิงก์อยู่แล้ว กัน nav บวม

---

## 9. API routes

| Route | ทำอะไร |
|---|---|
| `POST /api/pending/[id]/approve` | เรียก `upsertCandidate(payload)` แล้วตั้ง status `approved` |
| `POST /api/pending/reject` | body `{ ids: string[] }` ตั้ง status `rejected` เป็นกลุ่ม |
| `POST /api/candidates/[id]/suppress` | ลบจาก `candidates` + เพิ่มเข้า `suppressed_profiles` |
| `DELETE /api/suppressed/[id]` | ถอนออกจากรายชื่อระงับ |

ทุก route ตรวจ session แล้ว `hasRole(session.role, 'data_manager')` → ไม่ผ่านตอบ 403

### ข้อความ error

| กรณี | status | ข้อความ |
|---|---|---|
| ไม่ได้ล็อกอิน | 401 | กรุณาเข้าสู่ระบบใหม่ |
| ไม่มีสิทธิ์ | 403 | คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล |
| ไม่พบรายการ | 404 | ไม่พบรายการนี้ |
| ผู้สมัครไม่มี linkedin_url ตอนสั่งระงับ | 400 | ผู้สมัครนี้ไม่มี LinkedIn URL จึงป้องกันการนำเข้าซ้ำไม่ได้ |
| อนุมัติแล้วแต่คนนั้นอยู่ในรายชื่อระงับ | 409 | ผู้สมัครนี้อยู่ในรายชื่อระงับ ไม่สามารถนำเข้าได้ |
| Gemini ล้มตอนอนุมัติ | 502 | ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่ |
| อื่นๆ | 500 | เกิดข้อผิดพลาด กรุณาลองใหม่ |

---

## 10. Error handling ในสคริปต์

ต่างจาก API route ตรงที่**ไม่มีคนนั่งดูตอนตี 2** จึงต้อง log ให้ครบและปิด run ด้วยสถานะที่ถูกต้อง

| เกิดอะไร | ทำอะไร |
|---|---|
| PhantomBuster ตอบ error / ไม่มีผลลัพธ์ | ปิด run เป็น `failed` ไม่แตะ DB |
| CSV parse ไม่ได้เลย | `failed` |
| แถวเดี่ยวพัง | เก็บเข้า `errors` แล้วไปแถวถัดไป **ไม่ล้มทั้งรอบเพราะคนเดียว** |
| 429/503 จาก Gemini | backoff แล้วลองใหม่ ถ้ายังไม่ได้ → ปิดเป็น `partial` |
| ชนเพดาน `MAX_ROWS_PER_RUN` | จบเป็น `partial` พร้อมบันทึกว่าถูกตัดที่เท่าไร |
| สคริปต์ล้มแบบไม่คาดคิด | แถวค้างที่ `running` — รอบถัดไปเห็นแล้วปิดเป็น `failed` ให้ |

**`partial` ไม่ใช่ความล้มเหลว** เป็นสถานะปกติที่คาดไว้ เพราะกลไก `embed_hash` ทำให้รอบถัดไป
ทำต่อได้เองโดยไม่ซ้ำ

---

## 11. Testing

Unit test เฉพาะตรรกะบริสุทธิ์ที่รันออฟไลน์ได้:

| ไฟล์เทสต์ | ครอบคลุม |
|---|---|
| `lib/ingest/classify.test.ts` | ครบทุกอย่าง → array ว่าง · ขาดทีละอย่างทั้งสี่เกณฑ์ · ขาดหลายอย่างพร้อมกัน · `experience: []` ต้องนับว่าขาด |
| `lib/ingest/embedHash.test.ts` | input เดิมได้ hash เดิม · headline เปลี่ยนแล้ว hash เปลี่ยน · ข้อมูลลูก (skills/education/experience) เปลี่ยนแล้ว hash เปลี่ยน · ฟิลด์ที่ไม่อยู่ใน `buildEmbedText` (location, linkedin_url) เปลี่ยนแล้ว hash **ต้องเท่าเดิม** |

เคสสุดท้ายสำคัญ — ถ้า hash เปลี่ยนตาม `location` ด้วย ระบบจะ re-embed คนที่ย้ายที่อยู่โดยไม่จำเป็น

**ไม่เขียน integration test ใหม่** — เทสต์ที่ยิง Gemini/Supabase จริงในโปรเจกต์นี้ล้มด้วยเหตุผล
ภายนอกหลายครั้งแล้ว การเพิ่มอีกไม่ช่วยอะไร

**ทดสอบด้วยมือ** ที่ `docs/manual-tests/scraper-automation.md`:

1. `--dry-run` ก่อนของจริง — ตรวจว่าคนที่ได้ตรงกลุ่มเป้าหมาย
2. รันจริงหนึ่งรอบ — ตรวจ `ingest_runs` และจำนวนแถวใน `candidates`/`pending_candidates`
3. **รันซ้ำทันที — ทุกแถวต้องถูกข้าม (`skipped_unchanged` = จำนวนทั้งหมด) และ `imported` = 0**
4. เพิ่มคนหนึ่งเข้ารายชื่อระงับ แล้วรันซ้ำ — คนนั้นต้องไม่กลับเข้ามา นับใน `skipped_suppressed`
5. อนุมัติแถวในคิว — ต้องปรากฏใน `/search`
6. ปฏิเสธแถวในคิว — ต้องไม่เข้า `candidates`
7. กด "ลบและห้ามนำเข้าอีก" แล้วรันซ้ำ — คนนั้นต้องไม่กลับมา

**ข้อ 3 สำคัญที่สุดในชุด** — ถ้าไม่ผ่าน แปลว่าทุกคืนจะเผาโควตาซ้ำทั้งหมดและฟีเจอร์ใช้จริงไม่ได้

---

## 12. ปริมาณที่รองรับ และเพดานที่ต้องรู้

**ออกแบบโดยตั้งสมมติฐานที่ 1,000–2,000 คนใหม่ต่อเดือน** (~33–66 คน/วัน) ซึ่งปลอดภัยทุกชั้น

**การขยายไม่ต้องแก้ design** — ปรับที่ `MAX_ROWS_PER_RUN` และความถี่ของ cron เท่านั้น
แต่มีสามอย่างภายนอกที่จะพังก่อนโค้ดเรา:

**1. ความปลอดภัยของบัญชี LinkedIn — เพดานจริง** การเปิดดู 300+ โปรไฟล์ต่อวันติดกันเป็นสัญญาณ
ชัดเจนของ automation และเสี่ยงถูกจำกัดหรือระงับบัญชี ตัวเลขที่แน่นอนไม่มีใครประกาศ แต่ระดับ
หลักร้อยปลายต่อวันต่อบัญชีอยู่ในโซนเสี่ยง

**2. ต้นทุน PhantomBuster** คิดตามเวลาประมวลผล ที่ 333 คน/วัน ≈ 60–90 ชั่วโมง/เดือน
ซึ่งเกินแผนระดับเริ่มต้นไปมาก

**3. พื้นที่ Supabase** แต่ละแถวมี `embedding vector(768)` (~3KB) บวก `raw_data` jsonb
รวมราว 5–10KB → 10,000 แถว/เดือน ≈ 1GB/ปี **เกิน free tier (500MB)** และ index
`ivfflat ... lists = 100` ใน migration 001 มีคอมเมนต์ว่าจูนสำหรับ "thousands–tens of thousands"
ที่หลักแสนต้องจูนใหม่

**อีกเรื่องที่สำคัญกว่าจำนวน:** search เดิมที่รันทุกคืนจะไม่ให้คนใหม่ เพราะ LinkedIn คืนผล
ต่อการค้นหาหนึ่งครั้งจำกัด การได้คนใหม่ต่อเนื่องต้องมีการหมุนเงื่อนไขค้นหา ซึ่งไม่อยู่ในขอบเขต
เฟสนี้ — และกลุ่มเป้าหมาย (C-level จบต่างประเทศในไทย) เป็นกลุ่มที่เล็กโดยธรรมชาติ การตั้งเป้า
สูงเกินไปจะบังคับให้ขยายเกณฑ์จนได้คนไม่ตรงกลุ่ม แล้วฐานข้อมูลเจือจางลงแทนที่จะดีขึ้น

---

## 13. ความเสี่ยงที่ต้องรับทราบ

**ยังไม่มีบัญชี PhantomBuster** — ดีไซน์นี้ผูกกับบริการที่ยังไม่ได้สมัคร ต้นทุนและรูปร่าง API
จริงต้องยืนยันก่อน implement ส่วน `fetchLatestCsv` ถูกแยกไว้เพื่อรองรับการแก้เมื่อพบความจริง

**ToS ของ LinkedIn** ห้าม automated scraping ชัดเจน การใช้ PhantomBuster เป็นตัวกลาง
ย้ายภาระไปที่ผู้ให้บริการ แต่ไม่ได้ทำให้บัญชีที่ใช้ดึงข้อมูลปลอดจากการถูกจำกัด

**PDPA** — การเก็บอัตโนมัติต่อเนื่องต่างจากการเก็บเป็นครั้งคราวในแง่ฐานทางกฎหมาย
เฟสนี้ออกแบบรองรับสองอย่างที่จำเป็น: **การตามรอยที่มา** (`ingest_runs.criteria`) และ
**การใช้สิทธิ์ขอลบที่มีผลจริง** (suppression list ที่กันการนำเข้าซ้ำ) แต่ไม่ครอบคลุมเรื่องอื่น
เช่น การแจ้งเจ้าของข้อมูล หรือการกำหนดระยะเวลาเก็บรักษา ซึ่งเป็นเรื่องนโยบายมากกว่าเรื่องโค้ด

---

## สรุปไฟล์

**สร้างใหม่:**

- `supabase/migrations/013_ingest_automation.sql`
- `lib/ingest/embedHash.ts` (+ test), `lib/ingest/classify.ts` (+ test)
- `lib/ingest/phantombuster.ts`
- `scripts/sync-phantombuster.ts`
- `.github/workflows/sync-candidates.yml`
- `app/(app)/import/pending/page.tsx`, `app/(app)/import/suppressed/page.tsx`
- `components/PendingReviewTable.tsx`, `components/SuppressedList.tsx`, `components/SuppressButton.tsx`
- `app/api/pending/[id]/approve/route.ts`, `app/api/pending/reject/route.ts`
- `app/api/candidates/[id]/suppress/route.ts`, `app/api/suppressed/[id]/route.ts`
- `docs/manual-tests/scraper-automation.md`

**แก้ไข:**

- `lib/ingest/upsert.ts` — เช็ค suppression ก่อน embed, เขียน `embed_hash`, รับ `ingest_run_id`
- `app/api/ingest/route.ts` — สร้างแถว `ingest_runs` สำหรับการนำเข้าด้วยมือ
- `app/(app)/import/page.tsx` — ตารางประวัติ + ลิงก์
- `app/(app)/candidates/[id]/page.tsx` — ปุ่มลบและระงับ
- `CLAUDE.md` — Phase 8

---

## ลำดับการทำ

1. Migration 013
2. `embedHash` + `classify` (ฟังก์ชันบริสุทธิ์ + เทสต์ — ทำเมื่อไหร่ก็ได้)
3. แก้ `upsertCandidate` (suppression + embed_hash)
4. `fetchLatestCsv` + สคริปต์ sync
5. GitHub Actions workflow
6. API routes
7. UI

ข้อ 1 ต้องมาก่อนเสมอ ข้อ 3 ต้องมาก่อนข้อ 4
