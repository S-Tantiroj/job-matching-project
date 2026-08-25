import { vi } from 'vitest'

vi.mock('@/lib/ingest/csv', () => ({
  parseCsv: () => [
    { full_name: 'A', source: 'csv' },
    { full_name: 'B', source: 'csv' },
  ],
}))
vi.mock('@/lib/ingest/linkedin', () => ({
  parseLinkedInCsv: () => [
    { full_name: 'L1', source: 'scraper' },
    { full_name: 'L2', source: 'scraper' },
  ],
}))
const upsertMock = vi.fn(async () => ({ id: 'x', updated: false, suppressed: false }))
vi.mock('@/lib/ingest/upsert', () => ({ upsertCandidate: (...a: any[]) => upsertMock(...a) }))
vi.mock('@/lib/gemini/parse', () => ({
  parseResume: async () => ({ full_name: 'R', source: 'upload' }),
}))
vi.mock('@/lib/auth/session', () => ({
  getSession: async () => ({ userId: 'u1', role: 'member' }),
  // Route now gates on data_manager; these tests exercise ingest parsing/upsert
  // logic, not the permission check, so hasRole is stubbed to always authorize.
  hasRole: () => true,
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/ingest', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('csv ingest imports each parsed row', async () => {
  const res = await post({ type: 'csv', csv: 'a', mapping: {}, userId: 'u1' })
  const json = await res.json()
  expect(json.imported).toBe(2)
  expect(json.updated).toBe(0)
})

test('linkedin ingest imports each parsed row', async () => {
  const res = await post({ type: 'linkedin', csv: 'a' })
  const json = await res.json()
  expect(json.imported).toBe(2)
})

test('upload ingest parses resume then upserts once', async () => {
  const res = await post({ type: 'upload', text: 'resume', userId: 'u1' })
  const json = await res.json()
  expect(json.imported + json.updated).toBe(1)
})

test('rejects unknown type', async () => {
  const res = await post({ type: 'bogus' })
  expect(res.status).toBe(400)
})
