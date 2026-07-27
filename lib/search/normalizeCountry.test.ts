import { normalizeCountry } from './normalizeCountry'

test('canonicalizes aliases and short forms to the stored full name', () => {
  expect(normalizeCountry('USA')).toBe('United States')
  expect(normalizeCountry('us')).toBe('United States')
  expect(normalizeCountry('America')).toBe('United States')
  expect(normalizeCountry('U.K.')).toBe('United Kingdom')
  expect(normalizeCountry('England')).toBe('United Kingdom')
})

test('passes through full names and unmapped values trimmed', () => {
  expect(normalizeCountry('United States')).toBe('United States')
  expect(normalizeCountry('United Kingdom')).toBe('United Kingdom')
  expect(normalizeCountry('  Japan ')).toBe('Japan')
})
