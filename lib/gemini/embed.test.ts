import { vi } from 'vitest'

vi.mock('./client', () => ({
  getGemini: () => ({
    models: {
      embedContent: async () => ({ embeddings: [{ values: new Array(768).fill(0.1) }] }),
    },
  }),
}))

import { embedText } from './embed'

test('embedText returns 768-dim vector', async () => {
  const v = await embedText('hello')
  expect(v).toHaveLength(768)
})
