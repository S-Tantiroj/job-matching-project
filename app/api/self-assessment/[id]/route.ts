import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { logActivity } from '@/lib/activity/log'

// DELETE /api/self-assessment/[id] — เจ้าของข้อมูลลบข้อมูลประเมินตัวเองของตัวเอง
//
// **PDPA มาตรา 33 ให้สิทธิ์เจ้าของข้อมูลขอให้ลบข้อมูลของตน** ระบบนี้มีบทที่พูดถึง
// สิทธิ์นั้นตั้งแต่ต้น แต่ไม่เคยมีปุ่มให้ใช้สิทธิ์เลยแม้แต่ปุ่มเดียว — ผู้ใช้อัปโหลด
// เรซูเม่ตัวเองได้ แต่เอาออกไม่ได้ จนกว่าจะมี route นี้
//
// **ไม่ต้องลบ `resume_assessments` เอง** — `profile_id` มี `on delete cascade`
// (migration 011) การลบแถวเดียวที่นี่พาแถวลูกไปด้วยครบ การเขียนคำสั่งลบซ้ำเองจะ
// ไม่ผิดแต่ทำให้คนอ่านทีหลังเข้าใจผิดว่า cascade ไม่มี
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const db = getServerClient()

  // **ทุก route ใช้ service-role ซึ่ง bypass RLS — `.eq('owner_id', ...)` คือการ
  // ควบคุมการเข้าถึงตัวจริง ไม่ใช่ชั้นที่สอง** (ข้อบังคับใน CLAUDE.md)
  //
  // แยก "อ่านไม่ได้" ออกจาก "ไม่มีแถว" เพราะ `.maybeSingle()` คืน data = null
  // ทั้งสองกรณี ถ้าไม่แยก ฐานข้อมูลล่มแล้วผู้ใช้จะเห็น "ไม่พบข้อมูลนี้"
  // แล้วไปตามหาสาเหตุผิดที่ — บั๊กเดียวกับที่ `scoreCandidateAgainst` เคยมี
  // เลือกแค่ `id` — ต้องการรู้แค่ว่ามีแถวนี้และเป็นของผู้เรียกหรือไม่
  // (`self_profiles` ไม่มีคอลัมน์ `full_name` ชื่ออยู่ใน `parsed_data` jsonb)
  const { data: profile, error: readError } = await db
    .from('self_profiles')
    .select('id')
    .eq('id', id)
    .eq('owner_id', session.userId)
    .maybeSingle()

  if (readError) {
    console.error('self_profiles read failed:', readError.message)
    return NextResponse.json({ error: 'อ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }

  // **404 ไม่ใช่ 403** — ตอบ 403 เท่ากับยืนยันว่า id นี้มีอยู่จริง ซึ่งเป็นการรั่ว
  // ข้อมูลในตัวมันเอง คนที่ไม่ใช่เจ้าของต้องแยกไม่ออกระหว่าง "ไม่มี" กับ "ไม่ใช่ของคุณ"
  if (!profile) return NextResponse.json({ error: 'ไม่พบข้อมูลนี้' }, { status: 404 })

  // กรอง owner_id ซ้ำในคำสั่งลบด้วย ไม่ใช่เชื่อผลการตรวจข้างบนอย่างเดียว
  const { error } = await db
    .from('self_profiles')
    .delete()
    .eq('id', id)
    .eq('owner_id', session.userId)

  if (error) {
    console.error('self_profiles delete failed:', error.message)
    return NextResponse.json({ error: 'ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
  }

  // บันทึกหลังลบสำเร็จ — เป็นหลักฐานว่าได้ทำตามคำขอใช้สิทธิ์แล้ว ซึ่งเป็นหน้าที่
  // ของผู้ควบคุมข้อมูลตามมาตรา 37 · `logActivity` กลืน error เองอยู่แล้ว
  // การบันทึกล้มจึงไม่ทำให้คำขอที่สำเร็จแล้วกลายเป็นล้มเหลว
  await logActivity({
    actorId: session.userId,
    action: 'self_data_delete',
    entityType: 'self_profile',
    entityId: id,
    summary: 'เจ้าของข้อมูลลบข้อมูลประเมินตัวเองของตนเอง',
  })

  return NextResponse.json({ ok: true })
}
