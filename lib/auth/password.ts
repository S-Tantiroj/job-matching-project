// ตรวจฟอร์มเปลี่ยนรหัสผ่านก่อนยิงไป Supabase คืน null เมื่อผ่าน
// ความยาวขั้นต่ำ 6 ตัวอักษรตรงกับค่าเริ่มต้นของ Supabase Auth
export function validatePasswordChange(
  current: string,
  next: string,
  confirm: string
): string | null {
  if (!current || !next || !confirm) return 'กรุณากรอกข้อมูลให้ครบทุกช่อง'
  if (next.length < 6) return 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร'
  if (next !== confirm) return 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
  if (next === current) return 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'
  return null
}
