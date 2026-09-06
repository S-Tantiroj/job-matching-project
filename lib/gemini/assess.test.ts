import { buildAssessPrompt } from './assess'

test('prompt มีจำนวนปีประสบการณ์เป็นตัวเลขสำเร็จเมื่อมี start_date ที่ใช้ได้', () => {
  // โมเดลบวกลบวันที่พลาดบ่อย ระบบมี computeYearsExperience อยู่แล้ว
  // การส่งตัวเลขที่คำนวณแล้วเข้าไปถูกและถูกกว่าการให้โมเดลคิดเอง
  const p = buildAssessPrompt(
    { full_name: 'Somchai Jaidee', experience: [{ company: 'Agoda', start_date: '2020-01-01' }] },
    7
  )
  expect(p).toContain('7')
  expect(p).toMatch(/ประสบการณ์/)
  expect(p).not.toMatch(/ไม่ทราบจำนวนปี/)
})

test('prompt บอกว่าไม่ทราบจำนวนปี ไม่ฟันธงว่าเป็น 0 เมื่อไม่มี experience เลย', () => {
  // computeYearsExperience คืน 0 เพราะไม่มีอะไรให้คำนวณ — ต้องไม่ส่ง "0 ปี" เป็นข้อเท็จจริง
  const p = buildAssessPrompt({ full_name: 'Somchai Jaidee' }, 0)
  expect(p).toMatch(/ไม่ทราบจำนวนปี/)
  expect(p).not.toContain('รวมประสบการณ์ทำงานประมาณ')
})

test('prompt บอกว่าไม่ทราบจำนวนปี เมื่อมี experience แต่ไม่มี start_date ที่ใช้ได้เลย', () => {
  // เคสนี้คือช่องโหว่จริง: กรอกเองไม่ใส่วันที่ หรืออัปโหลดแล้ว coerceForReview
  // ทิ้งวันที่ผิดรูปไปเงียบๆ — ทั้งสองทางเหลือ experience ที่ไม่มี start_date
  const p = buildAssessPrompt(
    { full_name: 'Somchai Jaidee', experience: [{ company: 'Agoda', title: 'Dev' }] },
    0
  )
  expect(p).toMatch(/ไม่ทราบจำนวนปี/)
  expect(p).not.toContain('รวมประสบการณ์ทำงานประมาณ')
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
