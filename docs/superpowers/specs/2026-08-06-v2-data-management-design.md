# V2 — Data Management: role ใหม่, หน้าตารางข้อมูล, และการจัดการรหัสผ่าน

**เป้าหมาย:** เพิ่มความสามารถในการดูแลข้อมูลผู้สมัครจากหน้าเว็บ โดยมี role ใหม่ `data_manager`
ที่รับผิดชอบการตรวจสอบและแก้ไขข้อมูล พร้อมปรับปรุงการจัดการรหัสผ่านของผู้ใช้

**สถาปัตยกรรมโดยรวม:** หน้าตารางเป็น server component อ่านข้อมูลผ่าน URL params ส่วนการเขียน
ทั้งหมดไปผ่าน API route ที่ตรวจสิทธิ์แล้วใช้ service-role client (pattern เดียวกับ
`/api/admin/users` ที่มีอยู่) ไม่แตะ RLS ของตาราง `candidates` เลย

**Stack:** Next.js 15 (App Router), Supabase, Gemini, plain CSS, Vitest — ไม่มี dependency ใหม่

---

## ขอบเขต

**อยู่ใน v2:**

1. Role ใหม่ `data_manager` (แบบลำดับชั้น)
2. หน้าตารางข้อมูลผู้สมัคร — ดู เรียง แบ่งหน้า ค้นหา และแก้ไขฟิลด์หลัก
3. API แก้ไขผู้สมัคร พร้อม re-embed อัตโนมัติ
4. เปลี่ยนรหัสผ่าน (ยืนยันรหัสเดิม) และลืมรหัสผ่านทางอีเมล
5. ตรวจข้อมูลไม่ครบ/ซ้ำ

**เลื่อนไป v3:**

- **ล็อกอินด้วย Google** — เลื่อนออกเพราะมีความเสี่ยงเรื่องบัญชีซ้ำ ถ้าผู้ใช้เดิมกดล็อกอิน
  ด้วย Google โดยใช้อีเมลเดียวกัน Supabase อาจสร้าง auth user ใหม่แทนการลิงก์เข้าบัญชีเดิม
  ทำให้ได้ profile ใหม่ role `member` และมองไม่เห็น shortlist เดิม (เพราะ `owner_id` ผูกกับ
  user เดิม) การลิงก์อัตโนมัติเกิดเมื่ออีเมลของบัญชีเดิมยืนยันแล้ว แต่โปรเจกต์นี้น่าจะปิด
  email confirmation อยู่ ต้องพิสูจน์บน preview ก่อนจึงจะทำได้อย่างปลอดภัย

**ไม่อยู่ในขอบเขต:**

- ลบผู้สมัคร (ทั้งเดี่ยวและกลุ่ม)
- แก้ไข education / experience / skills จากหน้าตาราง
- Bulk action และ export CSV
- Audit log และ soft delete
- data_manager จัดการ role ของผู้ใช้คนอื่น (ยังเป็นสิทธิ์ของ admin เท่านั้น)

---

## Global Constraints

- ไม่เพิ่ม dependency ใหม่ ใช้ plain CSS และคลาสจาก `app/globals.css` ที่มีอยู่
- Migration ต้องเป็นแบบ additive ห้าม drop หรือ alter ตาราง `jobs` และตารางเดิม
- ไม่แตะตรรกะ search / ingest / scoring / dedup ที่มีอยู่
- ไม่เพิ่ม RLS policy สำหรับ update/delete บน `candidates` — การเขียนไปผ่าน API route เท่านั้น
- Server component ยังเป็น server, client component ยังเป็น client
- เทสต์เดิมทั้งหมดต้องยังเขียว โดยเฉพาะเทสต์ของ `hasRole`
- ข้อความ UI เป็นภาษาไทย ข้อมูลในฐานข้อมูลเป็นภาษาอังกฤษตามเดิม
- ห้ามแสดง error ดิบจาก Postgres หรือ Gemini ให้ผู้ใช้เห็น

---

## 1. Role model

### Migration `009_data_manager_role.sql`

```sql
alter type user_role add value if not exists 'data_manager';
```

ต้องแยกเป็นไฟล์ของตัวเองและรันเดี่ยวๆ ก่อนไฟล์อื่น เพราะ Postgres ไม่อนุญาตให้ใช้ค่า enum
ใหม่ใน transaction เดียวกับที่เพิ่มค่านั้น

