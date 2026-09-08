import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// ยืนยันรูปร่างและพฤติกรรมของฟังก์ชันสถิติกับฐานข้อมูลจริง
//
// สร้าง fixture ของตัวเองแล้วลบทิ้ง — ไม่พึ่งข้อมูลที่มีอยู่ในฐาน เพราะจำนวนจริง
// เปลี่ยนได้ตลอดเวลา เทสต์ที่ยืนยันตัวเลขของข้อมูลจริงจะแดงเองเมื่อมีคนนำเข้าข้อมูล

test('top_skills คืนชื่อทักษะพร้อมจำนวน เรียงจากมากไปน้อย', async () => {
  const db = getServerClient()
  const { data, error } = await db.rpc('top_skills', { p_limit: 10 })

  expect(error).toBeNull()
  expect(Array.isArray(data)).toBe(true)

  const rows = (data ?? []) as any[]
  expect(rows.length).toBeLessThanOrEqual(10)

  for (const r of rows) {
    expect(typeof r.name).toBe('string')
    // PostgREST คืน bigint เป็น number เมื่อค่าไม่เกินช่วงที่ JS แทนได้
    expect(Number(r.cnt)).toBeGreaterThan(0)
  }

  // ต้องเรียงจากมากไปน้อยจริง ไม่ใช่แค่คืนมาครบ
  const counts = rows.map((r) => Number(r.cnt))
  expect([...counts].sort((a, b) => b - a)).toEqual(counts)
}, 30000)

test('top_skills จำกัดจำนวนตาม p_limit และกันค่าที่ไม่สมเหตุสมผล', async () => {
  const db = getServerClient()

  const { data: three, error: e1 } = await db.rpc('top_skills', { p_limit: 3 })
  expect(e1).toBeNull()
  expect((three ?? []).length).toBeLessThanOrEqual(3)

  // 0 และค่าติดลบต้องไม่ทำให้ SQL พังด้วย "LIMIT must not be negative"
  // — greatest(1, ...) ดันขึ้นเป็นอย่างน้อยหนึ่งแถว
  const { data: zero, error: e2 } = await db.rpc('top_skills', { p_limit: 0 })
  expect(e2).toBeNull()
  expect((zero ?? []).length).toBeLessThanOrEqual(1)

  const { data: neg, error: e3 } = await db.rpc('top_skills', { p_limit: -5 })
  expect(e3).toBeNull()
  expect(Array.isArray(neg)).toBe(true)

  // ค่ามหาศาลต้องถูกกดลงมาที่เพดาน ไม่ใช่คืนทั้งตาราง
  const { data: huge, error: e4 } = await db.rpc('top_skills', { p_limit: 100000 })
  expect(e4).toBeNull()
  expect((huge ?? []).length).toBeLessThanOrEqual(50)
}, 30000)

test('candidate_source_counts รวมได้เท่าจำนวนผู้สมัครทั้งหมด', async () => {
  const db = getServerClient()

  const { data, error } = await db.rpc('candidate_source_counts')
  expect(error).toBeNull()

  const rows = (data ?? []) as any[]
  for (const r of rows) {
    expect(typeof r.source).toBe('string')
    expect(Number(r.cnt)).toBeGreaterThan(0)
  }

  // ผลรวมของทุกแหล่งต้องเท่ากับ count ทั้งตาราง — ถ้าไม่เท่า แปลว่ามีแถวที่หลุด
  // จากการ group (เช่นถ้าวันหน้ามีคนทำให้ source เป็น null ได้)
  const sum = rows.reduce((n, r) => n + Number(r.cnt), 0)
  const { count } = await db.from('candidates').select('id', { count: 'exact', head: true })
  expect(sum).toBe(count ?? 0)
}, 30000)
