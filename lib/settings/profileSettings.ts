// อ่านและรวมค่าในคอลัมน์ `profiles.settings` (jsonb)
//
// แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะสองเรื่องที่พลาดง่ายอยู่ที่นี่ทั้งคู่:
// การอ่านค่าจาก jsonb ที่อาจเป็น null และการเขียนที่ต้องไม่ลบคีย์อื่น

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** ค่าที่เติมให้อัตโนมัติในช่อง "ประเมินความเหมาะสม" — คืน '' เมื่อยังไม่เคยตั้ง */
export function readDefaultRequirement(settings: unknown): string {
  const v = asRecord(settings).defaultRequirement
  return typeof v === 'string' ? v : ''
}

/**
 * รวมค่าใหม่เข้ากับของเดิม **ไม่ใช่เขียนทับทั้งก้อน**
 *
 * เดิมหน้า `/settings` เขียน `update({ settings: { defaultRequirement } })` ตรงๆ
 * ซึ่งลบทุกคีย์ที่ไม่ได้ระบุ ตอนนี้ยังไม่กระทบเพราะมีคีย์เดียว **แต่วันที่เพิ่ม
 * คีย์ที่สอง การบันทึกคีย์แรกจะลบคีย์ที่สองทุกครั้งโดยไม่มี error อะไรเลย**
 *
 * คืนออบเจกต์ใหม่เสมอ ไม่แตะของเดิม
 */
export function mergeSettings(
  existing: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...asRecord(existing), ...patch }
}
