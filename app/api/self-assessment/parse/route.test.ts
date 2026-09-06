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
  // ต้องตรวจตำแหน่งของการ**เรียก**ฟังก์ชัน ไม่ใช่ที่ import เท่านั้น
  // เดิมเทสต์ดูแค่ว่า 'getSession' ปรากฏก่อน 'parsePdfProfile' ในไฟล์
  // แต่ทั้งสองชื่อมักอยู่ที่ import statement ด้านบนเสมอ ทำให้เทสต์ผ่านโดยบังเอิญ
  // แม้ว่าจริงๆ เรียก parsePdfProfile ก่อนตรวจ session — เทสต์ที่ดีต้องจับขัดนั้นได้
  const src = readFileSync('app/api/self-assessment/parse/route.ts', 'utf8')
  const getSessionCall = src.indexOf('await getSession()')
  const parsePdfCall = src.indexOf('await parsePdfProfile(')
  expect(getSessionCall).toBeGreaterThan(-1) // ต้องมี call ตรงนี้
  expect(parsePdfCall).toBeGreaterThan(-1) // ต้องมี call ตรงนี้
  expect(getSessionCall).toBeLessThan(parsePdfCall) // getSession ต้องมาก่อน
})
