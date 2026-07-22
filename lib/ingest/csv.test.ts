import { parseCsv } from './csv'

test('parseCsv maps columns and splits skills', () => {
  const csv = 'name,skills,uni,country\nสมหญิง,"Python; SQL",Oxford,UK'
  const rows = parseCsv(csv, {
    name: 'full_name',
    skills: 'skills',
    uni: 'edu_institution',
    country: 'edu_country',
  })
  expect(rows[0].full_name).toBe('สมหญิง')
  expect(rows[0].skills).toEqual(['Python', 'SQL'])
  expect(rows[0].education?.[0]).toEqual({ institution: 'Oxford', country: 'UK' })
  expect(rows[0].source).toBe('csv')
})

test('parseCsv skips rows without a mapped full_name', () => {
  const csv = 'name,skills\n,Python\nสมชาย,Go'
  const rows = parseCsv(csv, { name: 'full_name', skills: 'skills' })
  expect(rows).toHaveLength(1)
  expect(rows[0].full_name).toBe('สมชาย')
})
