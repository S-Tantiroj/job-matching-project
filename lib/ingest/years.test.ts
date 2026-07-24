import { computeYearsExperience } from './normalize'

test('sums durations across roles, rounding to whole years', () => {
  const years = computeYearsExperience([
    { start_date: '2018-01-01', end_date: '2021-01-01' }, // 3y
    { start_date: '2021-01-01', end_date: '2023-01-01' }, // 2y
  ])
  expect(years).toBe(5)
})

test('ignores rows with no start date and inverted ranges', () => {
  const years = computeYearsExperience([
    { end_date: '2021-01-01' },
    { start_date: '2023-01-01', end_date: '2020-01-01' },
    { start_date: '2019-01-01', end_date: '2021-01-01' }, // 2y
  ])
  expect(years).toBe(2)
})

test('returns 0 for empty input', () => {
  expect(computeYearsExperience([])).toBe(0)
})
