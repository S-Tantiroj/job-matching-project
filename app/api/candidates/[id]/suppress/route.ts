import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity/log'

// POST /api/candidates/[id]/suppress  body: { reason?: string }
// ลบผู้สมัครและเพิ่มเข้ารายชื่อระงับ "ในการกระทำเดียว"
//
// ห้ามแยกเป็นสองขั้น: ถ้ามีใครทำครึ่งเดียว (ลบแต่ไม่ระงับ) cron คืนถัดไปจะพาคนนั้นกลับมา
// ทำให้การใช้สิทธิ์ขอลบของเจ้าของข้อมูลไร้ผล
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  const { id } = await params
  let reason = ''
  try {
    reason = String((await req.json())?.reason ?? '').trim()
  } catch {
    reason = ''
  }

  const db = getServerClient()

  const { data: c } = await db
    .from('candidates')
    .select('id, full_name, linkedin_url')
    .eq('id', id)
    .maybeSingle()

  if (!c) return NextResponse.json({ error: 'ไม่พบรายการนี้' }, { status: 404 })

  const url = (c as any).linkedin_url
  if (!url) {
    return NextResponse.json(
      { error: 'ผู้สมัครนี้ไม่มี LinkedIn URL จึงป้องกันการนำเข้าซ้ำไม่ได้' },
      { status: 400 }
    )
  }

  const { error: supError } = await db.from('suppressed_profiles').upsert(
    {
      linkedin_url: url,
      full_name: (c as any).full_name,
      reason: reason || null,
      created_by: session.userId,
    },
    { onConflict: 'linkedin_url' }
  )
  if (supError) {
    console.error('suppress insert failed:', supError.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }

  // ลบหลังจากบันทึกรายชื่อระงับสำเร็จแล้วเท่านั้น
  // ถ้าลบก่อนแล้วการบันทึกล้ม จะได้สถานะที่แย่ที่สุด: ข้อมูลหายแต่คืนถัดไปกลับมาใหม่
  const { error: delError } = await db.from('candidates').delete().eq('id', id)
  if (delError) {
    console.error('suppress delete failed:', delError.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }

  await db.from('pending_candidates').delete().eq('linkedin_url', url)

  await logActivity({
    actorId: session.userId,
    action: 'suppress',
    entityType: 'candidate',
    entityId: id,
    summary: (c as any).full_name,
    metadata: { linkedin_url: url, reason: reason || null, source: 'คำขอของเจ้าของข้อมูล' },
  })

  return NextResponse.json({ ok: true })
}
