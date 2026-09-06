import { CONTACT_EMAIL, CONTACT_IS_PLACEHOLDER } from './contact'

test('อีเมลติดต่อไม่ใช่ค่า placeholder', () => {
  // ดักการ deploy ทั้งที่ยังไม่ได้ใส่อีเมลจริง ซึ่งทำให้หน้า help และหน้าเอกสาร
  // ทางกฎหมายบอกช่องทางที่ไม่มีอยู่ คนที่เขียนไปหาจะรอคำตอบที่ไม่มีวันมา
  expect(CONTACT_IS_PLACEHOLDER).toBe(false)
  expect(CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
})
