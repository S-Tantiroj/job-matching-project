-- ปิดช่องดูดตาราง candidates ผ่าน anon key
--
-- ปัญหาที่พบเมื่อ 2026-09-07 (จาก Supabase security advisor แล้วตามไปตรวจ policy จริง):
--
--   SELECT  using      (auth.role() = 'authenticated')   -- ทุกคนที่ล็อกอิน อ่านได้ทั้งตาราง
--   INSERT  with check (auth.role() = 'authenticated')   -- ทุกคนที่ล็อกอิน เขียนได้
--
-- `NEXT_PUBLIC_SUPABASE_ANON_KEY` เป็นค่าสาธารณะที่อยู่ใน bundle ของเบราว์เซอร์
-- ดังนั้นผู้ใช้ระดับ `member` ที่ middleware กันไม่ให้เข้าหน้า /candidates สามารถ
-- เปิด devtools แล้วยิง `GET /rest/v1/candidates?select=*` ได้ทั้งตาราง — รวม
-- professional_email, linkedin_url, summary และ raw_data
--
-- **การกั้นด้วย role ที่ชั้นแอปกันได้แค่หน้าจอ ไม่ได้กันข้อมูล**
--
-- ส่วน INSERT ไม่มีเส้นทางไหนในแอปใช้เลย ทุกทางเข้าเขียนผ่าน service-role client
-- ซึ่ง bypass RLS อยู่แล้ว จึงถอนทิ้งได้โดยไม่กระทบอะไร

-- ---------------------------------------------------------------------------
-- 1. ถอนสิทธิ์เขียน
-- ---------------------------------------------------------------------------
drop policy if exists "insert candidates for authed" on public.candidates;

-- ---------------------------------------------------------------------------
-- 2. จำกัดให้เหลือเฉพาะคอลัมน์ที่หน้าเว็บฝั่งเบราว์เซอร์ต้องใช้จริง
-- ---------------------------------------------------------------------------
-- RLS เป็นการกรอง "แถว" ส่วนการกรอง "คอลัมน์" ต้องทำด้วย column-level grant
-- ทั้งสองชั้นต้องอนุญาตพร้อมกัน PostgREST ถึงจะคืนค่าให้
--
-- **ห้ามถอน policy อ่านทิ้ง** — ถอนแล้วจะเหลือ deny-all แล้วหน้า Shortlist พังเงียบๆ
-- (ดูเหตุผลข้อ 3)
revoke select on public.candidates from anon, authenticated;
grant select (id, full_name, headline) on public.candidates to authenticated;

-- ---------------------------------------------------------------------------
-- 3. ทำไมยังต้องเหลือสามคอลัมน์นี้ไว้
-- ---------------------------------------------------------------------------
-- `app/(app)/shortlists/page.tsx` เป็น client component และ select ซ้อนผ่าน anon key:
--
--   .select('id, name, shortlist_candidates(candidate_id, candidates(id, full_name, headline))')
--
-- ถ้าตัดสิทธิ์อ่านทิ้งทั้งหมด PostgREST จะคืน null ให้ resource ที่ซ้อนอยู่
-- **โดยไม่ error** หน้า Shortlist จึงจะแสดงรายการที่ไม่มีชื่อผู้สมัคร ซึ่งเป็นอาการ
-- ที่หาสาเหตุยากมาก สามคอลัมน์นี้คือชุดที่เล็กที่สุดที่ทำให้หน้านั้นยังทำงาน
--
-- ชื่อกับตำแหน่งย่อไม่ใช่ข้อมูลที่ปกปิดจากผู้ใช้ที่ล็อกอินอยู่แล้ว — การค้นหาแสดง
-- ทั้งสองอย่างให้ทุกคนเห็นตามปกติ สิ่งที่ปิดไปคืออีเมล, LinkedIn URL, summary,
-- raw_data และความสามารถในการดูดทั้งตารางในคำขอเดียว

-- ---------------------------------------------------------------------------
-- 4. สิ่งที่ไม่กระทบ
-- ---------------------------------------------------------------------------
-- - ทุก route ของแอปใช้ service-role client ซึ่ง bypass ทั้ง RLS และ column grant
-- - RPC `match_candidates` / `match_candidates_filtered` / `match_jobs` /
--   `duplicate_candidate_names` ถูกเรียกจากฝั่งเซิร์ฟเวอร์ด้วย service-role เท่านั้น
--   (ตรวจแล้ว: ไม่มี client component ไหนเรียก .rpc())
-- - ตารางลูก education / experience / skills / candidate_skills เปิด RLS ไว้โดย
--   ไม่มี policy อยู่แล้ว = ปฏิเสธหมด ไม่ต้องแก้อะไร
--
-- **ระวัง:** ถ้ามีใครรัน `grant all on all tables in schema public to authenticated`
-- ในอนาคต (เป็นคำสั่งที่คนชอบวางตามคู่มือ) สิทธิ์เต็มจะกลับมาและช่องนี้จะเปิดใหม่
