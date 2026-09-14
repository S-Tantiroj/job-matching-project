import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { checkRoleChange } from '@/lib/auth/roleChange'
import { identityName } from '@/lib/auth/identity'
import { logActivity } from '@/lib/activity/log'

// POST /api/admin/users  body: { userId, role: 'admin' | 'data_manager' | 'member' }
// Admin-only. Changes another user's role using the service-role client
// (bypasses RLS) — safe because access is gated on the caller's admin role.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { userId, role } = await req.json()

  // **ตรวจก่อนแตะฐานข้อมูล** — ประตูที่อยู่หลังการเขียนคืนสถานะถูกแต่ข้อมูลเปลี่ยนไปแล้ว
  // actorId มาจากเซสชันเสมอ ไม่ใช่จาก body ที่ผู้เรียกควบคุมได้
  const check = checkRoleChange({ actorId: session.userId, targetUserId: userId, nextRole: role })
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 })

  const db = getServerClient()

  // อ่านค่าเดิมไว้ก่อน เพื่อให้บันทึกกิจกรรมอ่านรู้เรื่องแม้ผู้ใช้คนนั้นถูกลบทีหลัง
  // (หลักการเดียวกับ summary ของการลบผู้สมัคร — ไม่ join กลับทีหลัง)
  const { data: before } = await db
    .from('profiles')
    .select('display_name, email, role')
    .eq('id', userId)
    .maybeSingle()

  const { error } = await db.from('profiles').update({ role: check.role }).eq('id', userId)
  if (error) {
    // ห้ามส่งข้อความ Postgres ดิบออกไป — บอกชื่อตาราง ชื่อคอลัมน์ และบางครั้งค่าในแถว
    console.error('role update failed:', error.message)
    return NextResponse.json({ error: 'เปลี่ยนสิทธิ์ไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }

  // **การให้สิทธิ์แอดมินเป็นการกระทำที่สำคัญที่สุดในระบบ แต่เดิมไม่เคยถูกบันทึกเลย**
  // ทั้งที่การลบผู้สมัครถูกบันทึก — บันทึก *หลัง* เขียนสำเร็จ และ logActivity
  // กลืน error เองอยู่แล้ว การบันทึกล้มจึงไม่ทำให้คำขอที่สำเร็จแล้วกลายเป็นล้มเหลว
  const who = before ? identityName(before, userId) : userId
  await logActivity({
    actorId: session.userId,
    action: 'role_change',
    entityType: 'user',
    entityId: userId,
    summary: `เปลี่ยนสิทธิ์ของ ${who} จาก ${before?.role ?? 'ไม่ทราบ'} เป็น ${check.role}`,
    metadata: { from: before?.role ?? null, to: check.role },
  })

  return NextResponse.json({ ok: true })
}
