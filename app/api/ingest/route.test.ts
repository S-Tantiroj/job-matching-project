import { vi } from 'vitest'

vi.mock('@/lib/ingest/csv', () => ({
  parseCsv: () => [
    { full_name: 'A', source: 'csv' },
    { full_name: 'B', source: 'csv' },
  ],
}))
const upsertMock = vi.fn(async () => ({ id: 'x', updated: false }))
vi.mock('@/lib/ingest/upsert', () => ({ upsertCandidate: (...a: any[]) => upsertMock(...a) }))
vi.mock('@/lib/gemini/parse', () => ({
  parseResume: async () => ({ full_name: 'R', source: 'upload' }),
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

test('upload ingest parses resume then upserts once', async () => {
  const res = await post({ type: 'upload', text: 'resume', userId: 'u1' })
  const json = await res.json()
  expect(json.imported + json.updated).toBe(1)
})

test('rejects unknown type', async () => {
  const res = await post({ type: 'bogus' })
  expect(res.status).toBe(400)
})
