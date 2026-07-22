import { vi } from 'vitest'

vi.mock('./client', () => ({
  getGemini: () => ({
    models: {
      generateContent: async () => ({
        text: '{"full_name":"สมชาย","skills":["Python"],"education":[{"institution":"MIT","country":"USA"}]}',
      }),
    },
  }),
}))

import { parseResume } from './parse'

test('parseResume returns structured CandidateInput tagged source=upload', async () => {
  const r = await parseResume('resume text here')
  expect(r.full_name).toBe('สมชาย')
  expect(r.source).toBe('upload')
  expect(r.raw).toBe('resume text here')
  expect(r.skills).toEqual(['Python'])
})
