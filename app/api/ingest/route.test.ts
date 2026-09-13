import { vi } from 'vitest'

vi.mock('@/lib/ingest/csv', () => ({
  parseCsv: () => [
    { full_name: 'A', source: 'csv' },
    { full_name: 'B', source: 'csv' },
  ],
}))
// mock นี้ **ต้องรับพารามิเตอร์ `source` และใช้มันจริง** ไม่ใช่คืนค่าคงที่ —
// สิ่งที่ต้องพิสูจน์คือ route บอกที่มาถูกต้อง ถ้า mock ฝัง 'scraper' ไว้เอง
// เทสต์จะเขียวไม่ว่า route จะส่งอะไรมา ซึ่งคือการทดสอบ mock ไม่ใช่ทดสอบโค้ด
type Src = 'synthetic' | 'csv' | 'upload' | 'scraper'
const parseLinkedInMock = vi.fn((_csv: string, source: Src = 'scraper') => [
  { full_name: 'L1', source },
  { full_name: 'L2', source },
])
vi.mock('@/lib/ingest/linkedin', () => ({
  parseLinkedInCsv: (csv: string, source?: Src) => parseLinkedInMock(csv, source),
}))
// รับพารามิเตอร์ตรงตาม `upsertCandidate(input, userId)` เพื่อให้ยืนยันได้ว่า
// userId ที่ส่งเข้าไปมาจากเซสชัน ไม่ใช่จาก body (เดิมเป็น `(...a: any[])` ซึ่ง
// นอกจากตรวจอะไรไม่ได้แล้วยังทำให้ tsc ฟ้อง TS2556)
const upsertMock = vi.fn(async (_input: any, _userId: string) => ({
  id: 'x',
  updated: false,
  suppressed: false,
}))
vi.mock('@/lib/ingest/upsert', () => ({
  upsertCandidate: (input: any, userId: string) => upsertMock(input, userId),
}))
const parseResumeMock = vi.fn(async () => ({ full_name: 'R', source: 'upload' }))
vi.mock('@/lib/gemini/parse', () => ({ parseResume: () => parseResumeMock() }))

// เซสชันที่แต่ละเทสต์ตั้งเองได้ — ต้องผ่าน `vi.hoisted` เพราะ `vi.mock` ถูกยกขึ้นไป
// เหนือทั้ง import และ `let` ธรรมดา ตัวแปรปกติจะยังอยู่ใน TDZ ตอน factory ทำงาน
// role เป็น string ไม่ใช่ Role เพราะมีเทสต์ที่จงใจป้อนค่าที่ enum ไม่รู้จัก
const h = vi.hoisted(() => ({
  session: null as { userId: string; role: string } | null,
}))

// **`hasRole` ต้องเป็นตัวจริง** — เดิมไฟล์นี้ stub เป็น `hasRole: () => true`
// ซึ่งแปลว่าประตูสิทธิ์ของ endpoint ที่เขียนทับข้อมูลผู้สมัครทั้งชุดไม่เคยถูกทดสอบเลย
// ลบบรรทัด `if (!hasRole(...))` ออกจาก route แล้วเทสต์ทั้งชุดก็ยังเขียวอยู่ดี
// `hasRole` เป็นฟังก์ชันบริสุทธิ์ และ `getSession` import `next/headers` แบบ dynamic
// อยู่แล้ว โมดูลนี้จึง importOriginal ได้ในเทสต์ที่รันบน Node เปล่าๆ
vi.mock('@/lib/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/session')>()),
  getSession: async () => h.session as any,
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/ingest', { method: 'POST', body: JSON.stringify(body) }) as any)
}

beforeEach(() => {
  h.session = { userId: 'u1', role: 'data_manager' }
  upsertMock.mockClear()
  parseResumeMock.mockClear()
  parseLinkedInMock.mockClear()
})

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

test('linkedin ingest records source csv, not scraper', async () => {
  // ไฟล์ที่อัปโหลดที่ /import มีคนกดปุ่มเสมอ ต่างจาก scripts/sync-candidates.ts
  // ที่รันเองตอนตีสอง — ป้ายนี้ไปโผล่ในกราฟ "ผู้สมัครตามแหล่งที่มา" ที่เป็นหลักฐาน PDPA
  await post({ type: 'linkedin', csv: 'a' })
  expect(parseLinkedInMock).toHaveBeenCalledWith('a', 'csv')
})

