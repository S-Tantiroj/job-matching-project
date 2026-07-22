import { vi } from 'vitest'

vi.mock('@/lib/gemini/embed', () => ({ embedText: async () => new Array(768).fill(0.1) }))
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    rpc: async () => ({
      data: [
        { id: 'c1', similarity: 0.92 },
        { id: 'c2', similarity: 0.71 },
      ],
    }),
    from: () => ({
      select: () => ({
        in: () => ({
          data: [
            { id: 'c1', full_name: 'A', headline: 'X', education: [{ country: 'UK' }] },
            { id: 'c2', full_name: 'B', headline: 'Y', education: [{ country: 'Thailand' }] },
          ],
        }),
      }),
    }),
  }),
}))

import { searchCandidates } from './query'

test('scores from similarity and drops Thailand-only when foreignEduOnly', async () => {
  const r = await searchCandidates('growth marketer UK', { foreignEduOnly: true })
  expect(r).toHaveLength(1)
  expect(r[0].id).toBe('c1')
  expect(r[0].score).toBe(92)
})

test('keeps all and sorts by score desc when no filter', async () => {
  const r = await searchCandidates('anyone', {})
  expect(r.map((x) => x.id)).toEqual(['c1', 'c2'])
  expect(r[0].score).toBe(92)
  expect(r[1].score).toBe(71)
})
