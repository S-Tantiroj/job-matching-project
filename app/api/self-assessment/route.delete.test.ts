import { vi } from 'vitest'

// จำลอง supabase client แบบต่อลูกโซ่ เพื่อทดสอบ "ทางที่พัง" ซึ่ง integration test
// ทำไม่ได้เพราะฐานจริงไม่ล่มตามสั่ง (รูปแบบเดียวกับ lib/gemini/score.test.ts)
const h = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
  /** แถวที่ .maybeSingle() จะคืน — null = ไม่ใช่เจ้าของ หรือไม่มีอยู่ */
  ownedRow: null as any,
  selectError: null as any,
  deleteError: null as any,
  deletedIds: [] as string[],
  /** เงื่อนไขที่ถูกใช้จริงตอน delete — ใช้ยืนยันว่ามี owner_id กำกับ */
  deleteFilters: [] as Array<[string, string]>,
}))

vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSession: async () => h.session as any,
}))

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: function (this: any) { return this },
        maybeSingle: async () => ({ data: h.ownedRow, error: h.selectError }),
      }),
      delete: () => {
        const chain: any = {
          eq: (col: string, val: string) => {
            h.deleteFilters.push([col, val])
            if (col === 'id') h.deletedIds.push(val)
            return chain
          },
          then: (resolve: any) => resolve({ error: h.deleteError }),
        }
        return chain
      },
    }),
  }),
}))

const logMock = vi.fn(async () => {})
vi.mock('@/lib/activity/log', () => ({ logActivity: (i: any) => logMock(i) }))

import { DELETE } from './[id]/route'

const call = (id = 'p1') =>
  DELETE(new Request('http://x', { method: 'DELETE' }) as any, {
    params: Promise.resolve({ id }),
  } as any)

beforeEach(() => {
  h.session = { userId: 'owner-1', role: 'member' }
  // route เลือกแค่ `id` — `self_profiles` ไม่มีคอลัมน์ `full_name`
  h.ownedRow = { id: 'p1' }
  h.selectError = null
  h.deleteError = null
  h.deletedIds = []
  h.deleteFilters = []
  logMock.mockClear()
})

test('เจ้าของลบได้', async () => {
  const res = await call()
  expect(res.status).toBe(200)
  expect(h.deletedIds).toEqual(['p1'])
})

test('ไม่มีเซสชันได้ 401 และไม่มีการลบอะไร', async () => {
  h.session = null
  const res = await call()
  expect(res.status).toBe(401)
  expect(h.deletedIds).toEqual([])
})

test('คนที่ไม่ใช่เจ้าของได้ 404 ไม่ใช่ 403', async () => {
  // 403 จะยืนยันว่า id นี้มีอยู่จริง ซึ่งเป็นการรั่วข้อมูลในตัวมันเอง
  h.ownedRow = null
  const res = await call()
  expect(res.status).toBe(404)
})

test('คนที่ไม่ใช่เจ้าของถูกปฏิเสธก่อนแตะข้อมูล ไม่ใช่หลังลบไปแล้ว', async () => {
  h.ownedRow = null
  await call()
  expect(h.deletedIds).toEqual([])
})

test('อ่านล้มได้ 500 ไม่ใช่ 404 และไม่ลบอะไร', async () => {
  // .maybeSingle() คืน data = null ทั้งตอน "ไม่มีแถว" และตอนฐานพัง
  // ถ้าไม่แยก ฐานข้อมูลล่มแล้วผู้ใช้จะเห็นว่า "ไม่พบข้อมูลนี้" แล้วไปหาสาเหตุผิดที่
  h.selectError = { message: 'connection reset' }
  h.ownedRow = null
  const res = await call()
  expect(res.status).toBe(500)
  expect(h.deletedIds).toEqual([])
})

test('การลบยังกรองด้วย owner_id ซ้ำอีกชั้น', async () => {
  // ชั้นแรกคือ select ข้างบน ชั้นนี้กันกรณีที่ id เปลี่ยนมือระหว่างสองคำสั่ง
  await call()
  expect(h.deleteFilters).toContainEqual(['owner_id', 'owner-1'])
})

test('ลบล้มได้ 500 และไม่บันทึกกิจกรรม', async () => {
  h.deleteError = { message: 'deadlock detected' }
  const res = await call()
  expect(res.status).toBe(500)
  expect(logMock).not.toHaveBeenCalled()
})

test('ไม่ส่งข้อความ error ดิบจาก Postgres ออกไป', async () => {
  h.deleteError = { message: 'deadlock detected on relation self_profiles' }
  const res = await call()
  const json = await res.json()
  expect(json.error).not.toContain('self_profiles')
  expect(json.error).not.toContain('deadlock')
})

test('บันทึกกิจกรรมหลังลบสำเร็จ', async () => {
  await call()
  expect(logMock).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'self_data_delete', actorId: 'owner-1' })
  )
})
