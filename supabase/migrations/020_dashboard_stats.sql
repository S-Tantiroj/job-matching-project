-- สถิติสำหรับกราฟบน Dashboard: ทักษะที่พบบ่อย และจำนวนผู้สมัครตามแหล่งที่มา
--
-- Additive ทั้งหมด: เพิ่มฟังก์ชันใหม่สองตัว ไม่แตะตารางหรือฟังก์ชันเดิม
--
-- ============================================================================
-- ทำไมต้องนับใน SQL ไม่ใช่ดึงมานับใน JavaScript
-- ============================================================================
-- `candidate_skills` เป็นตารางเชื่อมที่โตเร็วกว่าตารางอื่น — ผู้สมัคร 1 คนมีได้
-- หลายสิบทักษะ ฐานที่มีคนหลักพันจึงมีแถวหลายหมื่น การ `.select('*')` มานับใน
-- server component แปลว่าโหลดทั้งตารางข้ามเครือข่ายทุกครั้งที่มีคนเปิดหน้า Dashboard
-- ซึ่งเป็นหน้าแรกที่ทุกคนเห็นหลังล็อกอิน
--
-- Postgres นับให้ได้ในคำสั่งเดียวและคืนมาแค่ 10 แถว

-- ---------------------------------------------------------------------------
-- 1. ทักษะที่พบบ่อยที่สุด
-- ---------------------------------------------------------------------------
-- นับ "จำนวนผู้สมัครที่มีทักษะนี้" ไม่ใช่จำนวนแถวใน candidate_skills
-- ปกติสองค่านี้เท่ากันเพราะ primary key เป็น (candidate_id, skill_id) ซึ่งกันแถวซ้ำ
-- อยู่แล้ว แต่เขียน distinct ไว้ให้ความหมายชัดจากตัวคำสั่งเอง ไม่ต้องไปไล่ดู
-- นิยามคีย์ของตารางก่อนจะเชื่อตัวเลข
--
-- เรียงตามจำนวนก่อน แล้วตามชื่อ — **การเรียงต้องกำหนดผลได้แน่นอน**
-- ถ้าเรียงด้วยจำนวนอย่างเดียว ทักษะที่มีจำนวนเท่ากันจะสลับที่กันเองทุกครั้งที่
-- รีเฟรช ซึ่งดูเหมือนข้อมูลเปลี่ยนทั้งที่ไม่มีอะไรเปลี่ยน
create or replace function public.top_skills(p_limit int default 10)
returns table (name text, cnt bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select s.name, count(distinct cs.candidate_id) as cnt
  from public.candidate_skills cs
  join public.skills s on s.id = cs.skill_id
  group by s.name
  order by cnt desc, s.name asc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

-- ---------------------------------------------------------------------------
-- 2. จำนวนผู้สมัครแยกตามแหล่งที่มา
-- ---------------------------------------------------------------------------
-- `source` เป็น enum `cand_source` และ NOT NULL จึงไม่มีกรณีค่าว่าง
-- cast เป็น text เพื่อให้ฝั่ง TypeScript รับเป็นสตริงธรรมดา ไม่ต้องรู้จัก enum
--
-- **เรียงตามชื่อแหล่ง ไม่ใช่ตามจำนวน** ต่างจากกราฟทักษะโดยตั้งใจ — แหล่งที่มามี
-- แค่สี่ค่าคงที่ การให้แท่งอยู่ที่เดิมทุกครั้งทำให้เทียบข้ามวันได้ด้วยตา
-- ส่วนอันดับทักษะเป็นสิ่งที่ผู้ใช้อยากรู้จากกราฟอยู่แล้ว จึงเรียงตามจำนวน
create or replace function public.candidate_source_counts()
returns table (source text, cnt bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select c.source::text, count(*) as cnt
  from public.candidates c
  group by c.source
  order by c.source::text asc;
$$;

-- ---------------------------------------------------------------------------
-- 3. เรียกได้เฉพาะ service_role
-- ---------------------------------------------------------------------------
-- ทั้งสองตัวสรุปภาพรวมของฐานข้อมูลทั้งก้อน — จำนวนคนทั้งหมด สัดส่วนที่มาจากการ
-- ดึงอัตโนมัติ และทักษะที่มีในระบบ ซึ่งเป็นข้อมูลที่ไม่ควรเรียกได้ด้วย anon key
-- ที่เป็นค่าสาธารณะ หน้า Dashboard เป็น server component จึงเรียกด้วย
-- service-role client อยู่แล้ว
--
-- **ต้องถอนจาก PUBLIC ด้วยเสมอ** ไม่ใช่แค่ anon กับ authenticated —
-- ACL ตั้งต้นของฟังก์ชันใหม่คือ `=X/postgres` ซึ่งหมายถึง PUBLIC
-- ถอนแค่สอง role ที่ระบุชื่อแล้วทุกคนยังเรียกได้ผ่าน PUBLIC อยู่ดี
-- (บทเรียนจาก migration 017)
revoke execute on function public.top_skills(int) from public, anon, authenticated;
revoke execute on function public.candidate_source_counts() from public, anon, authenticated;

grant execute on function public.top_skills(int) to service_role;
grant execute on function public.candidate_source_counts() to service_role;

-- ---------------------------------------------------------------------------
-- หมายเหตุ: ไม่ต้องมี `extensions` ใน search_path
-- ---------------------------------------------------------------------------
-- ต่างจาก RPC ทั้งสี่ตัวของการค้นหา สองฟังก์ชันนี้ไม่ได้ใช้ตัวดำเนินการของ pgvector
-- (`<=>`) เลย จึงไม่ต้องการ schema `extensions` — ใส่เฉพาะ schema ที่ใช้จริง
-- เพื่อให้ search_path บอกความจริงว่าฟังก์ชันพึ่งพาอะไรบ้าง
