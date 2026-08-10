-- เพิ่ม role 'data_manager' เข้า enum user_role แบบ additive
-- ต้องรันไฟล์นี้เดี่ยวๆ ให้ commit ก่อน แล้วจึงใช้ค่านี้ได้ — Postgres ไม่อนุญาต
-- ให้ใช้ค่า enum ใหม่ใน transaction เดียวกับที่เพิ่มค่านั้น
alter type user_role add value if not exists 'data_manager';
