import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { APP_NAME, APP_VERSION, PACKAGE_NAME, versionLabel } from './version'

// vitest รันจากรากโปรเจกต์เสมอ (vitest.config.ts อยู่ที่นั่น)
const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

// ---------------------------------------------------------------------------
// เทสต์สองข้อแรกคือเหตุผลทั้งหมดที่ไฟล์นี้มีอยู่
//
// `lib/version.ts` เขียนค่าไว้ตรงๆ เพื่อไม่ให้ package.json ทั้งไฟล์ถูกลากเข้า
// bundle ฝั่งเบราว์เซอร์ — ราคาที่จ่ายคือมีค่าอยู่สองที่ที่ต้องตรงกัน
// **เลขเวอร์ชันที่ผิดจากของจริงแย่กว่าไม่แสดงเลย** เพราะคนอ่านเชื่อทันที
// ---------------------------------------------------------------------------

test('APP_VERSION ตรงกับ version ใน package.json', () => {
  expect(APP_VERSION).toBe(pkg.version)
})

test('PACKAGE_NAME ตรงกับ name ใน package.json', () => {
  expect(PACKAGE_NAME).toBe(pkg.name)
})

// เทสต์ที่ตรึงค่าไว้ — สองข้อข้างบนจับ "ทั้งสองที่ผิดพร้อมกัน" ไม่ได้
// (เช่น เผลอ bump package.json เป็น 2.0.0 แล้วแก้ version.ts ตาม)
test('เวอร์ชันที่ส่งมอบคือ 1.0.0', () => {
  expect(APP_VERSION).toBe('1.0.0')
})

test('ชื่อที่แสดงคือ Skouth ตัว S ใหญ่ ส่วนชื่อแพ็กเกจเป็นตัวเล็กตามกติกาของ npm', () => {
  expect(APP_NAME).toBe('Skouth')
  expect(PACKAGE_NAME).toBe(APP_NAME.toLowerCase())
})

test('versionLabel อ่านรู้เรื่องและมี v นำหน้าตัวเลข', () => {
  expect(versionLabel()).toBe('Skouth v1.0.0')
})

test('เวอร์ชันเป็นรูปแบบ semver สามส่วน', () => {
  // "1.0" หรือ "v1.0.0" จะทำให้ npm และเครื่องมือ CI ตีความไม่ตรงกัน
  expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})
