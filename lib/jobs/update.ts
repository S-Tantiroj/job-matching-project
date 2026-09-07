import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import {
  buildJobEmbedText,
  embedTextChanged,
  requirementTextChanged,
  type JobInput,
} from './normalize'

// ทุกคอลัมน์ที่ป้อน buildJobEmbedText หรือ buildJobRequirementText ต้องอยู่ที่นี่
// ลืมสักตัว แล้วการเทียบ before/after จะคิดว่าค่านั้นเป็น undefined เสมอ
// -> ตัดสินผิดว่าต้อง re-embed ทั้งที่ไม่ต้อง หรือแย่กว่าคือ embed ข้อความที่ขาดค่านั้นไป
const JOB_COLUMNS =
  'title, company, description, required_skills, min_experience_years, location, category'

export type JobUpdateResult = {
  reembedded: boolean
  staleScoresRemoved: number
}

// แก้งานที่มีอยู่แล้ว คืน null เมื่อไม่มีงานนั้น (ผู้เรียกแปลงเป็น 404)
export async function updateJob(
  id: string,
  patch: Partial<JobInput>
): Promise<JobUpdateResult | null> {
  const db = getServerClient()

  const { data: before, error: readError } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (readError) {
    console.error('updateJob read failed:', readError)
    throw new Error('job read failed')
  }
  if (!before) return null

  // source/external_id เป็นข้อมูลที่มาของแถว ไม่ใช่เนื้อหา route ตัดทิ้งไปแล้ว
  // ตัดซ้ำที่นี่เพราะฟังก์ชันนี้อาจถูกเรียกจากที่อื่นในอนาคต
  const { source: _source, external_id: _externalId, ...safe } = patch
  const after = { ...(before as unknown as JobInput), ...safe }

  const reembedded = embedTextChanged(before as unknown as JobInput, after)
  const row: Record<string, unknown> = { ...safe }
  if (reembedded) row.embedding = await embedText(buildJobEmbedText(after))

  const { error: writeError } = await db.from('jobs').update(row).eq('id', id)
  if (writeError) {
    console.error('updateJob write failed:', writeError)
    throw new Error('job update failed')
  }

  // **ลบหลังบันทึกสำเร็จเท่านั้น** — ถ้าลบก่อนแล้วการบันทึกล้ม จะเสีย cache ไปฟรีๆ
  // ทั้งที่งานยังเป็นข้อความเดิม ลำดับนี้เลือกจากว่าความล้มเหลวแบบไหนแย่น้อยกว่า
  //
  // แถวพวกนี้ hash ไม่ตรงกับข้อความใหม่แล้วจึงไม่มีวันถูกอ่านอีก และเพราะ job_id
  // ยังชี้ไปที่งานที่ยังอยู่ มันจะไม่ถูก cascade กวาดตอนไหนเลย ไม่ลบตอนนี้เท่ากับ
  // ทุกครั้งที่แก้งานจะทิ้งขยะเพิ่มถาวร
  let staleScoresRemoved = 0
  if (requirementTextChanged(before as unknown as JobInput, after)) {
    const { data: removed, error: delError } = await db
      .from('analyses')
      .delete()
      .eq('job_id', id)
      .select('id')
    if (delError) {
      // ไม่โยนออกไป — งานถูกบันทึกสำเร็จแล้ว บอกผู้ใช้ว่า "ล้มเหลว" ตอนนี้จะผิด
      // แถวที่เหลือไม่มีใครอ่านได้อยู่แล้ว (hash ไม่ตรง) จึงไม่ทำอันตรายอะไร
      console.error('stale analyses cleanup failed:', delError)
    } else {
      staleScoresRemoved = (removed ?? []).length
    }
  }

  return { reembedded, staleScoresRemoved }
}

// ลบงานจริง แถว analyses ที่มี job_id ตรงกันหายไปเองด้วย FK cascade (migration 018)
// จึงไม่มีโค้ดกวาดที่ต้องจำไปเรียกทุกจุดที่ลบงาน
export async function deleteJob(id: string): Promise<{ deleted: boolean }> {
  const db = getServerClient()
  const { data, error } = await db.from('jobs').delete().eq('id', id).select('id')
  if (error) {
    console.error('deleteJob failed:', error)
    throw new Error('job delete failed')
  }
  return { deleted: (data ?? []).length > 0 }
}
