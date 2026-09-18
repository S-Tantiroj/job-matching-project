import { vi } from 'vitest'

vi.mock('@/lib/auth/session', () => ({ getSession: async () => ({ userId: 'u1', role: 'member' }) }))
vi.mock('@/lib/search/query', () => ({
  searchCandidates: async (_sq: string) => ({
    results: [{ id: 'c1', full_name: 'A', headline: 'X', score: 90 }],
    unusedSkills: ['Data Science'],
  }),
}))

import { POST } from './route'

function post(body: unknown) {
  return POST(new Request('http://x/api/search', { method: 'POST', body: JSON.stringify(body) }) as any)
}

test('returns results for a valid semanticQuery', async () => {
  const res = await post({ semanticQuery: 'data scientist', filters: {} })
  const json = await res.json()
  expect(json.results[0].id).toBe('c1')
  expect(json.results[0].score).toBe(90)
})

test('ส่งรายชื่อชิปสกิลที่ใช้กรองไม่ได้ต่อไปถึงหน้าจอ', async () => {
  // ถ้า route กลืนค่านี้ทิ้ง ผู้ใช้จะเห็นผลลัพธ์ที่ไม่ตรงกับชิปบนจอโดยไม่มีคำอธิบาย
  const res = await post({ semanticQuery: 'data scientist', filters: {} })
  expect((await res.json()).unusedSkills).toEqual(['Data Science'])
})

test('rejects a missing semanticQuery', async () => {
  const res = await post({ filters: {} })
  expect(res.status).toBe(400)
})
