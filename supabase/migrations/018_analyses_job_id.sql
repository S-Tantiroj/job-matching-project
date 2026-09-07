-- ผูกแถวคะแนนกลับไปหางานที่ทำให้เกิดมัน
--
-- เดิม `analyses` คีย์ด้วย (candidate_id, requirement_hash) เท่านั้น โดย hash มาจาก
-- ข้อความความต้องการของงาน ไม่มีอะไรชี้กลับไปหางานเลย ผลคือสองอย่าง:
--
--   1. แก้งานหนึ่งครั้ง คะแนนที่ cache ไว้ทั้งหมดเข้าไม่ถึงอีก (hash เปลี่ยน)
--      แต่แถวยังอยู่ และไม่มีทางค้นเจอเพื่อกวาดทิ้ง
--   2. ลบงานแล้วแถวเหล่านั้นค้างถาวร ไม่มี FK ให้ cascade
--
-- **nullable โดยตั้งใจ** — การให้คะแนนจากหน้าผู้สมัคร (/api/analyze) ไม่มีงานผูกอยู่
-- และหน้าประเมินตัวเองใช้ requirementHash ตรงๆ ไม่ผ่าน scoreCandidateAgainst
--
-- **แถวที่มีอยู่แล้วจะเป็น NULL ตลอดไป** กวาดย้อนหลังไม่ได้เพราะไม่รู้ว่าแถวไหน
-- เคยเป็นของงานไหน ยอมรับข้อจำกัดนี้
alter table public.analyses
  add column job_id uuid references public.jobs(id) on delete cascade;

create index analyses_job_id_idx on public.analyses (job_id);
