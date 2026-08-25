import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { upsertCandidate } from '@/lib/ingest/upsert'

// POST /api/pending/[id]/approve — เอาแถวในคิวเข้า candidates จริง
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  const { id } = await params
  const db = getServerClient()

  const { data: row } = await db
    .from('pending_candidates')
    .select('id, payload')
    .eq('id', id)
    .eq('status', 'pending')
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'ไม่พบรายการนี้' }, { status: 404 })

  let result
  try {
    result = await upsertCandidate((row as any).payload, session.userId, null)
  } catch {
    return NextResponse.json(
      { error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' },
      { status: 502 }
    )
  }

  if (result.suppressed) {
    return NextResponse.json(
      { error: 'ผู้สมัครนี้อยู่ในรายชื่อระงับ ไม่สามารถนำเข้าได้' },
      { status: 409 }
    )
  }

  await db
    .from('pending_candidates')
    .update({ status: 'approved', reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true, candidateId: result.id })
}
