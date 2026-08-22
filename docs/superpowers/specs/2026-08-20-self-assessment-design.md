# v3 — Self-assessment: อัปโหลด resume PDF แล้วให้ AI ประเมินความเหมาะสม

**เป้าหมาย:** ให้ผู้ใช้ที่ล็อกอินอยู่ อัปโหลด resume เป็น PDF แล้วได้ผลประเมินตัวเอง —
จุดแข็ง/จุดอ่อน/สิ่งที่ควรพัฒนา, รายการงานในระบบที่เหมาะเรียงตามลำดับ, และคะแนน 0–100
เทียบกับตำแหน่งที่ผู้ใช้พิมพ์เอง

**สถาปัตยกรรมโดยรวม:** PDF ส่งเข้า Gemini โดยตรงเป็น inline data (ไม่มีไลบรารีอ่าน PDF)
ได้โปรไฟล์เชิงโครงสร้าง เก็บในตาราง `self_profiles` ที่ผู้ใช้เป็นเจ้าของและไม่ปนกับ
candidate pool การจัดอันดับงานใช้ vector ในสเปซ 768 มิติร่วมกับ `jobs` ส่วน LLM เรียก
เฉพาะตอนอัปโหลด (บทวิเคราะห์) และตอนผู้ใช้ขอคะแนนรายตำแหน่ง (มี cache)

**Stack:** Next.js 15 (App Router), Supabase, Gemini (`gemini-flash-latest`,
`gemini-embedding-001`), plain CSS, Vitest — ไม่มี dependency ใหม่

---

## ขอบเขต

**อยู่ใน v3:**

1. ปรับ schema — drop `resumes`/`matches` ที่กำพร้า สร้าง `self_profiles` และ
   `resume_assessments`
2. อ่าน PDF ด้วย Gemini → โปรไฟล์เชิงโครงสร้าง + บทวิเคราะห์ภาษาไทย
3. API อัปโหลดและประเมิน
4. RPC `match_jobs` + การจัดอันดับงานจากโปรไฟล์
5. คะแนนรายตำแหน่งที่ผู้ใช้พิมพ์ พร้อม cache
6. หน้า `/self-assessment` + ลิงก์ใน nav

**ไม่อยู่ในขอบเขต:**

- เก็บไฟล์ PDF (เก็บเฉพาะข้อความและโครงสร้างที่แกะได้)
- แก้ไขโปรไฟล์ที่ AI แกะมาด้วยมือ
- แชร์ผลประเมินให้ recruiter ดู
- เปรียบเทียบผลประเมินย้อนหลัง
- รับไฟล์ CSV (PDF อย่างเดียว)
- ให้ผู้ใช้ที่ไม่ได้ล็อกอินใช้งาน

---

## Global Constraints

- ไม่เพิ่ม dependency ใหม่ ใช้ plain CSS และคลาสจาก `app/globals.css`
- ไม่แตะตรรกะ search / ingest / scoring / dedup ที่มีอยู่ และไม่แก้
  `lib/ingest/normalize.ts`, `lib/ingest/upsert.ts`, `lib/gemini/analyze.ts`
- ข้อมูลที่ผู้ใช้อัปโหลด **ห้ามเข้า `candidates`** และห้ามปรากฏในผลค้นหาของ recruiter
- **ไฟล์ PDF ที่อัปโหลดเป็นภาษาอะไรก็ได้** — ไทย อังกฤษ หรือปนกัน ไม่มีการจำกัดภาษา
  ของไฟล์ต้นทาง และห้ามเพิ่มการตรวจภาษาใดๆ ตอนอัปโหลด
- โปรไฟล์เชิงโครงสร้างที่ **เก็บลงฐานข้อมูล** ต้องเป็น **ภาษาอังกฤษ** — prompt ของ
  `parsePdfProfile` สั่งให้ Gemini แปลหรือถอดเป็นอักษรโรมันให้ (เช่น ชื่อไทย →
  "Somchai Jaidee") แบบเดียวกับที่ `lib/gemini/parse.ts` ทำอยู่แล้ว

  > เหตุผล **ต่างจาก**กติกาของตาราง `candidates` ซึ่งเป็นเรื่องความสม่ำเสมอกับข้อมูล
  > LinkedIn ที่ scrape มา — `self_profiles` เป็นตารางแยกจึงใช้เหตุผลนั้นไม่ได้
  > เหตุผลจริงคือ **embedding ต้องอยู่ในสเปซเดียวกับ `jobs` ซึ่งเก็บเป็นภาษาอังกฤษ**
  > ถ้า embed จากข้อความไทยขณะที่ประกาศงานเป็นอังกฤษ ความใกล้เคียงเชิงความหมายจะเพี้ยน
  > และการจัดอันดับงานจะผิดตั้งแต่ต้นทางโดยไม่มีสัญญาณเตือน

