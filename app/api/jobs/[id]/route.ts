import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { updateJob, deleteJob } from '@/lib/jobs/update'
import { validateJobInput } from '@/lib/jobs/validate'
import type { JobInput } from '@/lib/jobs/normalize'

// ประตูสิทธิ์ต้องอยู่ก่อนการทำงานทุกอย่าง — ประตูที่อยู่หลัง updateJob
// คืนสถานะถูกแต่ข้อมูลเปลี่ยนไปแล้ว
//
// คืน Response เมื่อถูกปฏิเสธ คืน null เมื่อผ่าน สร้าง Response ใหม่ทุกครั้ง
// เพราะ Response ใช้ซ้ำข้ามคำขอไม่ได้
async function denyIfNotAllowed(): Promise<NextResponse | null> {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์แก้ไขหรือลบงาน' }, { status: 403 })
  }
  return null
}

// PATCH /api/jobs/[id]  body: Partial<JobInput>
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyIfNotAllowed()
  if (denied) return denied

  const { id } = await params
  const body = (await req.json()) as Record<string, unknown>

  // **ตัดที่นี่ ไม่ใช่แค่ไม่แสดงในฟอร์ม** — body มาจาก client ที่เชื่อไม่ได้
  // และการเปลี่ยน external_id อาจชนกับ unique constraint (source, external_id)
  const { source: _source, external_id: _externalId, ...patch } = body

  // `partial: true` — PATCH ที่แก้แค่บางช่องไม่ควรถูกบังคับให้ส่ง title/description
  // มาด้วย แต่ถ้าส่งมาก็ต้องผ่านเกณฑ์เดียวกับตอนสร้างใหม่
  //
  // **การตรวจความยาวต้องอยู่ที่นี่ ไม่ใช่ปล่อยให้ catch ข้างล่างรับ** — catch นั้น
  // ตอบว่า "ระบบมีปัญหาชั่วคราว กรุณาลองใหม่" ซึ่งผิดสำหรับข้อมูลที่ยาวเกิน
  // ลองอีกกี่ครั้งก็ล้มเหมือนเดิม ผู้ใช้จะสรุปว่าเว็บพังทั้งที่แค่ต้องตัดข้อความ
  const invalid = validateJobInput(patch, { partial: true })
  if (invalid) return NextResponse.json({ error: invalid.message }, { status: 400 })

  try {
    const result = await updateJob(id, patch as Partial<JobInput>)
    if (!result) return NextResponse.json({ error: 'ไม่พบงานนี้' }, { status: 404 })
    return NextResponse.json(result)
  } catch (e: any) {
    // log ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งข้อความดิบจาก Postgres ให้ผู้ใช้
    console.error('PATCH /api/jobs/[id] failed:', e?.message ?? e)
    return NextResponse.json(
      { error: 'บันทึกไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่' },
      { status: 500 }
    )
  }
}

// DELETE /api/jobs/[id] — แถว analyses ที่ผูกกับงานนี้หายไปเองด้วย FK cascade
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyIfNotAllowed()
  if (denied) return denied

  const { id } = await params
  try {
    const { deleted } = await deleteJob(id)
    if (!deleted) return NextResponse.json({ error: 'ไม่พบงานนี้' }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error('DELETE /api/jobs/[id] failed:', e?.message ?? e)
    return NextResponse.json(
      { error: 'ลบไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่' },
      { status: 500 }
    )
  }
}
