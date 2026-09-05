import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONTACT_EMAIL, CONTACT_IS_PLACEHOLDER } from './contact'
import { UAT_DOC } from './docMeta'

// เทสต์สองข้อนี้ดักความล้มเหลวที่มองไม่เห็นบนเครื่องตัวเอง แต่พังบนโปรดักชัน
// ทั้งคู่ตั้งใจให้ตกไว้ก่อน แล้วผ่านเมื่องานที่เกี่ยวข้องเสร็จจริง

test('ไฟล์ PDF ที่ปุ่มดาวน์โหลดชี้ไป มีอยู่จริงและไม่ว่าง', () => {
  // ลืม commit ไฟล์ = ปุ่มดาวน์โหลด 404 บนโปรดักชัน ทั้งที่บนเครื่องตัวเองยังเปิดได้
  // เพราะไฟล์ยังอยู่ในโฟลเดอร์ public/ ของเครื่องนั้น
  const abs = join(process.cwd(), 'public', UAT_DOC.path.replace(/^\//, ''))
  expect(existsSync(abs)).toBe(true)
  expect(statSync(abs).size).toBeGreaterThan(0)
})

test('อีเมลติดต่อไม่ใช่ค่า placeholder', () => {
  // ดักการ deploy ทั้งที่ยังไม่ได้ใส่อีเมลจริง ซึ่งทำให้หน้า help บอกช่องทาง
  // ที่ไม่มีอยู่ และคนที่เขียนไปหาจะรอคำตอบที่ไม่มีวันมา
  expect(CONTACT_IS_PLACEHOLDER).toBe(false)
  expect(CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
})