test('the source reaches upsertCandidate, not just the parser', async () => {
  // ตรวจปลายทาง ไม่ใช่แค่ว่าอาร์กิวเมนต์ถูกส่ง — ค่าที่ถูกส่งแล้วหายกลางทาง
  // จะทำให้เทสต์ข้างบนเขียวทั้งที่แถวในฐานยังติดป้ายผิด
  await post({ type: 'linkedin', csv: 'a' })
  expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'csv' }), 'u1')
  expect(upsertMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ source: 'scraper' }),
    expect.anything()
  )
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

// ---------------------------------------------------------------------------
// ประตูสิทธิ์
// ---------------------------------------------------------------------------
// endpoint นี้แทรกและเขียนทับแถวใน `candidates` เป็นชุด role `member` เข้าถึงไม่ได้

test('ไม่มีเซสชันได้ 401 และไม่มีการเขียนอะไรเลย', async () => {
  h.session = null
  const res = await post({ type: 'csv', csv: 'a', mapping: {} })
  expect(res.status).toBe(401)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('member ได้ 403 ไม่ใช่ปล่อยผ่าน', async () => {
  h.session = { userId: 'u1', role: 'member' }
  const res = await post({ type: 'csv', csv: 'a', mapping: {} })
  expect(res.status).toBe(403)
})

test('member ถูกปฏิเสธก่อนแตะข้อมูล ไม่ใช่หลังนำเข้าไปแล้ว', async () => {
  // การคืน 403 หลังจาก upsert ไปแล้วคือการรั่วที่หน้าจอมองไม่เห็น — ผู้ใช้เห็นว่า
  // ล้มเหลว แต่ข้อมูลเข้าฐานไปเรียบร้อยแล้ว
  h.session = { userId: 'u1', role: 'member' }
  await post({ type: 'csv', csv: 'a', mapping: {} })
  expect(upsertMock).not.toHaveBeenCalled()
})

test('member ถูกปฏิเสธก่อนเรียก Gemini', async () => {
  // ประตูที่อยู่หลังการ parse แปลว่าใครก็ตามที่ล็อกอินอยู่สั่งให้เราจ่ายค่า token ได้
  h.session = { userId: 'u1', role: 'member' }
  await post({ type: 'upload', text: 'resume' })
  expect(parseResumeMock).not.toHaveBeenCalled()
})

test('data_manager ผ่าน', async () => {
  h.session = { userId: 'u1', role: 'data_manager' }
  const res = await post({ type: 'csv', csv: 'a', mapping: {} })
  expect(res.status).toBe(200)
})

test('admin ผ่านด้วย เพราะสิทธิ์เป็นลำดับชั้น', async () => {
  // ROLE_RANK: member 1 < data_manager 2 < admin 3 — ถ้าใครเปลี่ยนประตูเป็นการ
  // เทียบเท่ากันตรงๆ (`role === 'data_manager'`) เทสต์นี้จะจับได้
  h.session = { userId: 'u1', role: 'admin' }
  const res = await post({ type: 'csv', csv: 'a', mapping: {} })
  expect(res.status).toBe(200)
})

test('role ที่ไม่รู้จักจากฐานข้อมูลถูกปฏิเสธ ไม่ใช่ปล่อยผ่าน', async () => {
  // `getSession` cast ค่าจากคอลัมน์ `profiles.role` ด้วย `as Role` โดยไม่ตรวจ
  // ถ้าวันหนึ่ง enum ในฐานข้อมูลมีค่าที่โค้ดไม่รู้จัก ต้องปิดประตู ไม่ใช่เปิด
  h.session = { userId: 'u1', role: 'superuser' }
  const res = await post({ type: 'csv', csv: 'a', mapping: {} })
  expect(res.status).toBe(403)
  expect(upsertMock).not.toHaveBeenCalled()
})

test('owner_id มาจากเซสชัน ไม่ใช่จาก body ของคำขอ', async () => {
  // body ส่ง userId ของคนอื่นมาได้เสมอ — ถ้า route เชื่อมัน ผู้ใช้จะสร้างข้อมูล
  // ในนามคนอื่นได้ (ข้อบังคับใน CLAUDE.md)
  h.session = { userId: 'real-user', role: 'data_manager' }
  await post({ type: 'csv', csv: 'a', mapping: {}, userId: 'attacker' })
  expect(upsertMock).toHaveBeenCalledWith(expect.anything(), 'real-user')
})
