import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { validateUpload } from '@/lib/self/validateUpload'
import { parsePdfProfile } from '@/lib/gemini/parsePdf'
import { assessProfile } from '@/lib/gemini/assess'
import { buildEmbedText } from '@/lib/ingest/normalize'
import { embedText } from '@/lib/gemini/embed'

// POST /api/self-assessment  — FormData { file: <PDF> }
// ทุก role ที่ล็อกอินใช้ได้ ไม่ต้อง gate ด้วย hasRole เพราะเป็นฟีเจอร์สำหรับทุกคน
//
// รับเป็น FormData ไม่ใช่ base64 ใน JSON แบบ route อื่นในแอป เพราะ base64 ทำให้ขนาด
// โตขึ้น ~33% และ Vercel จำกัด request body ที่ 4.5MB — PDF 3.5MB ที่ควรส่งได้
// จะกลายเป็น 4.7MB แล้วพังโดยไม่มีสัญญาณที่เดาถูก
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
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

  const pdfBase64 = Buffer.from(await file!.arrayBuffer()).toString('base64')

  // ถ้าขั้นตอนใดล้ม ไม่เขียนอะไรลงฐานข้อมูลเลย — การเก็บ profile ที่ไม่มี embedding
  // จะกลายเป็นข้อมูลเสียแบบเงียบที่ไม่โผล่ในการจัดอันดับงานโดยไม่มีใครรู้สาเหตุ
  let profile, raw_text, assessment, embedding
  try {
    const parsed = await parsePdfProfile(pdfBase64)
    profile = parsed.profile
    raw_text = parsed.raw_text
    assessment = await assessProfile(profile)
    embedding = await embedText(buildEmbedText(profile), 'RETRIEVAL_DOCUMENT')
  } catch (e: any) {
    // log ฝั่ง server เท่านั้น ไม่ส่งข้อความดิบให้ผู้ใช้
    // ถ้าไม่ log ตรงนี้ ทุกความล้มเหลวจะกลายเป็นข้อความเดียวกันบนหน้าจอ
    // และไม่มีทางรู้เลยว่าเป็นไฟล์ โมเดล หรือเครือข่าย
    console.error('self-assessment upload failed:', e?.message ?? e)

    // แยกกรณี "ผู้ให้บริการไม่ว่าง" ออกจาก "ไฟล์มีปัญหา"
    // 503 UNAVAILABLE = ความจุฝั่ง Google ตึง, 429 = โควตาหมด
    // ทั้งสองไม่เกี่ยวกับไฟล์เลย การบอกให้ผู้ใช้ไปตรวจไฟล์จึงเป็นการชี้ผิดทาง
    const msg = String(e?.message ?? '')
    const upstreamBusy = msg.includes('"code":503') || msg.includes('"code":429')
    if (upstreamBusy) {
      return NextResponse.json(
        { error: 'ระบบ AI ไม่ว่างชั่วคราว กรุณารอสักครู่แล้วลองใหม่ (ไฟล์ของคุณไม่มีปัญหา)' },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: 'อ่านไฟล์ไม่สำเร็จ กรุณาตรวจว่าไฟล์ไม่เสียหายแล้วลองใหม่' },
      { status: 502 }
    )
  }

  const { data, error } = await getServerClient()
    .from('self_profiles')
    .insert({
      owner_id: session.userId,
      file_name: file!.name,
      raw_text,
      parsed_data: profile,
      assessment,
      embedding,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
  return NextResponse.json({ id: (data as any).id })
}
