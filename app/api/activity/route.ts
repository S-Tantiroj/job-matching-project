import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { logActivity, type Action } from '@/lib/activity/log'

// POST /api/activity  body: { action, summary, entityId? }
//
// จุดรับสำหรับการกระทำที่เกิดฝั่ง client ล้วน — shortlist ไม่มี API route ของตัวเอง
// แต่เขียนผ่าน browser client ตรงๆ ภายใต้ RLS ส่วน activity_log เปิด RLS โดยไม่มี
// policy จึงเขียนด้วย anon key ไม่ได้เลย เส้นทางนี้จึงจำเป็น
//
// actor มาจาก session เท่านั้น ไม่เคยมาจาก body — ไม่งั้นใครก็เขียนบันทึกในนามคนอื่นได้
// และ action ถูกจำกัดไว้เฉพาะกลุ่ม shortlist ซึ่งเป็นสิ่งที่ member ทำได้จริง
// การกระทำที่มีผลกับข้อมูลส่วนกลาง (ลบ นำเข้า ระงับ) ถูกบันทึกฝั่งเซิร์ฟเวอร์
// ที่จุดที่มันเกิดขึ้นจริง จึงปลอมไม่ได้
const ALLOWED: Action[] = ['shortlist_create', 'shortlist_add', 'shortlist_remove']

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  if (!ALLOWED.includes(body?.action)) {
    return NextResponse.json({ error: 'action ไม่รองรับ' }, { status: 400 })
  }

  const summary = String(body?.summary ?? '').trim().slice(0, 200)
  if (!summary) return NextResponse.json({ error: 'summary ว่าง' }, { status: 400 })

  await logActivity({
    actorId: session.userId,
    action: body.action,
    entityType: 'shortlist',
    entityId: typeof body.entityId === 'string' ? body.entityId : null,
    summary,
  })

  return NextResponse.json({ ok: true })
}
