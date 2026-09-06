import { buildAssessPrompt } from './assess'

test('prompt มีจำนวนปีประสบการณ์เป็นตัวเลขสำเร็จ', () => {
  // โมเดลบวกลบวันที่พลาดบ่อย ระบบมี computeYearsExperience อยู่แล้ว
  // การส่งตัวเลขที่คำนวณแล้วเข้าไปถูกและถูกกว่าการให้โมเดลคิดเอง
  const p = buildAssessPrompt({ full_name: 'Somchai Jaidee' }, 7)
  expect(p).toContain('7')
  expect(p).toMatch(/ประสบการณ์/)
})

test('prompt มีผลการเรียนเมื่อมีในโปรไฟล์', () => {
  const p = buildAssessPrompt(
    { full_name: 'Somchai Jaidee', education: [{ institution: 'X', gpa: '3.45' }] },
    0
  )
  expect(p).toContain('3.45')
})

test('prompt สั่งให้ตอบเป็นไทยและอ้างอิงเฉพาะข้อมูลที่มี', () => {
  const p = buildAssessPrompt({ full_name: 'Somchai Jaidee' }, 0)
  expect(p).toContain('ภาษาไทย')
  expect(p).toContain('ห้ามสมมติ')
})
