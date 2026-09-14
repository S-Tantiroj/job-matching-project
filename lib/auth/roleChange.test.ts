import { checkRoleChange, ROLE_VALUES } from './roleChange'

const ADMIN = 'admin-uuid-1'
const OTHER = 'other-uuid-2'

// ---------------------------------------------------------------------------
// กฎข้อเดียวที่ทั้งไฟล์นี้มีอยู่เพื่อมัน: แอดมินลดสิทธิ์ตัวเองไม่ได้
//
// ถ้าแอดมินคนสุดท้ายกดลดสิทธิ์ตัวเอง ระบบจะไม่เหลือใครที่ตั้งแอดมินได้อีกเลย
// กู้ได้ทางเดียวคือเปิด Supabase SQL editor ซึ่งคนที่ไม่ใช่ผู้พัฒนาทำไม่ได้
// **เป็นความผิดพลาดหนึ่งคลิกที่กู้ในแอปไม่ได้**
// ---------------------------------------------------------------------------

test('ปฏิเสธการลดสิทธิ์ตัวเองเป็น member', () => {
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: ADMIN, nextRole: 'member' })
  expect(r.ok).toBe(false)
})

test('ปฏิเสธการลดสิทธิ์ตัวเองเป็น data_manager ด้วย', () => {
  // ไม่ใช่แค่ member — ระดับไหนที่ไม่ใช่ admin ก็ทำให้เสียสิทธิ์ตั้งแอดมินเหมือนกัน
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: ADMIN, nextRole: 'data_manager' })
  expect(r.ok).toBe(false)
})

test('เหตุผลที่คืนมาบอกว่าทำไม ไม่ใช่แค่ว่าไม่ผ่าน', () => {
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: ADMIN, nextRole: 'member' })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.reason).toContain('ตัวเอง')
})

test('ตั้งตัวเองเป็น admin ซ้ำได้ ไม่ใช่การลดสิทธิ์', () => {
  // กดเลือกค่าเดิมไม่ควรถูกปฏิเสธ ไม่งั้นผู้ใช้จะงงว่าทำอะไรผิด
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: ADMIN, nextRole: 'admin' })
  expect(r.ok).toBe(true)
})

test('ลดสิทธิ์คนอื่นได้ตามปกติ', () => {
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: OTHER, nextRole: 'member' })
  expect(r.ok).toBe(true)
})

test('เทียบ id แบบตรงตัว ไม่ใช่ substring', () => {
  // id ที่เป็นคำนำหน้าของอีก id ต้องไม่ถูกนับว่าเป็นคนเดียวกัน
  const r = checkRoleChange({ actorId: 'abc', targetUserId: 'abcd', nextRole: 'member' })
  expect(r.ok).toBe(true)
})

// ---------------------------------------------------------------------------
// ตรวจรูปแบบข้อมูลเข้า — ย้ายมาจาก route เพื่อให้ทดสอบได้โดยไม่ต้องยิง HTTP
// ---------------------------------------------------------------------------

test('ปฏิเสธ role ที่ไม่รู้จัก', () => {
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: OTHER, nextRole: 'superuser' })
  expect(r.ok).toBe(false)
})

test('ปฏิเสธเมื่อไม่มี targetUserId', () => {
  expect(checkRoleChange({ actorId: ADMIN, targetUserId: '', nextRole: 'member' }).ok).toBe(false)
  expect(checkRoleChange({ actorId: ADMIN, targetUserId: '   ', nextRole: 'member' }).ok).toBe(false)
})

test('คืน role ที่ผ่านการตรวจแล้วออกมาด้วย ผู้เรียกจะได้ไม่ cast เอง', () => {
  const r = checkRoleChange({ actorId: ADMIN, targetUserId: OTHER, nextRole: 'data_manager' })
  expect(r.ok).toBe(true)
  if (r.ok) expect(r.role).toBe('data_manager')
})

// เทสต์ที่ตรึงค่าไว้ — ลูปข้างบนจับ "รายการ role ผิด" ไม่ได้
// (ค่านี้ต้องตรงกับ enum `user_role` ในฐานข้อมูล ซึ่งอยู่นอกรีโป)
test('ROLE_VALUES ตรงกับ enum ในฐานข้อมูลเป๊ะ', () => {
  expect(ROLE_VALUES).toEqual(['admin', 'data_manager', 'member'])
})
