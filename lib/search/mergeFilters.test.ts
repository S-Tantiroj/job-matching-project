import { mergeAiFilters, reconcileAfterUserEdit, NO_AI_FILTERS } from './mergeFilters'

test('ตัวกรองที่ผู้ใช้ตั้งเองไม่หายเมื่อ AI สกัดชุดใหม่มา', () => {
  // นี่คือเหตุผลทั้งหมดของไฟล์นี้ — ชิปแสดงตั้งแต่เปิดหน้า ผู้ใช้ตั้งไว้ก่อนกดค้นหาได้
  const { filters } = mergeAiFilters(
    { skills: ['Figma'] },
    NO_AI_FILTERS,
    { skills: ['Python'], minYears: 3 }
  )
  expect(filters.skills).toEqual(['Figma', 'Python'])
  expect(filters.minYears).toBe(3)
})

test('ชิปที่ AI ใส่ไว้รอบก่อนถูกถอดออก ไม่สะสมข้ามคำค้นหา', () => {
  // ค้น "data scientist Python" แล้วค้นใหม่ว่า "graphic designer"
  // ถ้า Python ยังค้างอยู่ มันจะกรองนักออกแบบทิ้งหมดโดยผู้ใช้ไม่รู้ว่าเพราะอะไร
  const first = mergeAiFilters({}, NO_AI_FILTERS, { skills: ['Python'] })
  expect(first.ai.skills).toEqual(['Python'])

  const second = mergeAiFilters(first.filters, first.ai, { skills: ['Figma'] })
  expect(second.filters.skills).toEqual(['Figma'])
})

test('ถอดเฉพาะของ AI ของผู้ใช้อยู่ครบ', () => {
  const first = mergeAiFilters({ skills: ['SQL'] }, NO_AI_FILTERS, { skills: ['Python'] })
  const second = mergeAiFilters(first.filters, first.ai, { skills: ['Figma'] })
  expect(second.filters.skills).toEqual(['SQL', 'Figma'])
})

test('ค่าซ้ำไม่เกิดชิปซ้ำ และไม่สนตัวพิมพ์', () => {
  // AI คืน "Python" ส่วนผู้ใช้พิมพ์ "python" — สองชิปที่ดูเหมือนกันแต่ลบทีละอัน
  // เป็นอาการที่อธิบายให้ผู้ใช้ไม่ได้
  const { filters } = mergeAiFilters({ skills: ['python'] }, NO_AI_FILTERS, { skills: ['Python'] })
  expect(filters.skills).toEqual(['python'])
})

test('ค่าที่ผู้ใช้พิมพ์เองแม้ AI เสนอมาด้วย ยังนับเป็นของผู้ใช้', () => {
  // ถ้านับเป็นของ AI รอบถัดไปจะถอดทิ้ง ทั้งที่ผู้ใช้พิมพ์มากับมือ
  const first = mergeAiFilters({ skills: ['Python'] }, NO_AI_FILTERS, { skills: ['Python'] })
  expect(first.ai.skills).toEqual([])
  const second = mergeAiFilters(first.filters, first.ai, { skills: ['Figma'] })
  expect(second.filters.skills).toEqual(['Python', 'Figma'])
})

test('จำนวนปีที่ผู้ใช้ตั้งเอง AI ทับไม่ได้', () => {
  const { filters, ai } = mergeAiFilters({ minYears: 8 }, NO_AI_FILTERS, { minYears: 3 })
  expect(filters.minYears).toBe(8)
  expect(ai.minYears).toBe(false)
})

test('จำนวนปีที่ AI ตั้งไว้เอง อัปเดตได้ในรอบถัดไป', () => {
  const first = mergeAiFilters({}, NO_AI_FILTERS, { minYears: 3 })
  expect(first.ai.minYears).toBe(true)
  const second = mergeAiFilters(first.filters, first.ai, { minYears: 5 })
  expect(second.filters.minYears).toBe(5)
})