- `raw_text` เก็บข้อความ **ตามต้นฉบับ** ไม่ต้องแปล (ใช้อ้างอิงย้อนหลัง)
- บทวิเคราะห์ เหตุผล และข้อความ UI ทั้งหมดเป็น **ภาษาไทย**
- คะแนนเป็นจำนวนเต็ม 0–100 ทุกที่
- Embedding ต้องเป็น `gemini-embedding-001` ขนาด 768 มิติ taskType
  `RETRIEVAL_DOCUMENT` — สเปซเดียวกับ `jobs` และ `candidates`
- Generation ใช้ `gemini-flash-latest`
- Server component ยังเป็น server, client component ยังเป็น client
- ห้ามแสดง error ดิบจาก Postgres หรือ Gemini ให้ผู้ใช้เห็น
- เทสต์เดิมทั้งหมดต้องยังเขียว
- Gemini free tier — ห้ามเรียก generation ต่อรายการงาน

---

## 1. Data model

### Migration `011_self_profiles.sql`

**ขัดกติกา "migration ต้อง additive" อย่างจงใจ** — ต้องเขียนเหตุผลไว้ในหัวไฟล์
เพื่อไม่ให้กลายเป็นบรรทัดฐานว่า drop ตารางได้ตามใจ:

- ตาราง `resumes` และ `matches` **ว่างทั้งคู่ (0 แถว)**
- ไม่มีโค้ดใดในรีโปอ้างถึง (ตรวจด้วย grep `'resumes'` แล้วไม่พบ)
- ไม่ได้ถูกสร้างโดย migration ใดในรีโปนี้ (มาจากยุค `import_jobs.py` ซึ่งไม่อยู่ในรีโป)
- ไม่แตะตาราง `jobs` ซึ่งเป็นสิ่งที่กติกาตั้งใจปกป้อง
- ทั้งคู่เปิด public โดยไม่มี RLS (Supabase advisor ระดับ ERROR) การลบจึงปิดช่องโหว่ไปด้วย

```sql
drop table if exists public.resumes;
drop table if exists public.matches;

create table public.self_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  file_name text,
  raw_text text,
  parsed_data jsonb,
  assessment jsonb,
  embedding vector(768),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index self_profiles_owner_idx on public.self_profiles (owner_id);

create table public.resume_assessments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.self_profiles(id) on delete cascade,
  requirement_text text not null,
  requirement_hash text not null,
  score int not null,
  reasoning text,
  created_at timestamptz default now(),
  unique (profile_id, requirement_hash)
);

alter table public.self_profiles enable row level security;
alter table public.resume_assessments enable row level security;

create policy "own self profile" on public.self_profiles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "own resume assessments" on public.resume_assessments
  for all using (
    exists (
      select 1 from public.self_profiles p
      where p.id = profile_id and p.owner_id = auth.uid()
    )
  );
```

`resume_assessments` เลียนแบบตาราง `analyses` ที่มีอยู่ (unique บน
`(profile_id, requirement_hash)`) ผู้ใช้พิมพ์ตำแหน่งเดิมซ้ำจะไม่เสียโควตา LLM อีก

### Migration `012_match_jobs.sql`

```sql
-- กระจกเงาของ match_candidates แต่ยิงไปตาราง jobs
-- Additive: เพิ่มฟังก์ชันใหม่ ไม่แตะ jobs หรือฟังก์ชันเดิม
create or replace function match_jobs(query_embedding vector(768), match_count int)
returns table (id uuid, similarity float)
language sql stable as $$
  select j.id, 1 - (j.embedding <=> query_embedding) as similarity
  from jobs j
  where j.embedding is not null
  order by j.embedding <=> query_embedding
  limit match_count;
$$;
```

