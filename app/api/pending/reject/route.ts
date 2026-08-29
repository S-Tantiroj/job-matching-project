import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity/log'

// POST /api/pending/reject  body: { ids: string[] }
// ปฏิเสธเป็นกลุ่มได้เพราะการปฏิเสธไม่เพิ่มข้อมูลเข้าระบบ จึงปลอดภัย
// ส่วนการอนุมัติทำทีละคนโดยตั้งใจ — ปุ่ม "อนุมัติทั้งหมด" จะทำให้คิวกลายเป็นตราประทับเปล่า
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  let ids: string[] = []
  try {
    const body = await req.json()
    ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : []
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }
  if (!ids.length) return NextResponse.json({ error: 'ไม่ได้เลือกรายการ' }, { status: 400 })

  const db = getServerClient()

  // อ่านชื่อก่อนอัปเดต เพื่อให้บันทึกอ่านรู้เรื่องโดยไม่ต้อง join กลับ
  const { data: rows } = await db.from('pending_candidates').select('full_name').in('id', ids)
  const names = (rows ?? []).map((r: any) => r.full_name).filter(Boolean)

  const { error } = await db
    .from('pending_candidates')
    .update({ status: 'rejected', reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .in('id', ids)

  if (error) {
    console.error('reject failed:', error.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }

  await logActivity({
    actorId: session.userId,
    action: 'reject',
    entityType: 'candidate',
    summary:
      names.length === 1
        ? names[0]
        : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` และอีก ${names.length - 3} คน` : ''}`,
    count: ids.length,
    metadata: { names },
  })

  return NextResponse.json({ ok: true, rejected: ids.length })
}
