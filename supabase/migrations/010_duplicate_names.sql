-- คืนเฉพาะชื่อที่ปรากฏมากกว่าหนึ่งครั้ง ใช้ติด badge "ชื่อซ้ำ" ในหน้าตารางข้อมูล
-- Additive: เพิ่มฟังก์ชันใหม่ ไม่แตะตารางหรือฟังก์ชันเดิม
create or replace function duplicate_candidate_names()
returns table (full_name text)
language sql stable as $$
  select c.full_name
  from candidates c
  group by c.full_name
  having count(*) > 1;
$$;
