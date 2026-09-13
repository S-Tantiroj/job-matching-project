import { buildCsvTemplate, TEMPLATE_COLUMNS } from './csvTemplate'
import { parseLinkedInCsv, isKnownColumn } from './linkedin'
import { classifyRow } from './classify'

// ---------------------------------------------------------------------------
// เทสต์ที่ทำให้เทมเพลตนี้คุ้มค่าที่จะมี: ป้อนมันเข้า parser ตัวจริง
//
// CLAUDE.md บันทึกไว้ว่า KNOWN_COLUMNS ต้องดูแลด้วยมือ และเทสต์ยืนยันไม่ได้ว่า
// รายชื่อตรงกับที่ parser ใช้จริงโดยไม่เขียน parser ซ้ำ — เทมเพลตปิดช่องนั้นได้
// เพราะมันเดินทางผ่าน parseLinkedInCsv ตัวจริง ไม่ใช่สำเนา
// ---------------------------------------------------------------------------

test('the template parses into exactly one candidate', () => {
  const rows = parseLinkedInCsv(buildCsvTemplate())
  expect(rows).toHaveLength(1)
})

test('the example row satisfies all four fields classifyRow requires', () => {
  // นี่คือเหตุผลทั้งหมดที่เทมเพลตมีอยู่ — เพื่อให้แถวที่คนกรอกเองเข้า candidates
  // ได้จริง ไม่ใช่ตกคิวรอตรวจทุกแถวเหมือนข้อมูลที่ได้จาก X-ray เปล่าๆ
  const [row] = parseLinkedInCsv(buildCsvTemplate())
  expect(classifyRow(row)).toEqual([])
})

test('every template column is one the parser actually reads', () => {
  // คอลัมน์ที่ parser ไม่อ่าน = ช่องที่หลอกให้คนกรอกแล้วค่าหายเงียบๆ
  const unread = TEMPLATE_COLUMNS.filter((c) => !isKnownColumn(c))
  expect(unread).toEqual([])
})

test('the example row fills every column it declares', () => {
  const [header, example] = buildCsvTemplate().trim().split('\n')
  expect(header.split(',').length).toBe(TEMPLATE_COLUMNS.length)
  // ช่องว่างในตัวอย่างสอนให้คนคิดว่าฟิลด์นั้นไม่ต้องกรอก
  expect(example).not.toContain(',,')
  expect(example.endsWith(',')).toBe(false)
})

// ---------------------------------------------------------------------------
// การหนีอักขระของ CSV
// ---------------------------------------------------------------------------

test('quotes a value containing a comma so it stays one field', () => {
  const [row] = parseLinkedInCsv(buildCsvTemplate())
  // "Bangkok, Thailand" ต้องมาถึงเป็นค่าเดียว ไม่ใช่สองคอลัมน์
  expect(row.location).toBe('Bangkok, Thailand')
  // และคอลัมน์หลังจากนั้นต้องไม่เลื่อน — ถ้าเลื่อน ค่านี้จะเป็นของช่องอื่น
  expect(row.experience?.[0].title).toBe('Financial Analyst')
  expect(row.professional_email).toBe('somchai@example.com')
})

test('the parsed row carries the values a human would recognise', () => {
  const [row] = parseLinkedInCsv(buildCsvTemplate())
  expect(row.linkedin_url).toContain('linkedin.com/in/')
  expect(row.headline).toBeTruthy()
  expect(row.education?.length).toBeGreaterThanOrEqual(1)
  expect(row.experience?.length).toBeGreaterThanOrEqual(1)
  expect(row.skills?.length).toBeGreaterThanOrEqual(2)
})

test('date ranges in the example actually parse into years', () => {
  // รูปแบบวันที่ที่ parseLinkedInDateRange อ่านไม่ออกจะกลายเป็น null เงียบๆ
  // แล้ว computeYearsExperience ได้ 0 ซึ่งหลุดตัวกรองประสบการณ์ทุกครั้ง
  const [row] = parseLinkedInCsv(buildCsvTemplate())
  expect(row.experience?.[0].start_date).toBeTruthy()
  expect(row.education?.[0].end_year).toBeGreaterThan(1900)
})

// ---------------------------------------------------------------------------
// ตัวอย่างต้องเป็นคนสมมติ
// ---------------------------------------------------------------------------

test('the example profile URL is obviously fictional', () => {
  // ห้ามใส่ URL ของคนจริงในไฟล์ที่ commit — ผู้ใช้จะเปิดตามไปหาคนที่ไม่ได้ยินยอม
  expect(buildCsvTemplate()).toContain('example-not-a-real-person')
})
