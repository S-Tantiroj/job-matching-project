-- บันทึกกิจกรรม: ใครทำอะไรกับข้อมูลเมื่อไร
--
-- summary ถูกเก็บเป็นข้อความสำเร็จรูป ณ เวลาที่บันทึก ไม่ใช่ join กลับไปหาชื่อทีหลัง
-- เพราะเหตุผลหลักที่ตารางนี้มีอยู่คือการลบ — ถ้าต้อง join กลับไปที่ candidates
-- บันทึกการลบจะกลายเป็นบรรทัดว่างทันทีที่คนถูกลบ ซึ่งทำลายจุดประสงค์ทั้งหมด
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  -- null = ระบบทำเอง (GitHub Actions cron) ไม่ใช่คน
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  -- ไม่มี FK ไป candidates โดยตั้งใจ: แถวที่อ้างถึงต้องอยู่รอดหลังผู้สมัครถูกลบ
  entity_id uuid,
  summary text not null,
  count int not null default 1,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- dashboard อ่านของตัวเอง
create index if not exists activity_log_actor_idx on activity_log (actor_id, created_at desc);
-- หน้าข้อมูลอ่านทั้งหมด และกรอง action ออกบางชนิด (เช่น view)
create index if not exists activity_log_recent_idx on activity_log (created_at desc);
create index if not exists activity_log_action_idx on activity_log (action, created_at desc);

-- เหมือน ingest_runs / pending_candidates / suppressed_profiles:
-- เปิด RLS โดยไม่มี policy = เข้าถึงได้ผ่าน service-role client เท่านั้น
-- ซึ่งทุก route กั้น role ของผู้เรียกไว้ก่อนอยู่แล้ว
alter table activity_log enable row level security;
