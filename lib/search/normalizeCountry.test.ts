import { normalizeCountry } from './normalizeCountry'

test('canonicalizes common country aliases', () => {
  expect(normalizeCountry('United States')).toBe('USA')
  expect(normalizeCountry('united states of america')).toBe('USA')
  expect(normalizeCountry('U.K.')).toBe('UK')
  expect(normalizeCountry('England')).toBe('UK')
})

test('passes through unmapped values trimmed', () => {
  expect(normalizeCountry('  Japan ')).toBe('Japan')
  expect(normalizeCountry('USA')).toBe('USA')
})
