// แปลข้อความผิดพลาดจาก Supabase Auth เป็นภาษาไทยที่ผู้ใช้ทำอะไรต่อได้
//
// **ทำไมต้องมี** — `login/page.tsx` และ `signup/page.tsx` เคยทำ
// `setMsg(error.message)` ตรงๆ ผู้ใช้จึงเห็นข้อความอังกฤษเชิงเทคนิค
// UAT 15-18 ก.ย. เจอสองแบบกับตา:
//
//   "Invalid login credentials"  → ไม่บอกว่าต้องทำอะไรต่อ
//   "email rate limit exceeded"  → **ทำให้เข้าใจผิดหนักกว่าไม่มีข้อความ**
//                                  คนอ่านสรุปว่าอีเมลนี้ใช้สมัครไม่ได้
//                                  ทั้งที่ความจริงคือรอสักครู่แล้วได้
//
// เป็นบั๊กตระกูลเดียวกับข้อห้ามส่งข้อความ Postgres ดิบออกไป แค่คนละบริการ
//
// **เทียบด้วยคำสำคัญ ไม่ใช่ข้อความเต็ม** — Supabase ไม่ได้รับประกันข้อความเป็นสัญญา
// และเปลี่ยนถ้อยคำได้ทุกเวอร์ชัน การเทียบเต็มประโยคจะพังเงียบๆ ตอนอัปเกรด
// ส่วนที่แปลไม่ได้ตกไปที่ข้อความกลาง ไม่ปล่อยของดิบออกไป

export const GENERIC_AUTH_ERROR = 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'

type Rule = { match: RegExp; message: string }

const RULES: Rule[] = [
  // **ห้ามเขียนว่า "รหัสผ่านไม่ถูกต้อง"** — นั่นเท่ากับยืนยันว่าอีเมลนี้มีบัญชีอยู่
  // ซึ่งเป็นสิ่งที่ UAT ข้อ AU-04 ทดสอบว่าต้องไม่เกิด คนที่อยากรู้ว่าอีเมลไหน
  // เป็นสมาชิกก็แค่ลองล็อกอินด้วยรหัสมั่วแล้วดูว่าได้ข้อความไหน
  {
    match: /invalid login credentials/i,
    message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่',
  },
  // โควตา SMTP ของ Supabase free tier ต่ำมาก และหายเองเมื่อเวลาผ่านไป
  // **ต้องบอกให้รอ ไม่ใช่ให้เปลี่ยนอีเมล** สองอย่างนี้ผู้ใช้ทำต่างกันสิ้นเชิง
  {
    match: /rate limit|too many requests/i,
    message: 'ระบบส่งอีเมลถึงขีดจำกัดชั่วคราว กรุณารอสักครู่แล้วลองใหม่',
  },
  {
    match: /email not confirmed/i,
    message: 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาเปิดอีเมลแล้วกดลิงก์ยืนยันก่อน',
  },
  {
    match: /password should be at least|password.*too short/i,
    message: 'รหัสผ่านสั้นเกินไป กรุณาตั้งให้ยาวอย่างน้อย 6 ตัวอักษร',
  },
  {
    match: /unable to validate email|invalid email/i,
    message: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
  },
]

export function authErrorMessage(raw: string | null | undefined): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return GENERIC_AUTH_ERROR
  return RULES.find((r) => r.match.test(text))?.message ?? GENERIC_AUTH_ERROR
}
