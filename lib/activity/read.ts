import { getServerClient } from '@/lib/supabase/server'
import { NOISY_ACTIONS, type Action, type EntityType } from './log'

export type ActivityRow = {
  id: string
  actor_id: string | null
  actor_name: string | null
  action: Action
  entity_type: EntityType
  entity_id: string | null
  summary: string
  count: number
  created_at: string
}

// ชื่อผู้กระทำถูก resolve ตอนอ่าน ไม่ใช่ตอนเขียน — ผู้ใช้เปลี่ยนชื่อได้ และเราอยาก
// เห็นชื่อปัจจุบัน ต่างจาก summary ที่ต้องแช่แข็งไว้เพราะสิ่งที่อ้างถึงอาจถูกลบ
async function withActorNames(rows: any[]): Promise<ActivityRow[]> {
  const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()

  if (ids.length) {
    const { data } = await getServerClient().from('profiles').select('id, display_name').in('id', ids)
    for (const p of (data ?? []) as any[]) {
      if (p.display_name) names.set(p.id, p.display_name)
    }
  }

  return rows.map((r) => ({
    id: r.id,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? names.get(r.actor_id) ?? null : null,
    action: r.action,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    summary: r.summary,
    count: r.count,
    created_at: r.created_at,
  }))
}

/** บันทึกทั้งระบบ สำหรับหน้าจัดการข้อมูล (กั้น data_manager ที่ตัวหน้าแล้ว) */
export async function listAllActivity(limit = 40): Promise<ActivityRow[]> {
  const { data, error } = await getServerClient()
    .from('activity_log')
    .select('id, actor_id, action, entity_type, entity_id, summary, count, created_at')
    .not('action', 'in', `(${NOISY_ACTIONS.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('listAllActivity failed:', error.message)
    return []
  }
  return withActorNames(data ?? [])
}

/** บันทึกของผู้ใช้คนเดียว สำหรับ dashboard */
export async function listMyActivity(userId: string, limit = 12): Promise<ActivityRow[]> {
  const { data, error } = await getServerClient()
    .from('activity_log')
    .select('id, actor_id, action, entity_type, entity_id, summary, count, created_at')
    .eq('actor_id', userId)
    .not('action', 'in', `(${NOISY_ACTIONS.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('listMyActivity failed:', error.message)
    return []
  }
  return withActorNames(data ?? [])
}

export type ViewedCandidate = { id: string; full_name: string; headline: string | null; at: string }

// ผู้สมัครที่ผู้ใช้เพิ่งเปิดดู — ยุบให้เหลือคนละหนึ่งบรรทัด
//
// ดึงมาเกินแล้วค่อยยุบฝั่งแอป เพราะ distinct on ทำผ่าน PostgREST ไม่ได้ และการ
// รีเฟรชหน้าเดิมซ้ำๆ จะสร้างแถวซ้ำจำนวนมากซึ่งไม่ควรกินที่ในรายการ
export async function listRecentlyViewed(userId: string, limit = 6): Promise<ViewedCandidate[]> {
  const { data, error } = await getServerClient()
    .from('activity_log')
    .select('entity_id, summary, metadata, created_at')
    .eq('actor_id', userId)
    .eq('action', 'view')
    .order('created_at', { ascending: false })
    .limit(limit * 12)

  if (error) {
    console.error('listRecentlyViewed failed:', error.message)
    return []
  }

  const seen = new Map<string, ViewedCandidate>()
  for (const r of (data ?? []) as any[]) {
    if (!r.entity_id || seen.has(r.entity_id)) continue
    seen.set(r.entity_id, {
      id: r.entity_id,
      full_name: r.summary,
      // headline อยู่ใน metadata ไม่ใช่ต่อท้าย summary — การแยกด้วยตัวคั่นในสตริง
      // จะพังทันทีที่ชื่อหรือตำแหน่งมีตัวคั่นนั้นอยู่
      headline: (r.metadata?.headline as string) ?? null,
      at: r.created_at,
    })
    if (seen.size >= limit) break
  }

  if (!seen.size) return []

  // ทิ้งคนที่ถูกลบไปแล้ว — ลิงก์ที่กดแล้วเจอ 404 แย่กว่าไม่แสดง
  const { data: alive } = await getServerClient()
    .from('candidates')
    .select('id')
    .in('id', [...seen.keys()])
  const aliveIds = new Set((alive ?? []).map((c: any) => c.id))

  return [...seen.values()].filter((v) => aliveIds.has(v.id))
}