### เปลี่ยน `hasRole()` เป็นลำดับชั้น

ไฟล์: `lib/auth/session.ts`

```ts
export type Role = 'admin' | 'data_manager' | 'member'

const ROLE_RANK: Record<Role, number> = {
  member: 1,
  data_manager: 2,
  admin: 3,
}

export function hasRole(userRole: Role, required: Role): boolean {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[required] ?? 0)
}
```

พฤติกรรมเดิมคงอยู่ครบ: `admin` ผ่านทุกประตู และ `member` ผ่านเฉพาะประตู `member`
เทสต์เดิมของ `hasRole` จึงยังเขียวโดยไม่ต้องแก้

`ROLE_RANK[userRole] ?? 0` ป้องกันกรณีที่ได้ค่า role แปลกปลอมจากฐานข้อมูล — จะได้ rank 0
ซึ่งไม่ผ่านประตูใดเลย แทนที่จะเป็น `undefined >= n` ที่ให้ผลลัพธ์ false โดยบังเอิญ

### ตารางสิทธิ์

| ความสามารถ | member | data_manager | admin |
|---|---|---|---|
| ค้นหา / shortlist / งาน / dashboard | ✓ | ✓ | ✓ |
| ดูตารางข้อมูล + แก้ฟิลด์หลัก | — | ✓ | ✓ |
| นำเข้า CSV (`/import`) | — | ✓ | ✓ |
| จัดการผู้ใช้ (`/admin/users`) | — | — | ✓ |

### จุดที่ต้องแก้ตามมา

- `app/api/admin/users/route.ts` — ปัจจุบัน validate ว่า `role` ต้องเป็น `'admin'` หรือ
  `'member'` เท่านั้น ต้องเพิ่ม `'data_manager'` ไม่งั้นตั้ง role ใหม่ให้ใครไม่ได้เลย
- `components/RoleSelect.tsx` — เพิ่ม `<option value="data_manager">` และขยาย type ของ prop
  `role` ให้ครอบคลุมค่าใหม่
- `app/(app)/layout.tsx` — เปลี่ยน gate ของลิงก์ `/import` จาก admin เป็น data_manager,
  เพิ่มลิงก์ "ข้อมูล" (`/candidates`) ที่ gate ด้วย data_manager, ลิงก์ `/admin/users` คงที่ admin
- `app/(app)/import/page.tsx` — **ปัจจุบันไม่มี guard ฝั่ง server เลย** ซ่อนแค่ลิงก์ใน navbar
  ใครพิมพ์ URL ตรงก็เข้าได้ ต้องเพิ่ม `getSession()` + `hasRole(session.role, 'data_manager')`
  แล้ว `redirect('/dashboard')` เหมือนที่หน้า `/admin/users` ทำ

  หมายเหตุ: หน้านี้เป็น client component อยู่ ต้องแยกเป็น server component ที่ทำ guard
  แล้วเรียก client component ลูกที่มีฟอร์มอัปโหลด (ย้ายเนื้อหาเดิมไปเป็น
  `components/ImportForm.tsx`)

---

## 2. หน้าตารางข้อมูลผู้สมัคร

### Route

`app/(app)/candidates/page.tsx` — วางข้างๆ `candidates/[id]/page.tsx` ที่มีอยู่ กลายเป็นคู่
list/detail ตามธรรมเนียม Next.js และลิงก์จากแถวไปหน้ารายละเอียดเดิมได้ตรงๆ

เป็น server component มี `export const dynamic = 'force-dynamic'` และ guard ด้วย
`hasRole(session.role, 'data_manager')` แล้ว redirect ไป `/dashboard` ถ้าไม่ผ่าน

### URL parameters

| param | ความหมาย | ค่าเริ่มต้น |
|---|---|---|
| `page` | หน้าที่เท่าไร (เริ่มที่ 1) | 1 |
| `sort` | คอลัมน์ที่ใช้เรียง | `updated_at` |
| `dir` | ทิศทาง `asc` หรือ `desc` | `desc` |
| `q` | คำค้นข้อความ | ว่าง |
| `issues` | `1` = แสดงเฉพาะที่มีปัญหา | ไม่ตั้ง |