---

## 2. ความเป็นส่วนตัวและการควบคุมสิทธิ์

**สิ่งที่สำคัญที่สุดในสเปคนี้:** ทุก API route ใช้ `getServerClient()` ซึ่งเป็น service-role
และ **bypass RLS ทั้งหมด** ดังนั้น

> `.eq('owner_id', session.userId)` ในทุก query **คือกลไกป้องกันตัวจริง**
> ไม่ใช่การป้องกันชั้นสอง

RLS ยังต้องมีเพราะคุมเส้นทางที่เข้าผ่าน anon key ตรงจากเบราว์เซอร์ — ช่องเดียวกับที่ทำให้
`resumes` เดิมถูก advisor แจ้ง ERROR

**IDOR — ข้อบังคับ:** ทุก route ที่รับ `id` จาก URL ต้องตรวจว่า profile นั้นมี
`owner_id = session.userId` **ก่อน**ทำอะไรทั้งสิ้น มิฉะนั้นผู้ใช้คนหนึ่งยิง id ของอีกคน
แล้วอ่านผลประเมินได้ ถ้าไม่ใช่เจ้าของให้ตอบ 404 (ไม่ใช่ 403 — จะได้ไม่เปิดเผยว่า id นั้นมีอยู่จริง)

**ข้อมูลนี้ต้องไม่ไหลเข้า candidate pool** — `self_profiles` เป็นคนละตารางกับ `candidates`
โดยสิ้นเชิง ความเป็นส่วนตัวจึงเกิดจากโครงสร้าง ไม่ใช่จากการจำว่าต้องใส่ `where` ให้ถูกที่
ห้ามเพิ่มเส้นทางใดที่คัดลอก `self_profiles` เข้า `candidates`

---

## 3. อ่าน PDF และสร้างบทวิเคราะห์

### `parsePdfProfile(pdfBase64: string): Promise<{ profile: CandidateInput; raw_text: string }>`

ไฟล์ใหม่: `lib/gemini/parsePdf.ts`

ส่ง PDF เข้า Gemini เป็น inline data (`mimeType: 'application/pdf'`, base64) พร้อม
`config: { responseMimeType: 'application/json' }` แบบเดียวกับที่ `extractFilters.ts` ใช้อยู่

คืนโครงสร้างเดียวกับ `CandidateInput` ที่มีอยู่ (`full_name`, `headline`, `location`,
`summary`, `skills[]`, `education[]`, `experience[]`) ค่าทุกฟิลด์เป็นภาษาอังกฤษ พร้อม
`raw_text` คือข้อความที่อ่านได้จากไฟล์ และ `source: 'upload'`

Gemini อ่าน PDF ได้เองรวมถึงไฟล์ที่สแกนมาเป็นรูป จึงไม่ต้องเพิ่มไลบรารีอ่าน PDF —
ตรงกับข้อจำกัดเรื่อง dependency

### `assessProfile(profile: CandidateInput): Promise<Assessment>`

ไฟล์ใหม่: `lib/gemini/assess.ts`

```ts
export type Assessment = {
  strengths: string[]      // ภาษาไทย
  weaknesses: string[]     // ภาษาไทย
  development: string[]    // ภาษาไทย — สิ่งที่ควรพัฒนา
  summary: string          // ภาษาไทย — ภาพรวมสั้นๆ
}
```

**ทำไมแยกเป็นสอง Gemini call แทนที่จะรวบเป็นหนึ่ง** ทั้งที่ประหยัดโควตาได้ครึ่งหนึ่ง:
สองอย่างนี้คนละธรรมชาติ — อันแรกสกัดข้อเท็จจริง อันที่สองตัดสิน แยกแล้วปรับ prompt
ทีละตัวได้ เขียนเทสต์แยกได้ และประเมินใหม่ได้จาก `parsed_data` ที่เก็บไว้โดยไม่ต้องให้
ผู้ใช้อัปโหลด PDF ซ้ำ ที่ 5 generation/นาที สองแบบนี้ต่างกันแค่ 2.5 กับ 5 ครั้ง/นาที
ซึ่งไม่ต่างในทางปฏิบัติสำหรับทีมภายใน ตัวประหยัดโควตาจริงคือ cache ในหัวข้อ 5

