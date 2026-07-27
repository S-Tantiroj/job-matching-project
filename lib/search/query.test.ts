import { vi } from 'vitest'

let rpcArgs: any = null
let rpcData: any[] = [ { id: 'c1', similarity: 0.92 }, { id: 'c2', similarity: 0.71 } ]
let candRows: any[] = [ { id: 'c1', full_name: 'A', headline: 'X' }, { id: 'c2', full_name: 'B', headline: 'Y' } ]

vi.mock('@/lib/gemini/embed', () => ({ embedText: async () => new Array(768).fill(0.1) }))
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (_name: string, args: any) => {
      rpcArgs = args
      return { data: rpcData }
    },
    from: () => ({
      select: () => ({
        in: () => ({ data: candRows }),
      }),
    }),
  }),
}))

import { searchCandidates } from './query'

test('maps chip filters to RPC params and normalizes country values', async () => {
  rpcData = [ { id: 'c1', similarity: 0.92 }, { id: 'c2', similarity: 0.71 } ]
  candRows = [ { id: 'c1', full_name: 'A', headline: 'X' }, { id: 'c2', full_name: 'B', headline: 'Y' } ]
  const r = await searchCandidates('data scientist', {
    skills: ['Python'],
    educationAbroad: { countries: ['USA'] },
    minYears: 3,
  })
  expect(rpcArgs.p_skills).toEqual(['Python'])
  expect(rpcArgs.p_countries).toEqual(['United States'])
  expect(rpcArgs.p_min_years).toBe(3)
  expect(rpcArgs.p_any_foreign).toBe(false)
  expect(r.map((x) => x.id)).toEqual(['c1', 'c2'])
  expect(r[0].score).toBe(92)
  expect(r[1].score).toBe(71)
})

test('passes nulls / false when no filters given', async () => {
  await searchCandidates('anyone', {})
  expect(rpcArgs.p_skills).toBeNull()
  expect(rpcArgs.p_countries).toBeNull()
  expect(rpcArgs.p_min_years).toBeNull()
  expect(rpcArgs.p_field_or_degree).toBeNull()
  expect(rpcArgs.p_any_foreign).toBe(false)
})

test('clamps negative similarity to 0 and sorts by score descending', async () => {
  rpcData = [ { id: 'c3', similarity: -0.05 }, { id: 'c4', similarity: 0.5 } ]
  candRows = [ { id: 'c3', full_name: 'C', headline: 'Z' }, { id: 'c4', full_name: 'D', headline: 'W' } ]
  const r = await searchCandidates('anyone', {})
  expect(r.map((x) => x.id)).toEqual(['c4', 'c3'])
  expect(r[0].score).toBe(50)
  expect(r[1].score).toBe(0)
})
