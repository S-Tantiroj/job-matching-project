import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { scoreCandidateAgainst } from './score'
import { requirementHash } from './cache'
import { tolerateOutage } from '@/test-utils/integration'

// Integration: scores a real candidate once (LLM) then again (cache hit).
// Requires candidates to exist. Cleans up the analyses row.
const REQUIREMENT = `__test__ requirement ${Date.now()}`

test('scoreCandidateAgainst returns a 0..100 score and caches on the second call', async (ctx) => {
  await tolerateOutage(ctx, async () => {
    const db = getServerClient()

    // ต้องเรียงและกรอง ห้ามใช้ .limit(1) เปล่าๆ
    //
    // ไม่มี ORDER BY = Postgres คืนแถวแรกในฮีป และหลังมีการลบผู้สมัคร ช่องว่างต้นฮีป
    // จะถูกนำกลับมาใช้กับแถวที่แทรกใหม่ — fixture ของเทสต์ไฟล์อื่นจึงมาอยู่แถวแรกได้
    // พอไฟล์นั้นลบ fixture ของตัวเองใน teardown เทสต์นี้จะพังด้วย
    // "candidate not found" แบบสุ่มโดยไม่มีอะไรผิดจริง
    //
    // เรียงตาม created_at น้อยสุดจะได้ผู้สมัครจาก seed ซึ่งไม่มีเทสต์ไหนแตะ
    // และกรองชื่อ __test__ ออกอีกชั้นเผื่อ fixture เก่าค้างจากรันที่ล้มกลางคัน
    const { data: c, error } = await db
      .from('candidates')
      .select('id')
      .not('full_name', 'like', '__test__%')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error || !c) throw new Error('ต้องมีผู้สมัครอย่างน้อยหนึ่งคน — รัน scripts/seed-synthetic.ts ก่อน')
    const candidateId = (c as any).id

    const first = await scoreCandidateAgainst(candidateId, REQUIREMENT)
    expect(first.cached).toBe(false)
    expect(first.score).toBeGreaterThanOrEqual(0)
    expect(first.score).toBeLessThanOrEqual(100)

    const second = await scoreCandidateAgainst(candidateId, REQUIREMENT)
    expect(second.cached).toBe(true)
    expect(second.score).toBe(first.score)

    await db
      .from('analyses')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('requirement_hash', requirementHash(REQUIREMENT))
  })
  // 60 วินาที เพราะ analyzeCandidate ลองสองครั้ง ครั้งละไม่เกิน 20 วินาที บวกเวลารอ
  // ระหว่างครั้ง — ที่ 30 วินาที เทสต์จะตายก่อนที่การลองครั้งที่สองจะได้เริ่ม
}, 60000)
