-- ลดพื้นผิวของฟังก์ชันใน schema public ตาม Supabase security advisor
--
-- สามเรื่องในไฟล์เดียว เพราะเป็นเรื่องเดียวกัน: ฟังก์ชันที่เปิดให้ role ที่ไม่จำเป็น
-- เรียกได้ และฟังก์ชันที่ไม่ได้ตรึง search_path

-- ---------------------------------------------------------------------------
-- 1. ตรึง search_path ของ RPC ทั้งสี่ตัว
-- ---------------------------------------------------------------------------
-- ฟังก์ชันที่ไม่ตั้ง search_path จะ resolve ชื่อตารางตาม search_path ของผู้เรียก
-- ถ้าผู้เรียกสร้างตารางชื่อ `candidates` ไว้ใน schema ที่มาก่อน public ได้เมื่อไร
-- ฟังก์ชันจะไปอ่านตารางนั้นแทน — ทั้งสี่ตัวเป็น SECURITY INVOKER จึงไม่ถึงขั้น
-- ยกระดับสิทธิ์ แต่ตรึงไว้ก็ไม่เสียอะไรและตัดคำถามนี้ทิ้งไปเลย
--
-- ใส่ pg_temp ไว้ท้ายสุดเสมอตามที่ Postgres แนะนำ กัน temp table บังหน้า
alter function public.match_candidates(vector, integer)
  set search_path = public, pg_temp;
alter function public.match_candidates_filtered(vector, integer, text[], boolean, text[], integer, text[])
  set search_path = public, pg_temp;
alter function public.match_jobs(vector, integer)
  set search_path = public, pg_temp;
alter function public.duplicate_candidate_names()
  set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. ถอน EXECUTE ของ RPC ทั้งสี่จาก role ฝั่งเบราว์เซอร์
-- ---------------------------------------------------------------------------
-- ทั้งสี่ถูกเรียกจากฝั่งเซิร์ฟเวอร์ด้วย service-role client เท่านั้น
-- (`lib/search/query.ts`, `lib/jobs/match.ts`, `lib/self/matchJobs.ts`,
--  `app/(app)/candidates/page.tsx` — ทั้งหมดเป็น server component/module
--  ตรวจแล้วว่าไม่มี client component ไหนเรียก .rpc())
--
-- **ต้องถอนจาก PUBLIC ด้วย** ไม่ใช่แค่ anon/authenticated — ACL เดิมมี `=X/postgres`
-- ซึ่งคือ PUBLIC ถ้าถอนแค่สอง role ที่ระบุชื่อ ทุกคนยังเรียกได้ผ่าน PUBLIC อยู่ดี
revoke execute on function public.match_candidates(vector, integer)
  from public, anon, authenticated;
revoke execute on function public.match_candidates_filtered(vector, integer, text[], boolean, text[], integer, text[])
  from public, anon, authenticated;
revoke execute on function public.match_jobs(vector, integer)
  from public, anon, authenticated;
revoke execute on function public.duplicate_candidate_names()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. ถอน EXECUTE ของ trigger function ที่สร้าง profile ตอนสมัครสมาชิก
-- ---------------------------------------------------------------------------
-- `handle_new_user()` เป็น trigger บน auth.users ไม่ใช่ฟังก์ชันที่ตั้งใจให้ใครเรียก
-- ตรงๆ (PostgREST ไม่เปิด endpoint ให้ฟังก์ชันที่ return trigger อยู่แล้ว จึงยังไม่ใช่
-- ช่องที่ใช้งานได้จริง) แต่ไม่มีเหตุผลที่จะปล่อยสิทธิ์ค้างไว้
--
-- **Postgres ไม่ตรวจสิทธิ์ EXECUTE ตอน trigger ทำงาน** การถอนจึงไม่กระทบการสมัคร
-- สมาชิก แต่เพิ่ม grant ให้ supabase_auth_admin ไว้เป็นกันชนอีกชั้น เพราะ role นี้
-- คือตัวที่ insert ลง auth.users จริง ถ้าสมมติฐานข้างบนผิด อย่างน้อยทางนี้ยังเปิดอยู่
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- ไม่แตะ `is_admin()` โดยตั้งใจ
-- ---------------------------------------------------------------------------
-- advisor เตือนว่า `is_admin()` เป็น SECURITY DEFINER ที่ anon/authenticated เรียกได้
-- **แต่ห้ามถอน** เพราะ RLS policy ของตาราง `profiles` เรียกมันอยู่:
--
--   read own profile: using ((id = auth.uid()) OR is_admin())
--
-- Postgres ประเมิน policy ด้วยสิทธิ์ของผู้ query ถ้า authenticated ไม่มี EXECUTE
-- **การอ่าน `profiles` ทุกครั้งจะ error "permission denied for function is_admin"**
-- ซึ่งพัง `/settings` และ `components/AnalyzePanel.tsx` ที่อ่าน profiles ผ่าน anon key
--
-- และตัวมันเองไม่รั่วอะไร: anon เรียกได้ค่า false เสมอ (auth.uid() เป็น null)
-- ส่วน authenticated ได้รู้สถานะ admin ของตัวเอง ซึ่งอ่านจากแถว profiles ของตัวเอง
-- ได้อยู่แล้ว advisor เตือนตามรูปแบบ ไม่ได้เตือนเพราะมีข้อมูลรั่วจริง
