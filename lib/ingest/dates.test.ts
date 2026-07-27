import { toIsoDate } from './normalize'

test('coerces year-only and year-month to ISO YYYY-MM-DD', () => {
  expect(toIsoDate('2019')).toBe('2019-01-01')
  expect(toIsoDate('2019-05')).toBe('2019-05-01')
  expect(toIsoDate('2019-05-20')).toBe('2019-05-20')
})

test('returns null for empty or unparseable input', () => {
  expect(toIsoDate(null)).toBeNull()
  expect(toIsoDate(undefined)).toBeNull()
  expect(toIsoDate('')).toBeNull()
  expect(toIsoDate('not a date')).toBeNull()
})
