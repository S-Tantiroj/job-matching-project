import { parseLinkedInDateRange } from './linkedinDate'

test('parses year-year ranges', () => {
  expect(parseLinkedInDateRange('2015 - 2019')).toEqual({ start_date: '2015-01-01', end_date: '2019-01-01' })
})

test('parses month-year start with a Present end', () => {
  expect(parseLinkedInDateRange('Jan 2020 - Present')).toEqual({ start_date: '2020-01-01', end_date: null })
})

test('a single value is the start, end null', () => {
  expect(parseLinkedInDateRange('2020')).toEqual({ start_date: '2020-01-01', end_date: null })
})

test('blank or undefined -> both null', () => {
  expect(parseLinkedInDateRange('')).toEqual({ start_date: null, end_date: null })
  expect(parseLinkedInDateRange(undefined)).toEqual({ start_date: null, end_date: null })
})
