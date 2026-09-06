import { readFileSync } from 'node:fs'

// เทสต์ระดับซอร์ส ไม่ใช่พฤติกรรม — จงใจ
//
// ข้อตกลงของฟีเจอร์นี้คือ "เฟสอ่านไฟล์ต้องไม่เขียนฐานข้อมูล" ซึ่งเป็นข้อตกลงที่
// **ไม่มีอาการให้สังเกตเลยเมื่อมันพัง** ถ้าใครเผลอ insert ตั้งแต่เฟสแรก ระบบจะยัง
// ทำงานถูกทุกอย่างในสายตาผู้ใช้ แต่ประวัติฉบับที่ AI เดามาผิดจะถูกเก็บลงฐานโดยที่
// เจ้าตัวยังไม่ได้รับรอง ซึ่งเป็นสิ่งเดียวที่ขั้นตอนตรวจสอบนี้มีไว้ป้องกัน
//
// การตรวจ import จึงเป็นวิธีที่ตรงที่สุดที่ยังเป็น unit test ได้
test('route อ่านไฟล์ต้องไม่ import supabase server client', () => {
  const src = readFileSync('app/api/self-assessment/parse/route.ts', 'utf8')
  expect(src).not.toMatch(/supabase\/server/)
  expect(src).not.toMatch(/getServerClient/)
})

test('route อ่านไฟล์ต้องตรวจ session ก่อนเรียก Gemini', () => {
  const src = readFileSync('app/api/self-assessment/parse/route.ts', 'utf8')
  expect(src).toMatch(/getSession/)
  expect(src.indexOf('getSession')).toBeLessThan(src.indexOf('parsePdfProfile'))
})
