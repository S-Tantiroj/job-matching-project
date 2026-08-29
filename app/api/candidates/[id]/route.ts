import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { removeCandidates } from '@/lib/candidates/remove'

// เคยมี PATCH สำหรับแก้ไขผู้สมัครด้วยมือ — ถอดออกโดยตั้งใจ
//
// เหตุผลเชิงข้อมูล: ตารางนี้เป็นภาพสะท้อนของแหล่งข้อมูลภายนอก การแก้ด้วยมือทำให้
// สิ่งที่เก็บไว้ไม่ตรงกับความจริงที่ต้นทาง โดยไม่มีอะไรบอกว่าค่าไหนถูกแก้
//
// เหตุผลเชิงเทคนิค: การแก้แถวที่มาจาก scraper ไร้ผลอยู่แล้ว updateCandidateFields
// อัปเดต embed_hash ไปตามข้อความที่แก้ รอบ sync ถัดไปจึงพบว่า hash ของข้อมูลที่
// scrape มาไม่ตรง แล้วเขียนทับทั้งแถวเงียบๆ — ผู้ใช้เห็นว่าแก้สำเร็จแล้วค่ากลับคืน
// เองในคืนถัดมาโดยไม่มีคำอธิบาย
//
// ถ้าข้อมูลผิด วิธีที่ถูกคือแก้ที่ต้นทางแล้ว sync ใหม่ หรือลบทิ้งด้วย DELETE ข้างล่าง

// DELETE /api/candidates/[id]  body: { suppress?: boolean, reason?: string }
//
// ต่างจาก POST /api/candidates/[id]/suppress ตรงที่เส้นทางนั้นมีไว้สำหรับคำขอใช้สิทธิ์
// ของเจ้าของข้อมูลโดยเฉพาะ และบังคับว่าต้องระงับเสมอ ส่วนเส้นทางนี้คือการจัดการข้อมูล
// ทั่วไป (ข้อมูลขยะ ซ้ำ ผิดกลุ่ม) ซึ่งการระงับเป็นทางเลือก
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์ลบข้อมูลนี้' }, { status: 403 })
  }

  const { id } = await params

  // ไม่มี body ก็ลบได้ ถือว่าไม่ระงับ
  let body: any = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    body = {}
  }

  const out = await removeCandidates([id], {
    suppress: body.suppress === true,
    userId: session.userId,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  })
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json({ ok: true, ...out.result })
}
