// วิธีแสดง "ใคร" ให้ตรงกันทุกหน้า
//
// **`display_name` เป็นค่าที่ผู้ใช้ตั้งเองได้ จึงเชื่อเป็นตัวระบุตัวตนไม่ได้**
// ผู้ใช้ตั้งชื่อตัวเองเป็นอีเมลของเพื่อนร่วมงานได้ แล้วบันทึกใน activity_log
// จะชี้ไปผิดคนโดยไม่มีอะไรบอก — ซึ่งทำลายเหตุผลเดียวที่ตารางนั้นมีอยู่
//
// `email` มาจาก auth.users ผ่าน trigger (migration 021) และผู้ใช้แก้ไม่ได้
// (migration 019 คืนสิทธิ์ UPDATE ให้เฉพาะ display_name กับ settings)
// **จึงต้องแสดงอีเมลกำกับเสมอเมื่อชื่อที่แสดงไม่ใช่อีเมล** ไม่ใช่แสดงแค่ชื่อ

export type IdentitySource = {
  display_name?: string | null
  email?: string | null
}

const clean = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '')

/**
 * ชื่อหลักที่แสดง — ชื่อที่ผู้ใช้ตั้ง ถ้าไม่มีใช้อีเมล ถ้าไม่มีทั้งคู่ใช้ `fallback`
 *
 * `fallback` ปกติเป็น uuid สำหรับหน้าแอดมิน เพราะแถวที่ไม่มีทั้งชื่อและอีเมล
 * ยังต้องกดแก้ role ได้ — แสดงว่างเปล่าแล้วแอดมินจะไม่รู้ว่ากำลังแก้ของใคร
 */
export function identityName(p: IdentitySource, fallback = ''): string {
  return clean(p.display_name) || clean(p.email) || fallback
}

/**
 * อีเมลกำกับใต้ชื่อ — คืน `null` เมื่อไม่ควรแสดง
 *
 * ไม่แสดงเมื่อชื่อหลัก**คือ**อีเมลอยู่แล้ว (ค่าตั้งต้นของผู้ใช้ใหม่) ไม่งั้นจะได้
 * "a@b.com (a@b.com)" ซึ่งเป็นขยะสายตาที่ทำให้คนเลิกอ่านบรรทัดนั้นทั้งบรรทัด
 * แล้วอีเมลกำกับจะหมดประโยชน์ในกรณีที่มันสำคัญจริง
 *
 * เทียบแบบไม่สนตัวพิมพ์และตัดช่องว่างหัวท้าย — "A@B.com " กับ "a@b.com"
 * เป็นค่าเดียวกันในสายตาคน การแสดงซ้ำเพราะต่างกันแค่ตัวพิมพ์คือ noise
 */
export function identitySecondary(p: IdentitySource): string | null {
  const email = clean(p.email)
  if (!email) return null
  const name = clean(p.display_name)
  if (!name) return null
  return name.toLowerCase() === email.toLowerCase() ? null : email
}

export const DISPLAY_NAME_MAX = 60

/**
 * ตรวจและทำความสะอาดชื่อที่ผู้ใช้กรอก ก่อนบันทึก
 *
 * **ตัดช่องว่างหัวท้ายเสมอ** — ชื่อที่มีช่องว่างนำหน้าจะดูเหมือนชื่อธรรมดาทุกประการ
 * แต่เรียงลำดับผิดและเทียบกับค่าอื่นไม่ตรง ซึ่งเป็นบั๊กที่หาสาเหตุยากมาก
 *
 * **ไม่ห้ามตั้งชื่อที่มีรูปแบบอีเมล** ทั้งที่เป็นช่องทางปลอมตัวที่ชัดที่สุด เพราะ
 * ค่าตั้งต้นของทุกคนคืออีเมลของตัวเองอยู่แล้ว การห้ามจะทำให้ผู้ใช้กดบันทึกชื่อเดิม
 * ไม่ผ่านโดยไม่เข้าใจว่าทำไม การป้องกันอยู่ที่การแสดงอีเมลจริงกำกับเสมอแทน
 * (`identitySecondary`) ซึ่งกันได้ทุกรูปแบบของการปลอม ไม่ใช่แค่รูปแบบอีเมล
 */
export function normalizeDisplayName(
  input: string
): { ok: true; value: string } | { ok: false; reason: string } {
  const value = clean(input)
  if (!value) return { ok: false, reason: 'กรอกชื่อที่ต้องการแสดง' }
  if (value.length > DISPLAY_NAME_MAX) {
    return { ok: false, reason: `ชื่อยาวเกิน ${DISPLAY_NAME_MAX} ตัวอักษร` }
  }
  return { ok: true, value }
}
