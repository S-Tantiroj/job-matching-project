import { vi } from 'vitest'

const upsertMock = vi.fn(async () => ({ id: 'job1', updated: false }))
vi.mock('@/lib/jobs/upsert', () => ({ upsertJob: (...a: any[]) => upsertMock(...a) }))
vi.mock('@/lib/auth/session', () => ({
  getSession: async () => ({ userId: 'u1', role: 'member' }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/jobs', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('creates a job from a valid body', async () => {
  const res = await post({ title: 'Data Scientist', description: 'Build models' })
  const json = await res.json()
  expect(json.id).toBe('job1')
})

test('rejects a body missing title or description', async () => {
  const res = await post({ title: 'No description' })
  expect(res.status).toBe(400)
})
