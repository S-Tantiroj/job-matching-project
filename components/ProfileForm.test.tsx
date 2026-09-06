import { parseSkillInput, fieldToLabel } from './ProfileForm'

test('parseSkillInput splits a normal comma-separated list', () => {
  expect(parseSkillInput('Python, SQL, Machine Learning')).toEqual([
    'Python',
    'SQL',
    'Machine Learning',
  ])
})

test('parseSkillInput trims extra whitespace around entries', () => {
  expect(parseSkillInput('  Python  ,   SQL   ,Machine Learning   ')).toEqual([
    'Python',
    'SQL',
    'Machine Learning',
  ])
})

test('parseSkillInput drops empty entries from doubled commas', () => {
  expect(parseSkillInput('Python,,SQL')).toEqual(['Python', 'SQL'])
})

test('parseSkillInput drops empty entry from a trailing comma', () => {
  expect(parseSkillInput('Python, SQL,')).toEqual(['Python', 'SQL'])
})

test('parseSkillInput returns [] for an empty string', () => {
  expect(parseSkillInput('')).toEqual([])
})

test('parseSkillInput returns [] for a whitespace-only string', () => {
  expect(parseSkillInput('   ')).toEqual([])
})

test('fieldToLabel maps a top-level field name to Thai label', () => {
  expect(fieldToLabel('full_name')).toBe('ชื่อ-นามสกุล')
  expect(fieldToLabel('headline')).toBe('ตำแหน่งย่อ')
  expect(fieldToLabel('summary')).toBe('แนะนำตัวเอง')
})

test('fieldToLabel maps a nested field name with section label', () => {
  expect(fieldToLabel('education.institution')).toBe('การศึกษา › สถาบัน')
  expect(fieldToLabel('experience.title')).toBe('ประสบการณ์ทำงาน › ตำแหน่ง')
  expect(fieldToLabel('experience.start_date')).toBe('ประสบการณ์ทำงาน › วันที่เริ่มต้น')
})

test('fieldToLabel returns empty string for unknown field name', () => {
  expect(fieldToLabel('unknown_field')).toBe('')
  expect(fieldToLabel('unknown.nested.field')).toBe('')
})

test('fieldToLabel returns empty string for missing or undefined field', () => {
  expect(fieldToLabel(undefined)).toBe('')
  expect(fieldToLabel('')).toBe('')
})
