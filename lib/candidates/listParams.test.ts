import { parsePage, parseSort, parseAsc, PAGE_SIZE } from './listParams'

test('parsePage accepts positive integers and falls back to 1', () => {
  expect(parsePage('3')).toBe(3)
  expect(parsePage('1')).toBe(1)
  expect(parsePage(undefined)).toBe(1)
  expect(parsePage('')).toBe(1)
  expect(parsePage('0')).toBe(1)
  expect(parsePage('-2')).toBe(1)
  expect(parsePage('abc')).toBe(1)
  expect(parsePage('2.5')).toBe(1)
})

test('parseSort only allows whitelisted columns', () => {
  expect(parseSort('full_name')).toBe('full_name')
  expect(parseSort('years_experience')).toBe('years_experience')
  expect(parseSort('source')).toBe('source')
  expect(parseSort('created_at')).toBe('created_at')
  expect(parseSort('updated_at')).toBe('updated_at')
})

test('parseSort rejects anything outside the whitelist', () => {
  expect(parseSort('embedding')).toBe('updated_at')
  expect(parseSort('id; drop table candidates')).toBe('updated_at')
  expect(parseSort(undefined)).toBe('updated_at')
})

test('parseAsc is true only for the exact string asc', () => {
  expect(parseAsc('asc')).toBe(true)
  expect(parseAsc('desc')).toBe(false)
  expect(parseAsc(undefined)).toBe(false)
  expect(parseAsc('ASC')).toBe(false)
})

test('PAGE_SIZE is 25', () => {
  expect(PAGE_SIZE).toBe(25)
})
