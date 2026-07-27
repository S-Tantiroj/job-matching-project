import { vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ userId: 'u1', role: 'member' }) }))
vi.mock('@/lib/search/query', () => ({
  searchCandidates: async (sq: string) => [{ id: 'c1', full_name: 'A', headline: 'X', score: 90 }],
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/search', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('returns results for a valid semanticQuery', async () => {
  const res = await post({ semanticQuery: 'data scientist', filters: {} })
  const json = await res.json()
  expect(json[0].id).toBe('c1')
  expect(json[0].score).toBe(90)
})

test('rejects a missing semanticQuery', async () => {
  const res = await post({ filters: {} })
  expect(res.status).toBe(400)
})
