import { getServerClient } from '@/lib/supabase/server'

export type Action =
  | 'ingest'
  | 'delete'
  | 'suppress'
  | 'approve'
  | 'reject'
  // ไม่มีอะไรผลิต 'edit' อีกแล้วหลังถอดการแก้ไขด้วยมือออก — เก็บไว้เพื่อให้แถวเก่า
  // ในบันทึกยังแสดงป้ายภาษาไทยได้ ไม่ใช่โผล่เป็นคีย์ดิบ
  | 'edit'
  | 'view'
  | 'shortlist_create'
  | 'shortlist_add'
  | 'shortlist_remove'

export type EntityType = 'candidate' | 'shortlist' | 'run'

export type ActivityInput = {
  /** null = ระบบทำเอง (cron) ไม่ใช่คน */
  actorId: string | null
  action: Action
  entityType: EntityType
  entityId?: string | null
  /** ข้อความอ่านง่าย ต้องอ่านรู้เรื่องแม้ข้อมูลที่อ้างถึงถูกลบไปแล้ว */
  summary: string
  count?: number
  metadata?: Record<string, unknown>
}

// การกระทำที่คนทำถี่จนบันทึกทุกครั้งจะกลบบันทึกอื่นจนหมด — หน้าข้อมูลซ่อนไว้
// โดยปริยาย แต่ dashboard ใช้แสดง "ผู้สมัครที่เพิ่งดู"
export const NOISY_ACTIONS: Action[] = ['view']

export const ACTION_LABELS: Record<Action, string> = {
  ingest: 'นำเข้าข้อมูล',
  delete: 'ลบผู้สมัคร',
  suppress: 'ระงับการนำเข้า',
  approve: 'อนุมัติจากคิว',
  reject: 'ปฏิเสธจากคิว',
  edit: 'แก้ไขข้อมูล',
  view: 'เปิดดู',
  shortlist_create: 'สร้าง shortlist',
  shortlist_add: 'เพิ่มเข้า shortlist',
  shortlist_remove: 'เอาออกจาก shortlist',
}

// บันทึกกิจกรรม — ห้ามทำให้งานหลักล้ม
//
// การบันทึกเป็นผลพลอยได้ ไม่ใช่ผลลัพธ์ ถ้าเขียน log ไม่สำเร็จแล้วไปโยน error
// ต่อผู้ใช้ จะกลายเป็นว่าลบข้อมูลสำเร็จแล้วแต่หน้าจอขึ้นว่าล้มเหลว ซึ่งแย่กว่า
// การไม่มีบันทึกมาก จึงกลืน error ไว้และ log ลง console ฝั่งเซิร์ฟเวอร์แทน
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    const { error } = await getServerClient().from('activity_log').insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      count: input.count ?? 1,
      metadata: input.metadata ?? null,
    })
    if (error) console.error('activity log failed:', error.message)
  } catch (e) {
    console.error('activity log threw:', e)
  }
}