---

## 4. API อัปโหลด

### `POST /api/self-assessment`

ไฟล์: `app/api/self-assessment/route.ts`

รับ `FormData` ที่มีฟิลด์ `file` — **ไม่ใช่ base64 ใน JSON** แบบ route อื่นในแอป
เพราะ base64 ทำให้ขนาดโตขึ้น ~33% และ Vercel จำกัด request body ที่ 4.5MB
PDF 3.5MB ที่ควรส่งได้จะกลายเป็น 4.7MB แล้วพังโดยไม่มีสัญญาณที่เดาถูก

**ขั้นตอน**

1. ตรวจ session — ไม่มีตอบ 401 (ทุก role ที่ล็อกอินใช้ได้ ไม่ต้อง gate ด้วย `hasRole`)
2. `validateUpload(file)` — ต้องเป็น `application/pdf` และไม่เกิน 4MB
3. `parsePdfProfile()` → profile + raw_text
4. `assessProfile(profile)` → assessment
5. `embedText(buildEmbedText(profile), 'RETRIEVAL_DOCUMENT')` → embedding
6. insert แถวใหม่ใน `self_profiles` พร้อม `owner_id = session.userId`
7. คืน `{ id }`

**ถ้าขั้นตอนใดล้ม ไม่เขียนอะไรลงฐานข้อมูลเลย** — หลักการเดียวกับ `updateCandidateFields`
ในเฟส v2 การเก็บ profile ที่ไม่มี embedding จะกลายเป็นข้อมูลเสียแบบเงียบที่ไม่มีสัญญาณเตือน
และจะไม่โผล่ในการจัดอันดับงานโดยไม่มีใครรู้สาเหตุ

**อัปโหลดใหม่สร้างแถวใหม่เสมอ** ไม่ทับของเดิม หน้าเว็บแสดงแถวล่าสุด — ได้ประวัติมาโดย
ไม่ต้องออกแบบเพิ่ม

### ข้อความ error

| กรณี | status | ข้อความที่ผู้ใช้เห็น |
|---|---|---|
| ไม่ได้ล็อกอิน | 401 | กรุณาเข้าสู่ระบบใหม่ |
| ไม่ได้แนบไฟล์ | 400 | กรุณาเลือกไฟล์ PDF |
| ไม่ใช่ PDF | 400 | รองรับเฉพาะไฟล์ PDF เท่านั้น |
| เกิน 4MB | 400 | ไฟล์ใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 4MB |
| Gemini อ่านไม่ออก / JSON พัง | 502 | อ่านไฟล์ไม่สำเร็จ กรุณาตรวจว่าไฟล์ไม่เสียหายแล้วลองใหม่ |
| อื่นๆ | 500 | เกิดข้อผิดพลาด กรุณาลองใหม่ |

---

## 5. จัดอันดับงานและคะแนนรายตำแหน่ง

### `matchJobsForProfile(profileId, ownerId, matchCount = 20)`

ไฟล์ใหม่: `lib/self/matchJobs.ts` — เป็นภาพสะท้อนของ `matchCandidatesForJob` ที่มีอยู่

ดึง `embedding` ที่เก็บไว้ (พร้อมตรวจ `owner_id`) → เรียก RPC `match_jobs` → ดึงรายละเอียด
งานจากตาราง `jobs` → คะแนน = `round(similarity * 100)` ตัดกรอบ 0–100

**ไม่มีการ embed ใหม่ ไม่มี LLM** — จุดนี้คือกติกาข้อ "ห้ามเรียก generation ต่อรายการงาน"

pgvector อาจคืน embedding มาเป็นสตริง JSON ต้อง `JSON.parse` ก่อนส่งเข้า RPC เหมือนที่
`matchCandidatesForJob` ทำอยู่

> **หมายเหตุความคาดหวัง:** ขณะเขียนสเปคนี้ระบบมีงานเพียง 4 งาน (ผู้สมัคร 108 คน)
> การจัดอันดับจากคลัง 4 รายการยังให้คุณค่าจำกัด ฟีเจอร์นี้จะเห็นผลจริงเมื่อคลังงานโตขึ้น

