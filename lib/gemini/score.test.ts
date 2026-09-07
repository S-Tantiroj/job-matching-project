import { vi } from 'vitest'

// ฐานข้อมูลปลอมแบบต่อลูกโซ่ได้ — เล็กที่สุดที่พอเลียนแบบสามการเรียกใน score.ts
//
//   db.from('analyses').select().eq().eq().maybeSingle()   -> อ่าน cache
//   db.from('candidates').select().eq().maybeSingle()      -> อ่านผู้สมัคร
//   db.from('analyses').insert(row)                        -> เขียน cache
//
// จุดประสงค์คือทดสอบ "ทางที่พัง" ซึ่ง integration test ทำไม่ได้เพราะเรียกฐานจริง
// ที่ไม่ล่มตามสั่ง
type Result = { data?: any; error?: any }

const h = vi.hoisted(() => ({
  cache: { data: null, error: null } as Result,
  candidate: { data: null, error: null } as Result,
  insert: { error: null } as Result,
  inserted: [] as any[],
}))

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    from(table: string) {
      if (table === 'analyses') {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => h.cache }) }),
          }),
          insert: async (row: any) => {
            h.inserted.push(row)
            return h.insert
          },
        }
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => h.candidate }) }),
      }
    },
  }),
}))

const analyzeMock = vi.fn(async (_profile: any, _requirement: string) => ({
  score: 80,
  reasoning: 'เหมาะสมดี',
}))
vi.mock('./analyze', () => ({
  analyzeCandidate: (profile: any, requirement: string) => analyzeMock(profile, requirement),
}))

import { scoreCandidateAgainst } from './score'

const CANDIDATE_ROW = {
  full_name: 'Somchai',
  headline: 'Data Scientist',
  summary: 's',
  source: 'synthetic',
  education: [],
  experience: [],
  candidate_skills: [],
}

beforeEach(() => {
  h.cache = { data: null, error: null }
  h.candidate = { data: CANDIDATE_ROW, error: null }
  h.insert = { error: null }
  h.inserted = []
  analyzeMock.mockClear()
  analyzeMock.mockImplementation(async () => ({ score: 80, reasoning: 'เหมาะสมดี' }))
})

test('cache ชนแล้วคืนค่าเดิม ไม่เรียก Gemini', async () => {
  h.cache = { data: { score: 71, reasoning: 'เก่า' }, error: null }
  const res = await scoreCandidateAgainst('c1', 'Data Scientist')
  expect(res).toEqual({ score: 71, reasoning: 'เก่า', cached: true })
  expect(analyzeMock).not.toHaveBeenCalled()
})

test('อ่าน cache พังแล้วยังตอบถูก ไม่ทำให้ทั้งคำขอล้ม', async () => {
  // การทำให้ทั้งคำขอล้มเพราะ cache อ่านไม่ได้ คือการทำให้แย่กว่าเดิม —
  // คำนวณใหม่ยังได้คำตอบที่ถูก แค่แพงกว่า
  h.cache = { data: null, error: { message: 'connection reset' } }
  const res = await scoreCandidateAgainst('c1', 'Data Scientist')
  expect(res).toEqual({ score: 80, reasoning: 'เหมาะสมดี', cached: false })
  expect(analyzeMock).toHaveBeenCalled()
})

test('อ่าน cache พังแล้วต้องมีร่องรอยฝั่งเซิร์ฟเวอร์', async () => {
  // ถ้าไม่ log เลย การที่ cache ใช้ไม่ได้จะเงียบสนิท เห็นแค่ค่า Gemini ที่สูงผิดปกติ
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  h.cache = { data: null, error: { message: 'connection reset' } }
  await scoreCandidateAgainst('c1', 'Data Scientist')
  expect(spy).toHaveBeenCalled()
  spy.mockRestore()
})

test('ฐานข้อมูลพังตอนอ่านผู้สมัคร ต้องไม่บอกว่า "ไม่พบผู้สมัคร"', async () => {
  // **นี่คือเทสต์ที่สำคัญที่สุดในไฟล์นี้**
  // route แปลงข้อความ 'candidate not found' เป็น 404 ถ้าความล้มเหลวของฐานข้อมูล
  // ใช้ข้อความเดียวกัน ผู้ใช้จะเห็นว่า "ไม่พบผู้สมัครคนนี้" ตอนที่ฐานข้อมูลล่ม
  // แล้วไปตามหาสาเหตุผิดที่
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  h.candidate = { data: null, error: { message: 'permission denied for table candidates' } }
  await expect(scoreCandidateAgainst('c1', 'Data Scientist')).rejects.toThrow(
    'candidate read failed'
  )
  spy.mockRestore()
})

test('ไม่มีผู้สมัครคนนั้นจริงๆ ยังโยน candidate not found เหมือนเดิม', async () => {
  // maybeSingle คืน error = null เมื่อไม่มีแถว จึงแยกสองกรณีนี้ออกจากกันได้
  h.candidate = { data: null, error: null }
  await expect(scoreCandidateAgainst('c1', 'Data Scientist')).rejects.toThrow(
    'candidate not found'
  )
})

test('เขียน cache ล้มแล้วยังคืนคะแนนตามปกติ', async () => {
  // คะแนนคำนวณเสร็จแล้วและถูกต้อง การเขียน cache เป็นผลพลอยได้
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  h.insert = { error: { message: 'disk full' } }
  const res = await scoreCandidateAgainst('c1', 'Data Scientist')
  expect(res.score).toBe(80)
  expect(spy).toHaveBeenCalled()
  spy.mockRestore()
})

test('jobId ถูกเขียนลงแถว cache เมื่อส่งมา', async () => {
  await scoreCandidateAgainst('c1', 'Data Scientist', 'job-9')
  expect(h.inserted[0]).toMatchObject({ candidate_id: 'c1', job_id: 'job-9' })
})

test('ไม่ส่ง jobId มาก็เขียน null ไม่ใช่ undefined', async () => {
  // undefined จะถูก PostgREST ตัดทิ้งเงียบๆ ส่วน null คือค่าที่ตั้งใจ
  await scoreCandidateAgainst('c1', 'Data Scientist')
  expect(h.inserted[0].job_id).toBeNull()
})