**Whitelist การเรียง** — `sort` ต้องอยู่ในชุด `full_name`, `years_experience`, `source`,
`updated_at`, `created_at` เท่านั้น ค่าที่ไม่อยู่ในลิสต์ให้ fallback เป็น `updated_at`
ห้ามส่งค่าจาก URL เข้า `.order()` ตรงๆ เช่นเดียวกับ `dir` ที่รับได้แค่ `asc` / `desc`

**ค้นหา** — `q` ยิง `ilike` บน `full_name` และ `headline` เป็นการค้นข้อความตรงตัวสำหรับงาน
ตรวจข้อมูล คนละเรื่องกับ semantic search ที่หน้า `/search`

**แบ่งหน้า** — `.range(offset, offset + 24)` หน้าละ 25 แถว พร้อม `count: 'exact'` เพื่อคำนวณ
จำนวนหน้าทั้งหมด

**การตรวจค่า `page`** — ค่าจาก URL อาจไม่ใช่ตัวเลข ติดลบ หรือเกินจำนวนหน้าที่มี ให้แปลงด้วย
`Number()` แล้วถ้าไม่ใช่จำนวนเต็มบวกให้ใช้ 1 การขอหน้าที่เกินช่วงข้อมูลจะได้ตารางว่าง
ซึ่งยอมรับได้ ไม่ต้อง redirect

### คอลัมน์ในตาราง

ชื่อ (ลิงก์ไปหน้ารายละเอียด) · headline · location · source · ปีประสบการณ์ ·
อัปเดตล่าสุด · badge ปัญหา · ปุ่มแก้ไข

### การแก้ไข

ปุ่มในแถวเปิด client modal `components/EditCandidateModal.tsx` ซึ่งยิง
`PATCH /api/candidates/[id]` เมื่อสำเร็จเรียก `router.refresh()` ให้ตารางโหลดข้อมูลใหม่

**ฟิลด์ที่แก้ได้** (เฉพาะคอลัมน์บนตาราง `candidates` ไม่แตะตารางลูก):
`full_name`, `headline`, `location`, `summary`, `linkedin_url`, `professional_email`

---

## 3. API แก้ไขผู้สมัคร + re-embed

### `PATCH /api/candidates/[id]`

ไฟล์: `app/api/candidates/[id]/route.ts`

ตรวจ session แล้ว `hasRole(session.role, 'data_manager')` ถ้าไม่ผ่านตอบ 403
จากนั้นเรียก `updateCandidateFields()` และตอบ `{ ok: true }` หรือ `{ error }`

### `updateCandidateFields()`

ไฟล์ใหม่: `lib/candidates/update.ts`

**ต้องแยกจาก `upsertCandidate()` เด็ดขาด** เพราะตัวเดิมลบ education, experience และ
candidate_skills ทิ้งทั้งหมดแล้วเขียนใหม่ (เหมาะกับ ingest) ถ้าเอามาใช้แก้แค่ headline
ข้อมูลลูกทั้งหมดจะหายไป ตัวใหม่แตะเฉพาะคอลัมน์บน `candidates`

**ขั้นตอน:**

1. **Validate** — trim ทุกฟิลด์, `full_name` ห้ามว่าง (คอลัมน์เป็น `not null`),
   ฟิลด์ข้อความที่ว่างแปลงเป็น `null`
2. **ดึงข้อมูลปัจจุบัน** — แถว candidate เดิม พร้อม education, experience และ skills
3. **ตัดสินใจ re-embed** — เทียบ `buildEmbedText(before) !== buildEmbedText(after)`
4. **ถ้าต้อง re-embed** — เรียก `embedText()` ด้วยข้อความใหม่
5. **เขียน** — คอลัมน์ที่แก้ + `embedding` (ถ้ามีการ re-embed) + `updated_at` ในคำสั่งเดียว

### เงื่อนไข re-embed

ใช้การเทียบข้อความที่จะ embed จริง ไม่ใช่การไล่ระบุรายฟิลด์:

```ts
const needsReembed = buildEmbedText(before) !== buildEmbedText(after)
```

