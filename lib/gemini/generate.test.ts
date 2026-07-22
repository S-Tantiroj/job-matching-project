import { vi } from 'vitest'

vi.mock('./client', () => ({
  getGemini: () => ({
    models: {
      generateContent: async () => ({
        text: '[{"full_name":"สมชาย","education":[{"institution":"MIT","country":"USA"}],"skills":["Python"]}]',
      }),
    },
  }),
}))

import { generateThaiCandidates } from './generate'

test('generateThaiCandidates tags each profile source=synthetic', async () => {
  const r = await generateThaiCandidates(1)
  expect(r[0].source).toBe('synthetic')
  expect(r[0].full_name).toBe('สมชาย')
})
