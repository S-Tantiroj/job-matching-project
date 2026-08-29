import { getServerClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity/log'

export type RemoveOutcome = {
  deleted: number
  suppressed: number
  notFound: number
  /** ชื่อคนที่ระงับไม่ได้เพราะไม่มี linkedin_url — ลบแล้ว แต่กันการนำเข้าซ้ำไม่ได้ */
  unblockable: string[]
}

export type RemovableRow = { source: string; linkedin_url: string | null }

// คนที่ลบเฉยๆ แล้วจะกลับมาเองในรอบ sync ถัดไป
//
// การเช็ครายชื่อระงับใน upsertCandidate คือสิ่งเดียวที่กันคนกลับเข้ามาได้ ผู้สมัคร
// ที่มาจาก scraper และยังมี linkedin_url จึงถูกดึงกลับมาทุกครั้งที่สคริปต์เจอเขาอีก
// UI ต้องเตือนก่อน ไม่งั้นปุ่มลบจะดูเหมือนพัง
export function isReimportable(row: RemovableRow): boolean {
  return row.source === 'scraper' && !!row.linkedin_url?.trim()
}

// ลบผู้สมัครหนึ่งคนหรือหลายคน พร้อมตัวเลือกบันทึกรายชื่อระงับก่อนลบ
//
// ตารางลูกทั้งห้า (education, experience, candidate_skills, analyses,
// shortlist_candidates) ตั้ง on delete cascade ไว้แล้ว จึงไม่ต้องไล่ลบเอง
export async function removeCandidates(
  ids: string[],
  opts: { suppress: boolean; userId: string; reason?: string }
): Promise<{ ok: true; result: RemoveOutcome } | { ok: false; status: number; error: string }> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim()))]
  if (!unique.length) return { ok: false, status: 400, error: 'ไม่ได้เลือกรายการที่จะลบ' }

  const db = getServerClient()

  const { data: rows, error: findError } = await db
    .from('candidates')
    .select('id, full_name, linkedin_url, source')
    .in('id', unique)
  if (findError) {
    console.error('remove: lookup failed:', findError.message)
    return { ok: false, status: 500, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }
  }

  const found = (rows ?? []) as { id: string; full_name: string; linkedin_url: string | null; source: string }[]
  if (!found.length) return { ok: false, status: 404, error: 'ไม่พบรายการที่เลือก' }

  const withUrl = found.filter((r) => r.linkedin_url?.trim())
  const unblockable = opts.suppress ? found.filter((r) => !r.linkedin_url?.trim()).map((r) => r.full_name) : []

  // บันทึกรายชื่อระงับ "ก่อน" ลบเสมอ — ถ้าลบก่อนแล้วการบันทึกล้ม จะได้สถานะที่แย่ที่สุด
  // คือข้อมูลหายแต่คืนถัดไปกลับมาใหม่ ลำดับนี้ยกมาจาก /api/candidates/[id]/suppress
  // และห้ามสลับ
  if (opts.suppress && withUrl.length) {
    const { error: supError } = await db.from('suppressed_profiles').upsert(
      withUrl.map((r) => ({
        linkedin_url: r.linkedin_url,
        full_name: r.full_name,
        reason: opts.reason?.trim() || null,
        created_by: opts.userId,
      })),
      { onConflict: 'linkedin_url' }
    )
    if (supError) {
      console.error('remove: suppress failed:', supError.message)
      return { ok: false, status: 500, error: 'บันทึกรายชื่อระงับไม่สำเร็จ ยังไม่ได้ลบข้อมูลใดๆ' }
    }
  }

  const { error: delError } = await db
    .from('candidates')
    .delete()
    .in('id', found.map((r) => r.id))
  if (delError) {
    console.error('remove: delete failed:', delError.message)
    return { ok: false, status: 500, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }
  }

  // เก็บกวาดคิวรอตรวจด้วย ไม่งั้นคนที่เพิ่งลบยังค้างรอให้คนอนุมัติอยู่
  if (opts.suppress && withUrl.length) {
    await db
      .from('pending_candidates')
      .delete()
      .in('linkedin_url', withUrl.map((r) => r.linkedin_url as string))
  }

  // บันทึกหลังลบสำเร็จ และเก็บชื่อไว้ในบันทึกเลย เพราะหลังจากนี้ไม่มีที่ไหนให้ join
  // กลับไปหาชื่อได้อีก — นี่คือเหตุผลทั้งหมดที่ activity_log ต้อง denormalize
  const names = found.map((r) => r.full_name)
  await logActivity({
    actorId: opts.userId,
    action: opts.suppress ? 'suppress' : 'delete',
    entityType: 'candidate',
    entityId: found.length === 1 ? found[0].id : null,
    summary:
      found.length === 1
        ? names[0]
        : `${names.slice(0, 3).join(', ')}${found.length > 3 ? ` และอีก ${found.length - 3} คน` : ''}`,
    count: found.length,
    metadata: { names, suppressed: opts.suppress ? withUrl.length : 0, reason: opts.reason || null },
  })

  return {
    ok: true,
    result: {
      deleted: found.length,
      suppressed: opts.suppress ? withUrl.length : 0,
      notFound: unique.length - found.length,
      unblockable,
    },
  }
}