**เหตุผล:** `buildEmbedText` ประกอบจาก `full_name`, `headline`, `summary`, `skills`,
`education` และ `experience` การเทียบสตริงผลลัพธ์จึงถูกต้องอัตโนมัติกับทุกฟิลด์ ทั้งฟิลด์หลัก
และข้อมูลลูก และจะยังถูกต้องต่อไปแม้วันหลังมีคนเพิ่มฟิลด์เข้า `buildEmbedText` โดยไม่ต้อง
กลับมาแก้ตรรกะนี้

ผลพลอยได้ที่ต้องการ: `location`, `linkedin_url` และ `professional_email` ไม่ได้อยู่ใน
`buildEmbedText` การแก้ฟิลด์เหล่านี้จึงไม่ยิง Gemini เลย ประหยัดโควตา free tier

ในขอบเขต v2 ข้อมูลลูกยังแก้จากหน้าตารางไม่ได้ ทางเดียวที่ข้อมูลลูกเปลี่ยนคือ re-import
ซึ่ง `upsertCandidate` re-embed ให้อยู่แล้วทุกครั้ง

### เมื่อ Gemini ล้มเหลว

ไม่เขียนอะไรลงฐานข้อมูลเลย ตอบ error ให้ผู้ใช้ลองใหม่ — ดีกว่าเขียนฟิลด์สำเร็จแต่ปล่อยให้
embedding ค้างของเก่า เพราะจะกลายเป็นข้อมูลไม่ตรงกันแบบเงียบที่ไม่มีสัญญาณเตือนใดๆ

### ข้อความ error

| กรณี | status | ข้อความที่ผู้ใช้เห็น |
|---|---|---|
| ไม่ได้ล็อกอิน | 401 | กรุณาเข้าสู่ระบบใหม่ |
| ไม่มีสิทธิ์ | 403 | คุณไม่มีสิทธิ์แก้ไขข้อมูลนี้ |
| ชื่อว่าง | 400 | กรุณากรอกชื่อผู้สมัคร |
| LinkedIn URL ซ้ำ (Postgres code `23505`) | 409 | LinkedIn URL นี้ถูกใช้กับผู้สมัครคนอื่นแล้ว |
| Gemini ล้มเหลว | 502 | ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่ |
| อื่นๆ | 500 | เกิดข้อผิดพลาด กรุณาลองใหม่ |

---

## 4. การจัดการรหัสผ่าน

### เปลี่ยนรหัสผ่าน

การ์ดใหม่ในหน้า `/settings` มีสามช่อง: รหัสผ่านเดิม, รหัสผ่านใหม่, ยืนยันรหัสผ่านใหม่

Supabase `updateUser({ password })` **ไม่ตรวจรหัสผ่านเดิมให้** ต้องยืนยันเอง:

1. ดึงอีเมลผู้ใช้ปัจจุบันจาก `auth.getUser()`
2. เรียก `signInWithPassword({ email, password: รหัสเดิม })` เพื่อยืนยันตัวตน
3. ถ้าผ่าน เรียก `updateUser({ password: รหัสใหม่ })`

ผลข้างเคียงของขั้นที่ 2 คือได้ session ใหม่ของผู้ใช้คนเดิม ไม่กระทบการใช้งาน

**Validate ก่อนยิง API** (ฟังก์ชันบริสุทธิ์ `validatePasswordChange`):

- กรอกครบทั้งสามช่อง
- รหัสใหม่ตรงกับช่องยืนยัน
- รหัสใหม่ยาวอย่างน้อย 6 ตัวอักษร (ค่าเริ่มต้นของ Supabase)
- รหัสใหม่ต้องไม่ตรงกับรหัสเดิม

### ลืมรหัสผ่าน

**`app/(auth)/forgot-password/page.tsx`** — กรอกอีเมล แล้วเรียก
`resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })`

แสดงข้อความยืนยันแบบเดียวกันเสมอไม่ว่าอีเมลนั้นจะมีอยู่จริงหรือไม่ เพื่อไม่เปิดเผยว่าใคร
เป็นสมาชิกของระบบ

**`app/(auth)/reset-password/page.tsx`** — ผู้ใช้มาจากลิงก์ในอีเมลพร้อม recovery session
กรอกรหัสใหม่แล้วเรียก `updateUser({ password })` เมื่อสำเร็จส่งไป `/dashboard`

