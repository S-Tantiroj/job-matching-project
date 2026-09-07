import { vi } from 'vitest'

const upsertMock = vi.fn(async (_input: any) => ({ id: 'job1', updated: false }))
vi.mock('@/lib/jobs/upsert', () => ({ upsertJob: (input: any) => upsertMock(input) }))

const h = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
}))

// **hasRole ต้องเป็นตัวจริง** — stub เป็น true เมื่อไรประตูสิทธิ์ก็ไม่ถูกทดสอบเลย
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSession: async () => h.session as any,
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/jobs', { method: 'POST', body: JSON.stringify(body) }) as any)
}

beforeEach(() => {
  h.session = { userId: 'u1', role: 'data_manager' }
  upsertMock.mockClear()
})

test('creates a job from a valid body', async () => {
  const res = await post({ title: 'Data Scientist', description: 'Build models' })
  const json = await res.json()
  expect(json.id).toBe('job1')
})

test('rejects a body missing title or description', async () => {
  const res = await post({ title: 'No description' })
  expect(res.status).toBe(400)
})

test('ไม่มีเซสชันได้ 401', async () => {
  h.session = null
  const res = await post({ title: 'x', description: 'y' })
  expect(res.status).toBe(401)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('member สร้างงานไม่ได้อีกต่อไป', async () => {
  // เปลี่ยนพฤติกรรมโดยตั้งใจ — เดิม route นี้มีแค่ getSession()
  h.session = { userId: 'u1', role: 'member' }
  const res = await post({ title: 'x', description: 'y' })
  expect(res.status).toBe(403)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('admin สร้างได้', async () => {
  h.session = { userId: 'u1', role: 'admin' }
  expect((await post({ title: 'x', description: 'y' })).status).toBe(200)
})
