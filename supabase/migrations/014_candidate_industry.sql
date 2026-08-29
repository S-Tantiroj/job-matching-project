-- industry มาจาก PhantomBuster ทั้งสอง phantom และตรงกับ jobs.category ซึ่งอยู่ใน
-- embedding ฝั่งงานอยู่แล้ว การเก็บไว้จึงทำให้สองฝั่งเทียบกันด้วยคำศัพท์เดียวกันมากขึ้น
-- เพิ่มอย่างเดียว ไม่แตะคอลัมน์หรือตารางเดิม
alter table candidates add column if not exists industry text;
