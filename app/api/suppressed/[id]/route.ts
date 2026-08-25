import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'

// DELETE /api/suppressed/[id] — ถอนออกจากรายชื่อระงับ (เผื่อเพิ่มผิด)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการการนำเข้าข้อมูล' }, { status: 403 })
  }

  const { id } = await params
  const { error } = await getServerClient().from('suppressed_profiles').delete().eq('id', id)
  if (error) {
    console.error('unsuppress failed:', error.message)
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
