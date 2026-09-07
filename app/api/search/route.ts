import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { searchCandidates } from '@/lib/search/query'

// POST /api/search  body: { semanticQuery, filters }
// Auth required. No LLM — vector + SQL only. This is what chip edits call.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { semanticQuery, filters } = await req.json()
  if (!semanticQuery) {
    return NextResponse.json({ error: 'semanticQuery is required' }, { status: 400 })
  }
  // ห่อไว้เพื่อไม่ให้ความล้มเหลวของการค้นหากลายเป็น "ไม่พบผลลัพธ์" บนหน้าจอ
  // ผู้ใช้ต้องแยกออกว่า "ไม่มีใครตรงเงื่อนไข" กับ "ระบบค้นหาไม่ได้" คนละเรื่องกัน
  try {
    return NextResponse.json(await searchCandidates(semanticQuery, filters ?? {}))
  } catch (e: any) {
    // log ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ส่งข้อความดิบจาก Postgres ให้ผู้ใช้
    console.error('search failed:', e?.message ?? e)
    return NextResponse.json(
      { error: 'ค้นหาไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ' },
      { status: 500 }
    )
  }
}
