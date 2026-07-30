import { vi } from 'vitest'

let mockText = ''
vi.mock('@/lib/gemini/client', () => ({
  getGemini: () => ({
    models: {
      generateContent: async () => ({ text: mockText }),
    },
  }),
}))

import { extractSearchIntent } from './extractFilters'

test('parses the LLM JSON into semanticQuery + filters', async () => {
  mockText = JSON.stringify({
    semanticQuery: 'data scientist machine learning',
    filters: {
      skills: ['Python'],
      fieldOrDegree: ['Master'],
      minYears: 3,
    },
  })
  const out = await extractSearchIntent('data scientist in Python with a Master, 3+ years')
  expect(out.semanticQuery).toBe('data scientist machine learning')
  expect(out.filters.skills).toEqual(['Python'])
  expect(out.filters.fieldOrDegree).toEqual(['Master'])
  expect(out.filters.minYears).toBe(3)
})

test('falls back to the raw query with empty filters on malformed JSON', async () => {
  mockText = 'sorry, I could not produce JSON'
  const out = await extractSearchIntent('data scientist')
  expect(out.semanticQuery).toBe('data scientist')
  expect(out.filters).toEqual({})
})