### `POST /api/self-assessment/[id]/score`

รับ `{ requirement: string }`

1. ตรวจ session + ตรวจว่า profile เป็นของผู้เรียก (ไม่ใช่ → 404)
2. `requirementHash(requirement)` ด้วยฟังก์ชันเดิมจาก `lib/gemini/cache.ts`
3. ค้น `resume_assessments` — เจอคืนทันทีพร้อมธง `cached: true`
   (pattern เดียวกับ `/api/analyze` ที่มีอยู่)
4. ไม่เจอ → `analyzeCandidate(parsed_data, requirement)` → เก็บ → คืน

**ใช้ `analyzeCandidate()` ที่มีอยู่ซ้ำ ไม่เขียนฟังก์ชันใหม่** — มันรับ `CandidateInput`
กับ requirement แล้วคืนคะแนน 0–100 พร้อมเหตุผลภาษาไทย ซึ่งตรงกับที่ต้องการพอดี และ
`parsed_data` ที่เก็บไว้ก็เป็นโครงเดียวกัน ไม่มีเหตุผลให้มีสองฟังก์ชันทำงานเดียวกัน

---

## 6. UI

### หน้า `/self-assessment`

`app/(app)/self-assessment/page.tsx` — server component, `dynamic = 'force-dynamic'`
ตรวจ session แล้ว query แถวล่าสุดของผู้ใช้ (`.eq('owner_id', session.userId)`
`.order('created_at', { ascending: false }).limit(1)`)

**ยังไม่เคยอัปโหลด** → สถานะว่างพร้อมคำอธิบายและปุ่มอัปโหลด ไม่ใช่หน้าเปล่า

**มีโปรไฟล์แล้ว** → สี่ส่วนเรียงลงมา

1. โปรไฟล์ที่ AI แกะได้ — ชื่อ ตำแหน่ง สกิล (`.chip`) การศึกษา ประสบการณ์
2. บทวิเคราะห์ — จุดแข็ง จุดอ่อน สิ่งที่ควรพัฒนา จาก `assessment`
3. งานที่เหมาะ — เรียงตามคะแนน แต่ละแถวเป็น `.result-row` + `ScoreBadge` ลิงก์ไป `/jobs/[id]`
4. ประเมินกับตำแหน่งที่สนใจ — ช่องพิมพ์ + ปุ่ม แสดง `ScoreBadge` กับเหตุผล และป้าย
   "(จาก cache)" เมื่อได้ผลจาก cache เหมือนที่ `AnalyzePanel` ทำ

ปุ่มอัปโหลดไฟล์ใหม่อยู่ท้ายหน้า

### Component

- `components/SelfAssessmentUpload.tsx` (client) — เลือกไฟล์ ตรวจขนาด/ชนิดฝั่ง client
  ก่อนส่ง แสดงสถานะกำลังประมวลผลอย่างชัดเจน เพราะสอง LLM call ใช้เวลาได้ 10–20 วินาที
  เสร็จแล้ว `router.refresh()`
- `components/RoleScorePanel.tsx` (client) — ช่องพิมพ์ตำแหน่ง + ปุ่มประเมิน

ใช้คลาสจาก `globals.css` ที่มีอยู่ทั้งหมด (`.card`, `.chip`, `.result-row`,
`.section-header`, `.stack`, `.row`, `.btn*`, `.input`) และ `ScoreBadge` ตัวเดิม
ไม่เพิ่ม CSS ใหม่เว้นแต่จำเป็นจริง

### Nav

`app/(app)/layout.tsx` เพิ่มลิงก์ "ประเมินตัวเอง" → `/self-assessment`
**ไม่ต้อง gate ด้วย role** ทุกคนที่ล็อกอินเห็นได้

### Middleware

`middleware.ts` เพิ่ม `/self-assessment/:path*` เข้า matcher เพื่อกันผู้ที่ไม่ได้ล็อกอิน

---

## Testing

Unit test สำหรับตรรกะบริสุทธิ์ที่รันออฟไลน์ได้:

