import { getServerClient } from '@/lib/supabase/server'
import { assessProfile } from '@/lib/gemini/assess'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText, type CandidateInput } from '@/lib/ingest/normalize'
import type { ProfileDraft } from './profileDraft'

// รับร่างที่ผู้ใช้ยืนยันแล้ว ไปวิเคราะห์ ทำ embedding และบันทึกเป็นแถวเดียว
//
// ถ้าขั้นไหนล้ม ไม่เขียนอะไรลงฐานเลย — โปรไฟล์ที่ไม่มี embedding จะไม่โผล่ในการ
// จัดอันดับงานโดยไม่มีใครรู้สาเหตุ ซึ่งเป็นข้อมูลเสียแบบเงียบ
//
// ไม่เขียน raw_text อีกแล้ว คอลัมน์ยังอยู่ในตาราง (migration เป็น additive) แต่
// ไม่มีใครอ่าน และผู้ใช้เป็นคนรับรองข้อมูลเองแล้ว ร่องรอยนั้นจึงหมดความหมาย
export async function createSelfProfile(
  draft: ProfileDraft,
  userId: string,
  fileName?: string
): Promise<string> {
  // source กำหนดฝั่งเซิร์ฟเวอร์เสมอ ไม่รับจาก client
  const profile: CandidateInput = { ...draft, source: 'upload' }

  const assessment = await assessProfile(draft)
  // gpa ไม่เข้า embedding โดยตั้งใจ — buildEmbedText ไม่ได้อ่านฟิลด์นี้ และห้าม
  // แก้ให้อ่าน เพราะมันใช้ร่วมกับฝั่งผู้สมัคร การแตะทำให้ embed_hash ของทั้งตาราง
  // candidates เปลี่ยน แล้วต้อง re-embed ใหม่หมด
  const embedding = await embedText(buildEmbedText(profile), 'RETRIEVAL_DOCUMENT')

  const { data, error } = await getServerClient()
    .from('self_profiles')
    .insert({
      owner_id: userId,
      file_name: fileName ?? null,
      parsed_data: draft,
      assessment,
      embedding,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('createSelfProfile insert failed:', error)
    throw new Error('insert failed')
  }
  return (data as any).id as string
}
