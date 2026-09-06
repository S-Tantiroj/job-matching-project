import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { validateUpload } from '@/lib/self/validateUpload'
import { parsePdfProfile } from '@/lib/gemini/parsePdf'
import { isTransient } from '@/lib/gemini/withTimeout'

// POST /api/self-assessment/parse — FormData { file: <PDF> }
//
// เฟสแรกของสองเฟส: อ่านไฟล์แล้วคืนร่างกลับเบราว์เซอร์ **ไม่เขียนฐานข้อมูลเลย**
// ผู้ใช้ตรวจและแก้ในฟอร์มก่อน แล้วจึงยิง POST /api/self-assessment เพื่อบันทึก
//
// ห้าม import ไลบรารี supabase สำหรับฝั่งเซิร์ฟเวอร์ มี route.test.ts ดักไว้
//
// รับเป็น FormData ไม่ใช่ base64 ใน JSON เพราะ base64 ทำให้ขนาดโตขึ้น ~33% และ
// Vercel จำกัด request body ที่ 4.5MB — PDF 3.5MB ที่ควรส่งได้จะกลายเป็น 4.7MB
// แล้วพังโดยไม่มีสัญญาณที่เดาถูก
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบใหม่' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    file = f instanceof File ? f : null
  } catch {
    return NextResponse.json({ error: 'กรุณาเลือกไฟล์ PDF' }, { status: 400 })
  }

  const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
  if (invalid) {
    const hint =
      invalid.includes('ใหญ่เกินไป')
        ? `${invalid} — CV ที่สแกนมาเป็นรูปมักมีขนาดใหญ่ ลองบันทึกเป็น PDF ข้อความแทน`
        : invalid
    return NextResponse.json({ error: hint }, { status: 400 })
  }

  const pdfBase64 = Buffer.from(await file!.arrayBuffer()).toString('base64')

  try {
    const draft = await parsePdfProfile(pdfBase64)
    return NextResponse.json({ draft, fileName: file!.name })
  } catch (e: any) {
    // log ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งข้อความดิบให้ผู้ใช้ ถ้าไม่ log ตรงนี้
    // ทุกความล้มเหลวจะกลายเป็นข้อความเดียวกันบนหน้าจอ และไม่มีทางรู้เลยว่า
    // เป็นไฟล์ โมเดล หรือเครือข่าย
    console.error('self-assessment parse failed:', e?.message ?? e)

    // แยก "ผู้ให้บริการไม่ว่าง/หมดเวลา" ออกจาก "ไฟล์มีปัญหา" — 503 = ความจุฝั่ง Google
    // ตึง, 429 = โควตาหมด, timeout = withTimeout ตัดคำขอที่ค้างนาน ทั้งสามอย่าง
    // ไม่เกี่ยวกับไฟล์ การบอกให้ไปตรวจไฟล์คือการชี้ผิดทาง ใช้ isTransient ตัวเดียวกับ
    // ที่ analyze.ts และ extractFilters.ts ใช้ แทนการเช็คสตริงเองซึ่งไม่รู้จัก timeout
    if (isTransient(e)) {
      return NextResponse.json(
        {
          error: 'ระบบ AI ไม่ว่างชั่วคราว (ไฟล์ของคุณไม่มีปัญหา) รอสักครู่แล้วลองใหม่ หรือกรอกข้อมูลเองก็ได้',
          canFallback: true,
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      {
        error: 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจว่าไฟล์ไม่เสียหาย หรือกรอกข้อมูลเองแทนก็ได้',
        canFallback: true,
      },
      { status: 502 }
    )
  }
}
