import { vi } from 'vitest'

vi.mock('./client', () => ({
  getGemini: () => ({
    models: {
      generateContent: async () => ({ text: '{"score":82,"reasoning":"ตรงสกิลหลัก"}' }),
    },
  }),
}))

import { analyzeCandidate } from './analyze'

test('analyzeCandidate returns int score and reasoning', async () => {
  const r = await analyzeCandidate(
    { full_name: 'A', source: 'csv', skills: ['Python'] },
    'Python data scientist'
  )
  expect(r.score).toBe(82)
  expect(typeof r.reasoning).toBe('string')
})

test('analyzeCandidate rounds a float score to an integer', async () => {
  const r = await analyzeCandidate({ full_name: 'A', source: 'csv' }, 'x')
  expect(Number.isInteger(r.score)).toBe(true)
})
