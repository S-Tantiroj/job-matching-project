import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { removeCandidates } from '@/lib/candidates/remove'

// POST /api/candidates/delete  body: { ids: string[], suppress?: boolean, reason?: string }
//
// ใช้ POST ไม่ใช่ DELETE เพราะต้องส่งรายการ id มาใน body ซึ่ง DELETE ไม่รับประกันว่า
// จะส่งผ่านทุกชั้นของ proxy และเพราะ path นี้เป็น segment คงที่จึงไม่ชนกับ
// /api/candidates/[id] — Next.js เลือก route คงที่ก่อน route แบบไดนามิกเสมอ
//
// ลบหมดหรือไม่ลบเลย: ถ้าบันทึกรายชื่อระงับล้ม จะไม่มีใครถูกลบ
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ลบข้อมูลนี้' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  if (!Array.isArray(body?.ids)) {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  // เพดานกันการยิงพลาดครั้งเดียวแล้วฐานข้อมูลว่าง
  if (body.ids.length > 200) {
    return NextResponse.json({ error: 'ลบได้ครั้งละไม่เกิน 200 รายการ' }, { status: 400 })
  }

  const out = await removeCandidates(body.ids, {
    suppress: body.suppress === true,
    userId: session.userId,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  })
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ ok: true, ...out.result })
}