ถ้าไม่มี recovery session (เช่นเปิด URL ตรงๆ หรือลิงก์หมดอายุ) ให้แสดงข้อความว่าลิงก์
ไม่ถูกต้องหรือหมดอายุ พร้อมลิงก์กลับไปขอใหม่

**เพิ่มลิงก์ "ลืมรหัสผ่าน?"** ในหน้า `/login`

ทั้งสองหน้าใช้ `.auth-wrap` และ `.card` เหมือนหน้า login/signup ที่มีอยู่

### งานที่ต้องทำใน Supabase dashboard

ทำจาก repo ไม่ได้ ต้องทำด้วยมือ:

1. Authentication → URL Configuration → เพิ่ม redirect URL ของทั้ง `http://localhost:3000`
   และโดเมน Vercel มิฉะนั้นลิงก์รีเซ็ตรหัสผ่านจะเด้งไปผิดที่ตอน production
2. ตรวจ email template ของ Reset Password ว่าใช้งานได้

---

## 5. ตรวจข้อมูลไม่ครบ/ซ้ำ

คำนวณสด ไม่เพิ่มคอลัมน์และไม่เพิ่ม migration เก็บตรรกะไว้ใน TypeScript เป็นฟังก์ชันบริสุทธิ์
ที่เทสต์แบบ offline ได้

### ข้อมูลไม่ครบ

ไฟล์: `lib/candidates/quality.ts`

ตรวจจากคอลัมน์บน `candidates`: `headline` ว่าง, `summary` ว่าง, `years_experience` ว่าง,
และ `embedding` ว่าง

**`embedding` ว่างคือกรณีที่สำคัญที่สุด** — RPC ทั้ง `match_candidates` และ
`match_candidates_filtered` มีเงื่อนไข `where c.embedding is not null` ผู้สมัครที่ไม่มี
embedding จึงไม่ปรากฏในผลค้นหาเลยแม้แต่ครั้งเดียว ทั้งที่ข้อมูลอยู่ในฐานข้อมูล ปัจจุบันไม่มี
หน้าไหนในระบบที่มองเห็นปัญหานี้ได้ หน้าตารางนี้จะเป็นที่แรก

ฟังก์ชันคืนรายการฟิลด์ที่ขาด เพื่อให้ badge บอกได้ว่าขาดอะไรบ้าง

### ชื่อซ้ำ

Query แยกหนึ่งครั้งต่อการโหลดหน้า: `group by full_name having count(*) > 1` ผลลัพธ์เป็นชุด
ชื่อที่ซ้ำซึ่งมีขนาดเล็ก นำมาทำเป็น `Set` แล้วตรวจว่าแต่ละแถวอยู่ในชุดนั้นหรือไม่

### ตัวกรอง `issues=1`

ต้องกรองใน SQL เพื่อให้ pagination นับจำนวนถูกต้อง ใช้ PostgREST `.or()` รวมเงื่อนไข
`headline.is.null`, `summary.is.null`, `years_experience.is.null`, `embedding.is.null`
เข้ากับ `full_name.in.(<ชื่อที่ซ้ำ>)`

**กรณีไม่มีชื่อซ้ำเลย** ต้องตัดเงื่อนไข `full_name.in.()` ออกจากสตริง `.or()` ทั้งท่อน
ห้ามส่งวงเล็บว่าง เพราะ PostgREST จะ parse ไม่ผ่านและทั้ง query จะพัง — เป็นเคสปกติที่เกิดขึ้น
เมื่อข้อมูลสะอาด จึงต้องรองรับตั้งแต่แรก

**ชื่อที่มีอักขระพิเศษ** เช่น จุลภาคหรือวงเล็บ ต้องครอบด้วยเครื่องหมายคำพูดก่อนใส่ในลิสต์
`in.()` มิฉะนั้นจุลภาคในชื่อจะถูกตีความเป็นตัวคั่นรายการ

**เหตุผลที่ไม่ทำเป็น view หรือ RPC:** ต้องเขียน dynamic SQL สำหรับการเรียงลำดับ ซึ่งอ่านยาก
และเทสต์ยาก วิธีนี้แลกด้วย query เพิ่มหนึ่งครั้งต่อการโหลดหน้า แต่ตรรกะทั้งหมดอยู่ใน
TypeScript ที่เขียนเทสต์ได้

### UI

