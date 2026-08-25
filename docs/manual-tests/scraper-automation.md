# คู่มือทดสอบด้วยมือ — การนำเข้าอัตโนมัติ

ส่วนที่เป็น logic ล้วนมี unit test คลุมแล้ว (`lib/ingest/embedHash.test.ts`,
`lib/ingest/classify.test.ts`) เอกสารนี้คือส่วนที่ต้องมี PhantomBuster และฐานข้อมูลจริง

## ก่อนเริ่ม

ตั้ง secret ใน GitHub → Settings → Secrets and variables → Actions:
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
`PHANTOMBUSTER_API_KEY`, `PHANTOMBUSTER_AGENT_ID`

และตั้งค่าเดียวกันใน `.env` สำหรับรันบนเครื่อง

## A. dry-run ก่อนของจริง (ห้ามข้าม)

```
npx tsx scripts/sync-phantombuster.ts --dry-run
```

**ผลที่ต้องได้:** รายงานจำนวนที่**จะ**เพิ่ม/อัปเดต/เข้าคิว/ข้าม โดยไม่มีแถวใหม่ในฐานข้อมูล

ตรวจ: `select count(*) from candidates;` ก่อนและหลัง ต้องเท่ากัน
และ `select count(*) from ingest_runs;` ต้องไม่เพิ่ม

**อ่านผลว่าคนที่ได้ตรงกลุ่มเป้าหมายไหม** (C-level จบต่างประเทศ) ถ้าไม่ตรง ให้แก้ search
ใน PhantomBuster ก่อน อย่าเพิ่งรันของจริง

## B. รันจริงหนึ่งรอบ

```
npx tsx scripts/sync-phantombuster.ts
```

ตรวจ:

```sql
select status, imported, updated, pending, skipped_unchanged, skipped_suppressed
from ingest_runs order by started_at desc limit 1;
```

## C. รันซ้ำทันที — เคสสำคัญที่สุดในชุดนี้

รันคำสั่งเดิมอีกครั้งโดยไม่เปลี่ยนอะไร

**ผลที่ต้องได้:** `imported = 0`, `updated = 0`, และ `skipped_unchanged` เท่ากับจำนวนแถว
ที่ครบทั้งหมด

**ถ้าข้อนี้ไม่ผ่าน แปลว่าทุกคืนจะเผาโควตา Gemini ซ้ำทั้งหมด และฟีเจอร์นี้ใช้จริงไม่ได้**
ให้ตรวจว่า `embed_hash` ถูกเขียนลงฐานข้อมูลจริง:
`select count(*) from candidates where embed_hash is null and source = 'scraper';`

## D. รายชื่อระงับกันการนำเข้าซ้ำ

1. เปิด `/candidates` เลือกผู้สมัครที่มาจาก scraper แล้วเข้าหน้ารายละเอียด
2. กด "ลบและห้ามนำเข้าอีก" กรอกเหตุผล ยืนยัน
3. ตรวจว่าหายจาก `/candidates` และปรากฏใน `/import/suppressed`
4. รันสคริปต์ซ้ำ

**ผลที่ต้องได้:** คนนั้นไม่กลับเข้ามา และ `skipped_suppressed` เพิ่มขึ้น 1

5. ทดสอบเส้นทางด้วยมือด้วย: วาง CSV ที่มีคนนั้นอยู่ที่หน้า `/import`
   **ต้องขึ้น "ข้าม (ถูกระงับ) 1"** — พิสูจน์ว่าการเช็คอยู่ลึกถึง `upsertCandidate` จริง

## E. คิวรอตรวจ

1. เปิด `/import/pending` — ต้องเห็นรายการพร้อม badge บอกว่าขาดอะไร
2. กด "อนุมัติ" หนึ่งราย → ต้องหายจากคิว และค้นเจอที่ `/search`
3. เลือกหลายรายการแล้วกด "ปฏิเสธที่เลือก" → ต้องหายจากคิว และ**ไม่**ปรากฏใน `/candidates`

## F. คนที่เคยเข้าคิวแล้วข้อมูลครบในรอบหลัง

จำลองโดยแก้แถวในคิวให้ payload ครบ แล้วรันสคริปต์ซ้ำ (หรือรอรอบที่ PhantomBuster
ให้ข้อมูลครบขึ้น)

**ผลที่ต้องได้:** คนนั้นเข้า `candidates` และ**แถวในคิวถูกลบออก** ไม่ค้างให้คนตรวจเสียเวลา

## G. สิทธิ์

ล็อกอินด้วยบัญชี `member` แล้วเปิด `/import`, `/import/pending`, `/import/suppressed`

**ผลที่ต้องได้:** ถูกเด้งไป `/dashboard` ทั้งสามหน้า และไม่เห็นปุ่ม "ลบและห้ามนำเข้าอีก"
ในหน้ารายละเอียดผู้สมัคร

## H. GitHub Actions

ไปที่แท็บ Actions → workflow `sync-candidates` → **Run workflow** (ปุ่มนี้มาจาก
`workflow_dispatch`)

**ผลที่ต้องได้:** job เขียว และมีแถวใหม่ใน `ingest_runs` ที่ `trigger = 'manual'`
(เพราะกดเอง ไม่ใช่ตามตาราง)

## ข้อควรระวัง

**โควตา Gemini** — การรันจริงครั้งแรกจะ embed ทุกแถวที่ครบ ถ้าเป็นหลักร้อยและอยู่บน
free tier อาจโดนจำกัดกลางทาง สถานะจะเป็น `partial` ซึ่ง**ไม่ใช่ความล้มเหลว** —
รันซ้ำแล้วมันจะทำต่อจากที่ค้างเอง

**เพดานต่อรอบ** — ถ้า `MAX_ROWS_PER_RUN` ถูกชน สถานะจะเป็น `partial` และ log จะบอกว่า
ถูกตัดที่เท่าไร ปรับค่าได้ทาง env โดยไม่ต้องแก้โค้ด
