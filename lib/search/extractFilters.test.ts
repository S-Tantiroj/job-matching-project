import { vi } from 'vitest'

vi.mock('@/lib/gemini/client', () => ({
  getGemini: () => ({
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          semanticQuery: 'data scientist machine learning',
          filters: {
            skills: ['Python'],
            educationAbroad: { countries: ['USA'] },
            minYears: 3,
          },
        }),
      }),
    },
  }),
}))

import { extractSearchIntent } from './extractFilters'

test('parses the LLM JSON into semanticQuery + filters', async () => {
  const out = await extractSearchIntent('data scientist in Python who studied in the US, 3+ years')
  expect(out.semanticQuery).toBe('data scientist machine learning')
  expect(out.filters.skills).toEqual(['Python'])
  expect(out.filters.educationAbroad).toEqual({ countries: ['USA'] })
  expect(out.filters.minYears).toBe(3)
})
