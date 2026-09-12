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

// ---------------------------------------------------------------------------
// ด่านความยาว — ต้องปฏิเสธ "ก่อนทำงาน" เหมือนประตูสิทธิ์
// ---------------------------------------------------------------------------
// มาตรฐานเดียวกับที่ใช้กับ /api/ingest: ด่านที่อยู่หลังการทำงานคืนสถานะถูก
// แต่รั่วจริง ที่นี่ "รั่ว" หมายถึงปล่อยให้ไปพังที่ Postgres แล้วผู้ใช้ได้ 500
// ที่ไม่มีข้อความ ทั้งที่สาเหตุคือข้อมูลที่เขากรอกเอง

test('ชื่อตำแหน่งยาวเกิน 255 ได้ 400 และ upsertJob ต้องไม่ถูกเรียก', async () => {
  const res = await post({ title: 'ก'.repeat(256), description: 'y' })
  expect(res.status).toBe(400)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('ยาวพอดี 255 ยังผ่าน', async () => {
  const res = await post({ title: 'ก'.repeat(255), description: 'y' })
  expect(res.status).toBe(200)
  expect(upsertMock).toHaveBeenCalled()
})

test('ข้อความ 400 ต้องบอกว่าต้องตัดเหลือเท่าไร ไม่ใช่ "ผิดพลาด" ลอยๆ', async () => {
  const res = await post({ title: 'ก'.repeat(300), description: 'y' })
  const json = await res.json()
  expect(json.error).toContain('255')
  expect(json.error).toContain('300')
})

test('ประสบการณ์เป็นทศนิยมได้ 400 ไม่ใช่ปล่อยไปพังที่คอลัมน์ integer', async () => {
  const res = await post({ title: 'x', description: 'y', min_experience_years: 3.5 })
  expect(res.status).toBe(400)
  expect(upsertMock).not.toHaveBeenCalled()
})

// เดิม route นี้ไม่มี try/catch เลย ต่างจาก PATCH — ความล้มเหลวจาก upsertJob
// จึงกลายเป็น unhandled rejection แล้วผู้ใช้ได้ 500 ที่ไม่มีข้อความให้อ่าน
test('upsertJob ล้มต้องได้ 500 พร้อมข้อความ ไม่ใช่ error หลุดออกจาก route', async () => {
  upsertMock.mockRejectedValueOnce(new Error('boom from postgres'))
  const res = await post({ title: 'x', description: 'y' })
  expect(res.status).toBe(500)
  const json = await res.json()
  expect(typeof json.error).toBe('string')
  // ห้ามส่งข้อความดิบจากฐานข้อมูลให้ผู้ใช้
  expect(json.error).not.toContain('boom from postgres')
})
