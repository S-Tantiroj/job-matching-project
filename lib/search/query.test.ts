import { vi } from 'vitest'

let rpcArgs: any = null
let rpcData: any[] = [ { id: 'c1', similarity: 0.92 }, { id: 'c2', similarity: 0.71 } ]
let candRows: any[] = [ { id: 'c1', full_name: 'A', headline: 'X' }, { id: 'c2', full_name: 'B', headline: 'Y' } ]

// สกิลที่ **มีผู้สมัครถืออยู่จริง** สำหรับเทสต์ชุดนี้
//
// รูปร่างเลียนแบบ `candidate_skills` ที่ select ซ้อน `skills(name)` — หนึ่งแถวคือ
// การผูกหนึ่งครั้ง จึงมีชื่อซ้ำได้ และโค้ดต้อง dedupe เอง
//
// **ตั้งไว้ครั้งเดียวและห้ามเปลี่ยนกลางคัน** — `query.ts` แคชรายชื่อนี้ไว้ 5 นาที
// ต่ออินสแตนซ์ การแก้ค่าระหว่างเทสต์จะไม่มีผลเพราะแคชยังไม่หมดอายุ
// เทสต์ที่ต้องการสกิลที่ "ไม่มีใครถือ" ให้ใช้ชื่อที่ไม่อยู่ในรายการนี้แทน
const linkRows = [
  { skills: { name: 'Python' } },
  { skills: { name: 'Python' } }, // ซ้ำโดยตั้งใจ — สองคนถือสกิลเดียวกัน
  { skills: { name: 'A' } },
  { skills: { name: 'B' } },
  { skills: { name: 'Machine Learning' } },
]

// รับ rest parameter ไว้แม้ mock จะไม่สนใจค่าที่ส่งมา — ถ้าประกาศเป็น `async () =>`
// การ spread `...a` เข้าไปจะไม่ผ่าน tsc (TS2556) เพราะคอมไพเลอร์ไม่รู้ว่าอาร์เรย์ยาวเท่าไร
// ยังส่งอาร์กิวเมนต์ต่อไว้เผื่อวันหน้าอยากตรวจด้วย `toHaveBeenCalledWith`
const embedMock = vi.fn(async (..._a: unknown[]) => new Array(768).fill(0.1))
vi.mock('@/lib/gemini/embed', () => ({ embedText: (...a: unknown[]) => embedMock(...a) }))
vi.mock('@/lib/supabase/server', () => ({
  getServerClient: () => ({
    rpc: async (_name: string, args: any) => {
      rpcArgs = args
      return { data: rpcData }
    },
    // **ต้องแยกตามตาราง** — `candidate_skills` ถูก await ตรงๆ หลัง `.select()`
    // ส่วน `candidates` ต่อด้วย `.in()` ก่อน ถ้า mock คืนรูปเดียวกันทั้งคู่
    // การอ่านรายชื่อสกิลจะได้ undefined แล้วทุกชิปกลายเป็น "ไม่มีใครถือ" เงียบๆ
    from: (table: string) =>
      table === 'candidate_skills'
        ? { select: async () => ({ data: linkRows, error: null }) }
        : { select: () => ({ in: () => ({ data: candRows }) }) },
  }),
}))

import { searchCandidates } from './query'

test('maps chip filters to RPC params', async () => {
  rpcData = [ { id: 'c1', similarity: 0.92 }, { id: 'c2', similarity: 0.71 } ]
  candRows = [ { id: 'c1', full_name: 'A', headline: 'X' }, { id: 'c2', full_name: 'B', headline: 'Y' } ]
  const r = await searchCandidates('data scientist', {
    skills: ['Python'],
    minYears: 3,
    fieldOrDegree: ['Master'],
  })
  expect(rpcArgs.p_skills).toEqual(['Python'])
  expect(rpcArgs.p_min_years).toBe(3)
  expect(rpcArgs.p_field_or_degree).toEqual(['Master'])
  expect(r.results.map((x) => x.id)).toEqual(['c1', 'c2'])
  expect(r.results[0].score).toBe(92)
  expect(r.results[1].score).toBe(71)
})

test('passes nulls when no filters given', async () => {
  await searchCandidates('anyone', {})
  expect(rpcArgs.p_skills).toBeNull()
  expect(rpcArgs.p_min_years).toBeNull()
  expect(rpcArgs.p_field_or_degree).toBeNull()
})

test('clamps negative similarity to 0 and sorts by score descending', async () => {
  rpcData = [ { id: 'c3', similarity: -0.05 }, { id: 'c4', similarity: 0.5 } ]
  candRows = [ { id: 'c3', full_name: 'C', headline: 'Z' }, { id: 'c4', full_name: 'D', headline: 'W' } ]
  const r = await searchCandidates('anyone', {})
  expect(r.results.map((x) => x.id)).toEqual(['c4', 'c3'])
  expect(r.results[0].score).toBe(50)
  expect(r.results[1].score).toBe(0)
})

test('caches the query embedding across repeated searches (chip edits)', async () => {
  embedMock.mockClear()
  // Same semanticQuery, different filters — simulates editing chips.
  await searchCandidates('a unique cached query', { skills: ['A'] })
  await searchCandidates('a unique cached query', { skills: ['A', 'B'] })
  expect(embedMock).toHaveBeenCalledTimes(1)
})

// ===== ชิปสกิลที่ไม่มีในฐาน (พบจาก UAT 18 ก.ย. 2026) =====

test('ชิปสกิลที่ไม่มีใครถือไม่ถูกส่งเข้า RPC', async () => {
  // **"Data Science" มีแถวอยู่ในตาราง `skills` จริง แต่ไม่มีผู้สมัครคนไหนถือ**
  // (ยืนยันกับฐานจริง 18 ก.ย.: 487 ชื่อ แต่ผูกกับคนแค่ 197 ครั้ง)
  // ส่งเข้า RPC แล้วกรองทุกคนทิ้ง ทั้งที่ "Data Scientist" ควรเจอคนได้มากที่สุด
  rpcData = [{ id: 'c1', similarity: 0.8 }]
  candRows = [{ id: 'c1', full_name: 'A', headline: 'X' }]
  const r = await searchCandidates('data scientist', { skills: ['Data Science'] })
  expect(rpcArgs.p_skills).toBeNull()
  expect(r.unusedSkills).toEqual(['Data Science'])
  expect(r.results).toHaveLength(1)
})

test('ชิปปลอมหนึ่งตัวต้องไม่ทำให้ชิปจริงใช้ไม่ได้', async () => {
  // RPC เทียบแบบ "ต้องครบทุกตัว" — ส่งทั้งสองไปจะเหลือศูนย์เหมือนไม่ได้แก้อะไร
  rpcData = [{ id: 'c1', similarity: 0.8 }]
  candRows = [{ id: 'c1', full_name: 'A', headline: 'X' }]
  const r = await searchCandidates('data scientist python', {
    skills: ['Python', 'Data Science'],
  })
  expect(rpcArgs.p_skills).toEqual(['Python'])
  expect(r.unusedSkills).toEqual(['Data Science'])
})

test('รายงานชิปที่ใช้ไม่ได้แม้ผลลัพธ์จะว่าง', async () => {
  // ผลว่างเป็นจุดที่ผู้ใช้ต้องการคำอธิบายมากที่สุด ห้ามคืนรายการเปล่าแล้วเงียบ
  rpcData = []
  const r = await searchCandidates('unicorn wrangler', { skills: ['Unicorn Wrangling'] })
  expect(r.results).toEqual([])
  expect(r.unusedSkills).toEqual(['Unicorn Wrangling'])
})
