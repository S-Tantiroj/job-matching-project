import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { validateProfileDraft } from '@/lib/self/profileDraft'
import { createSelfProfile } from '@/lib/self/createProfile'
import { isTransient, isServiceBlocked } from '@/lib/gemini/withTimeout'

// POST /api/self-assessment — JSON { draft: ProfileDraft, fileName?: string }
// ทุก role ที่ล็อกอินใช้ได้ ไม่ต้อง gate ด้วย hasRole เพราะเป็นฟีเจอร์สำหรับทุกคน
//
// เฟสที่สองของสองเฟส: รับร่างที่ผู้ใช้ **ตรวจและยืนยันแล้ว** ไปวิเคราะห์และบันทึก
// ไฟล์ PDF อ่านไปแล้วที่ /api/self-assessment/parse route นี้จึงไม่รับไฟล์
//
// **สำคัญ: body มาจากเบราว์เซอร์ ไม่ได้มาจาก Gemini แล้ว** เดิมข้อมูลที่จะเขียนลงฐาน
// มาจากโมเดลเท่านั้นจึงเชื่อได้ระดับหนึ่ง ตอนนี้ใครก็ยิง JSON ตรงเข้ามาได้โดยไม่ผ่าน
// ฟอร์ม เช่นส่ง summary ยาวสิบล้านตัวอักษรให้เราจ่ายค่า embedding แทนเขา
// validateProfileDraft คือด่านเดียวที่กันเรื่องนี้ — การจำกัดใน <input maxLength>
// เป็นเรื่องประสบการณ์ผู้ใช้ ไม่ใช่การป้องกัน
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })
  }

  const result = validateProfileDraft(body?.draft)
  if (!result.ok) {
    return NextResponse.json({ error: result.message, field: result.field }, { status: 400 })
  }

  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 255) : undefined

  try {
    // owner_id มาจาก session เท่านั้น ห้ามรับจาก body — validateProfileDraft
    // ตัด owner_id ที่ปนมากับ draft ทิ้งไปแล้วด้วย
    const id = await createSelfProfile(result.draft, session.userId, fileName)
    return NextResponse.json({ id })
  } catch (e: any) {
    console.error('self-assessment save failed:', e?.message ?? e)

    // timeout (withTimeout ตัดคำขอที่ค้างนาน) ก็เป็นความล้มเหลวชั่วคราวเหมือน 503/429 —
    // ใช้ isTransient ตัวเดียวกับ analyze.ts และ extractFilters.ts แทนการเช็คสตริงเอง
    // ต้องเช็คก่อน isTransient และก่อนข้อความ "กรุณาลองใหม่" ที่ท้ายฟังก์ชัน —
    // เมื่อบัญชีถูกปฏิเสธ กดกี่ครั้งก็ไม่สำเร็จจนกว่าจะแก้ที่ฝั่งบัญชี
    if (isServiceBlocked(e)) {
      return NextResponse.json(
        {
          error:
            'ระบบ AI ใช้งานไม่ได้ในขณะนี้เนื่องจากปัญหาการเข้าถึงบริการ ข้อมูลของคุณยังอยู่ ' +
            'แต่การกดซ้ำจะยังไม่สำเร็จจนกว่าผู้ดูแลระบบจะแก้ไข',
        },
        { status: 503 }
      )
    }

    if (isTransient(e)) {
      // ฟอร์มยังอยู่ครบบนหน้าจอของผู้ใช้ กดวิเคราะห์ซ้ำได้เลยโดยไม่ต้องอ่าน PDF ใหม่
      // ซึ่งเป็นขั้นที่แพงที่สุด — นี่คือสิ่งที่ flow เดิมทำไม่ได้
      return NextResponse.json(
        { error: 'ระบบ AI ไม่ว่างชั่วคราว ข้อมูลของคุณยังอยู่ กดวิเคราะห์อีกครั้งได้เลย' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
