import { normalizeAssessment } from './assessmentShape'

test('a complete assessment passes through', () => {
  expect(
    normalizeAssessment({
      strengths: ['มีประสบการณ์ Python'],
      weaknesses: ['ยังไม่มีประสบการณ์ทีมใหญ่'],
      development: ['เรียน SQL เพิ่ม'],
      summary: 'โดยรวมเหมาะกับสายข้อมูล',
    })
  ).toEqual({
    strengths: ['มีประสบการณ์ Python'],
    weaknesses: ['ยังไม่มีประสบการณ์ทีมใหญ่'],
    development: ['เรียน SQL เพิ่ม'],
    summary: 'โดยรวมเหมาะกับสายข้อมูล',
  })
})

test('missing arrays become empty arrays as long as something remains', () => {
  expect(normalizeAssessment({ summary: 'ภาพรวม' })).toEqual({
    strengths: [],
    weaknesses: [],
    development: [],
    summary: 'ภาพรวม',
  })
})

test('blank and non-string array entries are dropped', () => {
  const r = normalizeAssessment({ strengths: ['ดี', '', '   ', null, 5], summary: 'x' })
  expect(r?.strengths).toEqual(['ดี', '5'])
})

test('a non-array in an array field becomes an empty array', () => {
  const r = normalizeAssessment({ strengths: 'ไม่ใช่ array', summary: 'x' })
  expect(r?.strengths).toEqual([])
})

test('completely empty content returns null', () => {
  // Gemini parse ผ่านแต่ไม่ได้เนื้อหาอะไรเลย ต้องถือว่าใช้ไม่ได้
  expect(normalizeAssessment({})).toBeNull()
  expect(normalizeAssessment({ strengths: [], weaknesses: [], development: [], summary: '   ' })).toBeNull()
})

test('non-object input returns null', () => {
  expect(normalizeAssessment(null)).toBeNull()
  expect(normalizeAssessment(undefined)).toBeNull()
  expect(normalizeAssessment('a string')).toBeNull()
  expect(normalizeAssessment(42)).toBeNull()
})