| ไฟล์เทสต์ | ครอบคลุม |
|---|---|
| `lib/self/validateUpload.test.ts` | ชนิดไฟล์ถูก/ผิด, ขนาดพอดีขอบ 4MB, ไม่มีไฟล์ |
| `lib/self/assessmentShape.test.ts` | ตัวตรวจรูปร่าง JSON ที่ Gemini คืนมา — กันกรณี parse สำเร็จแต่ฟิลด์ไม่ครบ |
| `lib/self/score.test.ts` | แปลง similarity เป็นคะแนน 0–100 รวมเคสติดลบและเกิน 1 |

**`validateUpload` ต้องรับค่าพื้นฐาน ไม่ใช่ object `File`** — ลายเซ็นคือ
`validateUpload(input: { type?: string; size?: number } | null): string | null`
คืน `null` เมื่อผ่าน หรือข้อความไทยเมื่อไม่ผ่าน เขียนแบบนี้เพื่อให้เทสต์ได้โดยไม่ต้อง
สร้าง `File` จำลองใน Node ส่วน route เป็นคนดึง `type`/`size` จาก `File` มาส่งให้

**`lib/self/score.ts` เป็นฟังก์ชันเล็กตัวใหม่ ไม่ใช่การ refactor ของเดิม** — ห้ามไปแก้
ตรรกะการคิดคะแนนที่ฝังอยู่ใน `lib/jobs/match.ts` หรือ `lib/search/query.ts` เพราะกติกา
ห้ามแตะ search/matching ที่มีอยู่ ยอมให้มีสูตรเดียวกันอยู่สองที่ในเฟสนี้

ไม่เขียน integration test ใหม่ ยืนยันด้วย `npm run build` ผ่าน suite เดิมเขียว และ
checklist ทดสอบด้วยมือที่ `docs/manual-tests/self-assessment.md` (รูปแบบเดียวกับ
`email-confirmation.md`) ครอบคลุม: PDF ภาษาอังกฤษ · **PDF ภาษาไทย — ต้องอัปโหลดผ่าน
และ `parsed_data` ที่เก็บต้องออกมาเป็นอังกฤษ (ชื่อถอดเป็นอักษรโรมัน) ขณะที่บทวิเคราะห์
ที่แสดงยังเป็นไทย** · PDF ที่สแกนเป็นรูป · ไฟล์ไม่ใช่ PDF · ไฟล์เกินขนาด ·
ผู้ใช้อีกคนยิง id ของเรา (ต้องได้ 404) · ตำแหน่งเดิมซ้ำต้องได้ `cached`

เคส PDF ภาษาไทยสำคัญเป็นพิเศษ เพราะกลุ่มผู้ใช้เป้าหมายของแอปคือคนไทย resume ภาษาไทย
จึงเป็นกรณีปกติ ไม่ใช่กรณีขอบ

---

## สรุปไฟล์

**สร้างใหม่:**

- `supabase/migrations/011_self_profiles.sql`, `supabase/migrations/012_match_jobs.sql`
- `lib/gemini/parsePdf.ts`, `lib/gemini/assess.ts`
- `lib/self/validateUpload.ts` (+ test), `lib/self/assessmentShape.ts` (+ test),
  `lib/self/score.ts` (+ test), `lib/self/matchJobs.ts`
- `app/api/self-assessment/route.ts`, `app/api/self-assessment/[id]/score/route.ts`
- `app/(app)/self-assessment/page.tsx`
- `components/SelfAssessmentUpload.tsx`, `components/RoleScorePanel.tsx`
- `docs/manual-tests/self-assessment.md`

**แก้ไข:**

- `app/(app)/layout.tsx` — ลิงก์ nav
- `middleware.ts` — เพิ่ม matcher
- `CLAUDE.md` — ลบข้อความค้างเรื่อง `resumes`/`matches` ในหัวข้อ deferred เพราะถูก drop แล้ว

---

## ลำดับการทำ

1. Migration 011 + 012 (ฐานของทุกอย่าง)
2. ฟังก์ชันบริสุทธิ์ + เทสต์ (validateUpload, assessmentShape, score)
3. Gemini — parsePdf + assess
4. API อัปโหลด
5. matchJobs + API คะแนนรายตำแหน่ง
6. UI + nav + middleware

ข้อ 1 ต้องมาก่อนเสมอ ข้อ 2 เป็นอิสระ ทำเมื่อไหร่ก็ได้
