import { getServerClient } from '@/lib/supabase/server'
import { analyzeCandidate } from './analyze'
import { requirementHash } from './cache'

// Cache-first deep score of a candidate against a free-text requirement. Shared
// by /api/analyze (search) and /api/jobs/[id]/analyze (job matching) so both
// reuse the same analyses cache keyed by (candidate_id, requirement_hash).
export async function scoreCandidateAgainst(
  candidateId: string,
  requirement: string,
  jobId?: string
): Promise<{ score: number; reasoning: string; cached: boolean }> {
  const db = getServerClient()
  const hash = requirementHash(requirement)

  // **อ่าน cache พังแล้วไปต่อ ไม่โยน** — คำนวณใหม่ยังได้คำตอบที่ถูก แค่แพงกว่า
  // การทำให้ทั้งคำขอล้มเพราะ cache อ่านไม่ได้คือการทำให้แย่กว่าเดิม
  // แต่ต้อง log ไว้ ไม่งั้นการที่ cache ใช้ไม่ได้จะเงียบสนิท เห็นแค่ค่า Gemini
  // ที่สูงผิดปกติโดยไม่รู้ว่าทำไม
  const { data: cached, error: cacheError } = await db
    .from('analyses')
    .select('score,reasoning')
    .eq('candidate_id', candidateId)
    .eq('requirement_hash', hash)
    .maybeSingle()
  if (cacheError) console.error('analyses cache read failed:', cacheError)
  if (cached) {
    return { score: (cached as any).score, reasoning: (cached as any).reasoning, cached: true }
  }

  // **ต้องแยก "ไม่มีผู้สมัครคนนี้" ออกจาก "ฐานข้อมูลพัง"**
  // เดิมใช้ `.single()` ซึ่งคืน data = null ทั้งสองกรณี แล้วโยน 'candidate not found'
  // เหมือนกัน ส่วน route แปลงข้อความนั้นเป็น 404 ผลคือฐานข้อมูลล่มแล้วผู้ใช้เห็นว่า
  // "ไม่พบผู้สมัครคนนี้" แล้วไปตามหาสาเหตุผิดที่
  // `.maybeSingle()` คืน error = null เมื่อไม่มีแถว จึงแยกสองกรณีนี้ออกจากกันได้
  const { data: c, error: candidateError } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', candidateId)
    .maybeSingle()
  if (candidateError) {
    console.error('candidate read failed:', candidateError)
    throw new Error('candidate read failed')
  }
  if (!c) throw new Error('candidate not found')

  const profile = {
    full_name: (c as any).full_name,
    headline: (c as any).headline,
    summary: (c as any).summary,
    source: (c as any).source,
    education: (c as any).education,
    experience: (c as any).experience,
    skills: (c as any).candidate_skills?.map((x: any) => x.skills.name),
  }

  const result = await analyzeCandidate(profile as any, requirement)
  // job_id ทำให้ลบงานแล้ว cascade กวาดแถวนี้ให้เอง และทำให้นับได้ว่างานนี้มีคะแนน
  // cache ไว้กี่คน ผู้เรียกจากหน้าผู้สมัครไม่มีงานผูกอยู่จึงส่ง undefined มา
  //
  // **ไม่โยน error ตอนเขียน cache ล้ม** — คะแนนคำนวณเสร็จแล้วและถูกต้อง การเขียน
  // cache เป็นผลพลอยได้ ถ้าโยนออกไปผู้ใช้จะเห็นว่าล้มเหลวทั้งที่ได้คำตอบแล้ว
  // (เหตุผลเดียวกับ logActivity ใน lib/activity/log.ts)
  const { error: insertError } = await db.from('analyses').insert({
    candidate_id: candidateId,
    requirement_text: requirement,
    requirement_hash: hash,
    score: result.score,
    reasoning: result.reasoning,
    job_id: jobId ?? null,
  })
  if (insertError) console.error('analyses cache write failed:', insertError)
  return { ...result, cached: false }
}