test('คำค้นหาใหม่ที่ไม่พูดถึงจำนวนปี ล้างจำนวนปีที่ AI เคยตั้งไว้', () => {
  const first = mergeAiFilters({}, NO_AI_FILTERS, { minYears: 3 })
  const second = mergeAiFilters(first.filters, first.ai, {})
  expect(second.filters.minYears).toBeUndefined()
})

test('รายการว่างคืน undefined ไม่ใช่ []', () => {
  // lib/search/query.ts เช็ค `?.length` อยู่แล้วจึงไม่พัง แต่ CoverageStrip และ
  // การเทียบ payload จะอ่านง่ายกว่าถ้ารูปร่างเหมือนที่ AI คืนมาตรงๆ
  const { filters } = mergeAiFilters({}, NO_AI_FILTERS, {})
  expect(filters.skills).toBeUndefined()
  expect(filters.fieldOrDegree).toBeUndefined()
  expect(filters.minYears).toBeUndefined()
})

test('สาขา/ปริญญาทำงานเหมือนสกิลทุกอย่าง', () => {
  const first = mergeAiFilters(
    { fieldOrDegree: ['Design'] },
    NO_AI_FILTERS,
    { fieldOrDegree: ['Computer Science'] }
  )
  expect(first.filters.fieldOrDegree).toEqual(['Design', 'Computer Science'])
  const second = mergeAiFilters(first.filters, first.ai, { fieldOrDegree: ['Statistics'] })
  expect(second.filters.fieldOrDegree).toEqual(['Design', 'Statistics'])
})

test('ผู้ใช้ลบชิปของ AI แล้ว ชิปนั้นหลุดจากบัญชีของ AI', () => {
  const first = mergeAiFilters({}, NO_AI_FILTERS, { skills: ['Python', 'SQL'] })
  const next = { ...first.filters, skills: ['SQL'] }
  const ai = reconcileAfterUserEdit(first.filters, next, first.ai)
  expect(ai.skills).toEqual(['SQL'])
})

test('ผู้ใช้พิมพ์ชิปที่ AI เคยใส่กลับเข้ามาเอง มันกลายเป็นของผู้ใช้', () => {
  // ลบ Python ที่ AI ใส่ แล้วพิมพ์ Python กลับเข้ามาเอง = ตั้งใจจะเก็บไว้
  // รอบค้นหาถัดไปห้ามถอดมันทิ้ง
  const first = mergeAiFilters({}, NO_AI_FILTERS, { skills: ['Python'] })
  let ai = reconcileAfterUserEdit(first.filters, { skills: [] }, first.ai)
  ai = reconcileAfterUserEdit({ skills: [] }, { skills: ['Python'] }, ai)
  expect(ai.skills).toEqual([])

  const second = mergeAiFilters({ skills: ['Python'] }, ai, { skills: ['Figma'] })
  expect(second.filters.skills).toEqual(['Python', 'Figma'])
})

test('ผู้ใช้แก้จำนวนปีที่ AI ตั้งไว้ ค่านั้นกลายเป็นของผู้ใช้', () => {
  const first = mergeAiFilters({}, NO_AI_FILTERS, { minYears: 3 })
  const ai = reconcileAfterUserEdit(first.filters, { minYears: 7 }, first.ai)
  expect(ai.minYears).toBe(false)

  const second = mergeAiFilters({ minYears: 7 }, ai, { minYears: 2 })
  expect(second.filters.minYears).toBe(7)
})

test('ผู้ใช้แก้ชิปโดยไม่แตะจำนวนปี ค่านั้นยังเป็นของ AI', () => {
  const first = mergeAiFilters({}, NO_AI_FILTERS, { skills: ['Python'], minYears: 3 })
  const next = { ...first.filters, skills: [] }
  const ai = reconcileAfterUserEdit(first.filters, next, first.ai)
  expect(ai.minYears).toBe(true)
})
