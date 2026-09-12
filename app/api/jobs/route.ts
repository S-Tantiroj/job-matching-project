import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { upsertJob } from '@/lib/jobs/upsert'
import { validateJobInput } from '@/lib/jobs/validate'
import type { JobInput } from '@/lib/jobs/normalize'

// POST /api/jobs  body: JobInput. Auth required. Creates (or upserts) a job.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // **เปลี่ยนพฤติกรรมของของเดิม** — เดิมมีแค่ getSession() ใครที่ล็อกอินก็สร้างงานได้
  // ตอนนี้กั้นเท่ากับ PATCH/DELETE ที่ /api/jobs/[id]
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์เพิ่มงาน' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  // ตรวจความยาวและช่วงค่าให้ตรงกับ DDL **ก่อน**แตะฐานข้อมูล — ดูเหตุผลใน
  // lib/jobs/validate.ts เดิมตรวจแค่ว่าไม่ว่าง ชื่อตำแหน่งยาวเกิน varchar(255)
  // จึงหลุดไปพังที่ Postgres แล้ว upsertJob โยน error ที่ route นี้ไม่มีใครรับ
  const invalid = validateJobInput(body)
  if (invalid) return NextResponse.json({ error: invalid.message }, { status: 400 })

  // **route นี้เดิมไม่มี try/catch เลย** ต่างจาก PATCH ที่ /api/jobs/[id]
  // ความล้มเหลวใดๆ จาก upsertJob (Gemini ล่ม ฐานข้อมูลล่ม) จึงกลายเป็น
  // unhandled rejection แล้ว Next.js ตอบ 500 ที่ไม่มีข้อความให้ผู้ใช้อ่าน
  try {
    const result = await upsertJob(body as unknown as JobInput)
    return NextResponse.json(result)
  } catch (e: any) {
    // ไม่ส่งข้อความดิบจาก Postgres/Gemini ให้ผู้ใช้ ตามกติกาของโปรเจกต์
    console.error('POST /api/jobs failed:', e?.message ?? e)
    return NextResponse.json(
      { error: 'บันทึกไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่' },
      { status: 500 }
    )
  }
}
