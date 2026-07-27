import { vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ userId: 'u1', role: 'member' }) }))
vi.mock('@/lib/search/extractFilters', () => ({
  extractSearchIntent: async () => ({ semanticQuery: 'data scientist', filters: { skills: ['Python'] } }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/search/parse', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('returns extracted intent for a valid query', async () => {
  const res = await post({ query: 'data scientist in python' })
  const json = await res.json()
  expect(json.semanticQuery).toBe('data scientist')
  expect(json.filters.skills).toEqual(['Python'])
})

test('rejects a missing query', async () => {
  const res = await post({})
  expect(res.status).toBe(400)
})
