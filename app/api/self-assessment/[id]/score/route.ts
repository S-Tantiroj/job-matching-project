import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { requirementHash } from '@/lib/gemini/cache'
import { analyzeCandidate } from '@/lib/gemini/analyze'

// POST /api/self-assessment/[id]/score  body: { requirement: string }
// ให้คะแนนโปรไฟล์เทียบกับตำแหน่งที่ผู้ใช้พิมพ์ พร้อม cache ตาม requirement_hash
//
// ใช้ analyzeCandidate() ที่มีอยู่ซ้ำ ไม่เขียนฟังก์ชันใหม่ — มันรับ CandidateInput
// กับ requirement แล้วคืนคะแนน 0–100 พร้อมเหตุผลไทย ซึ่งตรงกับที่ต้องการพอดี
// และ parsed_data ที่เก็บไว้ก็เป็นโครงเดียวกัน
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  const { id } = await params

  let requirement = ''
  try {
    requirement = String((await req.json())?.requirement ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  if (!requirement) {
    return NextResponse.json({ error: 'กรุณากรอกตำแหน่งที่สนใจ' }, { status: 400 })
  }

  const db = getServerClient()

  // ตรวจความเป็นเจ้าของก่อนทำอะไรทั้งสิ้น ตอบ 404 ไม่ใช่ 403 เพื่อไม่เปิดเผยว่า id นี้มีอยู่จริง
  const { data: profile } = await db
    .from('self_profiles')
    .select('id, parsed_data')
    .eq('id', id)
    .eq('owner_id', session.userId)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'ไม่พบข้อมูลนี้' }, { status: 404 })

  const hash = requirementHash(requirement)

  const { data: cached } = await db
    .from('resume_assessments')
    .select('score, reasoning')
    .eq('profile_id', id)
    .eq('requirement_hash', hash)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      score: (cached as any).score,
      reasoning: (cached as any).reasoning ?? '',
      cached: true,
    })
  }

  let result
  try {
    result = await analyzeCandidate((profile as any).parsed_data, requirement)
  } catch {
    return NextResponse.json(
      { error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502 }
    )
  }

  // analyzeCandidate() (protected file, not modified here) returns
  // Math.round(parsed.score) with no bounds check — a well-formed model
  // reply like {"score": 150} passes through untouched, and a missing
  // score field yields NaN. Clamp to a finite 0–100 integer here so both
  // the stored row and the JSON response can never disagree or go out of
  // range; treat a non-finite score as a failed call.
  if (!Number.isFinite(result.score)) {
    return NextResponse.json(
      { error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502 }
    )
  }
  const safeScore = Math.max(0, Math.min(100, Math.round(result.score)))

  await db.from('resume_assessments').insert({
    profile_id: id,
    requirement_text: requirement,
    requirement_hash: hash,
    score: safeScore,
    reasoning: result.reasoning,
  })

  return NextResponse.json({ score: safeScore, reasoning: result.reasoning, cached: false })
}