Badge ในแถว: เทาสำหรับข้อมูลไม่ครบ (ระบุฟิลด์ที่ขาด) และส้มสำหรับชื่อซ้ำ
พร้อมปุ่มสลับ "แสดงเฉพาะที่มีปัญหา" เหนือตาราง

---

## Error handling

ทุก API route ตอบ JSON รูปแบบ `{ error: string }` พร้อม HTTP status ที่ถูกต้อง —
401 ไม่ได้ล็อกอิน, 403 ไม่มีสิทธิ์, 400 ข้อมูลไม่ผ่านการตรวจ, 409 ข้อมูลชนกัน,
502 บริการภายนอกล้มเหลว, 500 อื่นๆ

ฝั่ง UI แปลงเป็นข้อความภาษาไทยตามตารางในหัวข้อ 3 ห้ามแสดงข้อความดิบจาก Postgres
หรือ Gemini ให้ผู้ใช้เห็น

หน้าที่ต้องมีสิทธิ์ทำ guard ฝั่ง server ด้วย `redirect()` เสมอ การซ่อนลิงก์ใน navbar
เป็นเรื่อง UI เท่านั้น ไม่ใช่การป้องกัน

---

## Testing

ตามแนวทางเดิมของโปรเจกต์ — unit test สำหรับตรรกะบริสุทธิ์ที่รันออฟไลน์ได้:

| ไฟล์เทสต์ | ครอบคลุม |
|---|---|
| `lib/auth/session.test.ts` (มีอยู่แล้ว) | `hasRole` ลำดับชั้น — เคสเดิมต้องยังเขียว บวกเคสใหม่ของ `data_manager` |
| `lib/candidates/update.test.ts` | `needsReembed` — แก้ location แล้วไม่ re-embed, แก้ headline แล้ว re-embed, ข้อมูลลูกเปลี่ยนแล้ว re-embed |
| `lib/candidates/quality.test.ts` | ตรวจฟิลด์ที่ขาด รวมเคส `embedding` ว่าง |
| `lib/auth/password.test.ts` | `validatePasswordChange` ทุกเงื่อนไข |

ไม่เขียน integration test ใหม่ ยืนยันด้วย `npm run build` ผ่าน, suite เดิมเขียว
และการทดสอบด้วยตาบนเครื่อง

---

## สรุปไฟล์

**สร้างใหม่:**

- `supabase/migrations/009_data_manager_role.sql`
- `app/(app)/candidates/page.tsx`
- `components/CandidatesTable.tsx`
- `components/EditCandidateModal.tsx`
- `components/ImportForm.tsx` (ย้ายเนื้อหาจากหน้า import เดิม)
- `app/api/candidates/[id]/route.ts`
- `lib/candidates/update.ts` + เทสต์
- `lib/candidates/quality.ts` + เทสต์
- `lib/auth/password.ts` + เทสต์
- `components/ChangePasswordCard.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/(auth)/reset-password/page.tsx`

**แก้ไข:**

- `lib/auth/session.ts` — Role type + `hasRole` ลำดับชั้น
- `app/api/admin/users/route.ts` — รับค่า `data_manager`
- `components/RoleSelect.tsx` — เพิ่มตัวเลือก
- `app/(app)/layout.tsx` — gate ลิงก์ตาม role ใหม่ + ลิงก์หน้าข้อมูล
- `app/(app)/import/page.tsx` — เพิ่ม server guard
- `app/(app)/settings/page.tsx` — เพิ่มการ์ดเปลี่ยนรหัสผ่าน
- `app/(auth)/login/page.tsx` — ลิงก์ลืมรหัสผ่าน
- `app/globals.css` — คลาสสำหรับตาราง (`.table`, `.table-head`, `.pager`) และ modal

---

## ลำดับการทำ

1. Role model (migration + `hasRole` + จุดที่ต้องแก้ตามมา) — เป็นฐานของทุกอย่าง
2. หน้าตารางแบบอ่านอย่างเดียว (รวมตรวจข้อมูลไม่ครบ/ซ้ำ)
3. API แก้ไข + re-embed + modal
4. เปลี่ยนรหัสผ่าน
5. ลืมรหัสผ่าน

ข้อ 4 และ 5 เป็นอิสระจากข้อ 1–3 สลับลำดับได้
