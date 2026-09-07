import { vi } from 'vitest'

const updateMock = vi.fn(async (_id: string, _patch: any) => ({
  reembedded: true,
  staleScoresRemoved: 2,
}))
const deleteMock = vi.fn(async (_id: string) => ({ deleted: true }))
vi.mock('@/lib/jobs/update', () => ({
  updateJob: (id: string, patch: any) => updateMock(id, patch),
  deleteJob: (id: string) => deleteMock(id),
}))

// role เป็น string ไม่ใช่ Role เพราะมีเทสต์ที่จงใจป้อนค่าที่ enum ไม่รู้จัก
const h = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
}))

// **hasRole ต้องเป็นตัวจริง** — stub เป็น true เมื่อไรประตูสิทธิ์ก็ไม่ถูกทดสอบเลย
// (บทเรียนจาก app/api/ingest/route.test.ts)
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSession: async () => h.session as any,
}))

import { PATCH, DELETE } from './route'

const ctx = { params: Promise.resolve({ id: 'job1' }) }

function patch(body: unknown) {
  return PATCH(
    new Request('http://x/api/jobs/job1', { method: 'PATCH', body: JSON.stringify(body) }) as any,
    ctx as any
  )
}
function del() {
  return DELETE(new Request('http://x/api/jobs/job1', { method: 'DELETE' }) as any, ctx as any)
}

beforeEach(() => {
  h.session = { userId: 'u1', role: 'data_manager' }
  updateMock.mockClear()
  deleteMock.mockClear()
  updateMock.mockImplementation(async () => ({ reembedded: true, staleScoresRemoved: 2 }))
  deleteMock.mockImplementation(async () => ({ deleted: true }))
})

test('data_manager แก้งานได้', async () => {
  const res = await patch({ title: 'New title' })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ reembedded: true, staleScoresRemoved: 2 })
})

test('admin ผ่านด้วย เพราะสิทธิ์เป็นลำดับชั้น', async () => {
  h.session = { userId: 'u1', role: 'admin' }
  expect((await patch({ title: 'x' })).status).toBe(200)
  expect((await del()).status).toBe(200)
})

test('ไม่มีเซสชันได้ 401 และไม่มีการเขียนอะไรเลย', async () => {
  h.session = null
  expect((await patch({ title: 'x' })).status).toBe(401)
  expect((await del()).status).toBe(401)
  expect(updateMock).not.toHaveBeenCalled()
  expect(deleteMock).not.toHaveBeenCalled()
})

test('member ได้ 403 ทั้งแก้และลบ', async () => {
  h.session = { userId: 'u1', role: 'member' }
  expect((await patch({ title: 'x' })).status).toBe(403)
  expect((await del()).status).toBe(403)
})

test('member ถูกปฏิเสธก่อนแตะข้อมูล ไม่ใช่หลังแก้ไปแล้ว', async () => {
  // ประตูที่อยู่หลังการทำงานคืนสถานะถูกแต่ข้อมูลเปลี่ยนไปแล้ว
  h.session = { userId: 'u1', role: 'member' }
  await patch({ title: 'x' })
  await del()
  expect(updateMock).not.toHaveBeenCalled()
  expect(deleteMock).not.toHaveBeenCalled()
})

test('role ที่ไม่รู้จักจากฐานข้อมูลถูกปฏิเสธ', async () => {
  // getSession cast ค่าจาก profiles.role ด้วย `as Role` โดยไม่ตรวจ
  h.session = { userId: 'u1', role: 'superuser' }
  expect((await patch({ title: 'x' })).status).toBe(403)
  expect(updateMock).not.toHaveBeenCalled()
})

test('PATCH ตัด source และ external_id ทิ้งจาก body', async () => {
  // ทั้งคู่เป็นข้อมูลที่มาของแถว ไม่ใช่เนื้อหา และการเปลี่ยน external_id
  // อาจชนกับ unique constraint (source, external_id) แล้วพังแบบอธิบายยาก
  await patch({ title: 'New', source: 'scraper', external_id: 'hijack' })
  const sent = updateMock.mock.calls[0][1]
  expect(sent).not.toHaveProperty('source')
  expect(sent).not.toHaveProperty('external_id')
  expect(sent).toHaveProperty('title', 'New')
})

test('PATCH ปฏิเสธ title ว่าง', async () => {
  const res = await patch({ title: '   ' })
  expect(res.status).toBe(400)
  expect(updateMock).not.toHaveBeenCalled()
})

test('PATCH ปฏิเสธ description ว่าง', async () => {
  const res = await patch({ description: '' })
  expect(res.status).toBe(400)
  expect(updateMock).not.toHaveBeenCalled()
})

test('ไม่พบงานได้ 404 ไม่ใช่ 200 เปล่าๆ', async () => {
  updateMock.mockImplementation(async () => null as any)
  expect((await patch({ title: 'x' })).status).toBe(404)
  deleteMock.mockImplementation(async () => ({ deleted: false }))
  expect((await del()).status).toBe(404)
})

test('ความล้มเหลวของฐานข้อมูลได้ 500 และไม่หลุดข้อความดิบออกไป', async () => {
  updateMock.mockImplementation(async () => {
    throw new Error('duplicate key value violates unique constraint "jobs_source_external_id_key"')
  })
  const res = await patch({ title: 'x' })
  expect(res.status).toBe(500)
  const json = await res.json()
  expect(json.error).not.toContain('constraint')
})
