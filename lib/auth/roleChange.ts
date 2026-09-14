import type { Role } from './session'

// ตรวจคำขอเปลี่ยนสิทธิ์ก่อนแตะฐานข้อมูล
//
// **กฎหลักคือแอดมินลดสิทธิ์ตัวเองไม่ได้** — เดิม `POST /api/admin/users` ตรวจแค่ว่า
// ผู้เรียกเป็นแอดมิน ไม่ได้ตรวจว่ากำลังแก้ใคร แอดมินจึงกด `RoleSelect` บนแถวของ
// ตัวเองเปลี่ยนเป็น member ได้ทันที **ถ้าเป็นแอดมินคนเดียว ระบบจะไม่เหลือใคร
// ที่ตั้งแอดมินได้อีกเลย** เพราะ endpoint นี้เป็นทางเดียวในแอปที่เปลี่ยน role ได้
// กู้ได้ทางเดียวคือเปิด Supabase SQL editor แล้วรัน UPDATE เอง ซึ่งคนที่ไม่ใช่
// ผู้พัฒนาทำไม่ได้ — เป็นความผิดพลาดหนึ่งคลิกที่กู้ในแอปไม่ได้
//
// **ข้อจำกัดที่ต้องรู้ตรงๆ: กฎนี้ไม่ได้รับประกันว่าจะมีแอดมินเหลืออย่างน้อยหนึ่งคนเสมอ**
// แอดมินสองคนที่กดลดสิทธิ์ของ *อีกฝ่าย* พร้อมกัน จะผ่านทั้งคู่แล้วเหลือศูนย์คน
// กรณีนั้นต้องนับแอดมินที่เหลือก่อนเขียน ซึ่งก็ยังมีช่องว่างระหว่างการนับกับการเขียน
// อยู่ดี จึงเลือกกันเฉพาะกรณีที่เกิดจริง (คนเดียว คลิกเดียว บนแถวตัวเอง)
// แล้วบันทึกข้อจำกัดไว้ตรงนี้ แทนที่จะอ้างว่าปิดสนิททั้งที่ไม่ใช่

/** ต้องตรงกับ enum `user_role` ในฐานข้อมูล (migration 009) */
export const ROLE_VALUES = ['admin', 'data_manager', 'member'] as const

export type RoleChangeInput = {
  /** id ของคนที่กดคำสั่ง มาจากเซสชันเท่านั้น ห้ามรับจาก body */
  actorId: string
  targetUserId: string
  nextRole: string
}

export type RoleChangeCheck =
  | { ok: true; role: Role }
  | { ok: false; reason: string }

export function checkRoleChange(input: RoleChangeInput): RoleChangeCheck {
  const target = input.targetUserId?.trim() ?? ''
  if (!target) return { ok: false, reason: 'ไม่ได้ระบุว่าจะเปลี่ยนสิทธิ์ของใคร' }

  if (!(ROLE_VALUES as readonly string[]).includes(input.nextRole)) {
    return { ok: false, reason: 'ระดับสิทธิ์ที่ส่งมาไม่ถูกต้อง' }
  }
  const role = input.nextRole as Role

  // เทียบตรงตัว — id ที่เป็นคำนำหน้าของอีก id ต้องไม่นับว่าเป็นคนเดียวกัน
  if (target === input.actorId && role !== 'admin') {
    return {
      ok: false,
      reason:
        'ลดสิทธิ์ของตัวเองไม่ได้ — ถ้าคุณเป็นแอดมินคนสุดท้าย จะไม่เหลือใครตั้งแอดมินได้อีก ให้ตั้งแอดมินคนใหม่ก่อน แล้วให้คนนั้นเป็นคนลดสิทธิ์ให้',
    }
  }

  return { ok: true, role }
}
