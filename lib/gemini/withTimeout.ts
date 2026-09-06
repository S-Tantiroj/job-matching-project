// เพดานเวลาต่อการเรียกโมเดลหนึ่งครั้ง
//
// จำเป็นเพราะ free tier เคยตอบคำขอ 20 token ช้าถึง 52 วินาที และตอบ 503 หลังรอ
// 155 วินาที การไม่มีเพดานแปลว่าผู้ใช้ที่กดปุ่มค้างรอไปเรื่อยๆ โดยไม่มีอะไรบอก
// และ Vercel จะตัดการเชื่อมต่อเองด้วยข้อความที่ไม่สื่อความ
export const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 20000)

// Promise.race ไม่ได้ยกเลิกคำขอที่ค้างจริง แต่ปลดล็อกฝั่งเรียกให้ตอบผู้ใช้ได้
// ซึ่งเป็นสิ่งที่ต้องการ ณ จุดนี้
export async function withTimeout<T>(p: Promise<T>, ms = GEMINI_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`gemini timeout after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

// free tier ตัดคำขอตามความจุ (503) และจำกัดจำนวนครั้งต่อนาที (429)
// สองอย่างนี้หายเองเมื่อลองใหม่ ต่างจาก 400/404 ที่ลองกี่ครั้งก็เหมือนเดิม
export function isTransient(e: unknown): boolean {
  const s = String((e as any)?.message ?? e)
  return s.includes('503') || s.includes('429') || s.includes('UNAVAILABLE') || s.includes('timeout')
}

// บัญชีหรือคีย์ใช้ไม่ได้ — คนละเรื่องกับ "ไม่ว่างชั่วคราว" และคนละเรื่องกับ "ไฟล์มีปัญหา"
//
// เจอจริงเมื่อ 2026-09-07: Gemini ตอบ 403 PERMISSION_DENIED "Your project has been
// denied access" ซึ่งเป็นการที่ Google ตั้งสถานะโปรเจกต์เป็น Restricted ไม่ใช่โควตาหมด
// ตอนนั้นโค้ดจัดมันลงถังสุดท้ายแล้วบอกผู้ใช้ว่า "อ่านไฟล์ไม่สำเร็จ กรุณาตรวจว่าไฟล์
// ไม่เสียหาย" — ผู้ใช้จึงไปนั่งแก้ไฟล์ที่ไม่ได้ผิดอะไรเลย ส่วนฝั่งบันทึกบอกว่า
// "กรุณาลองใหม่" ทั้งที่กดกี่ครั้งก็ไม่มีวันสำเร็จจนกว่าจะแก้ที่บัญชี
//
// **ห้ามลองใหม่อัตโนมัติเมื่อเจอกรณีนี้** การลองซ้ำไม่ช่วยอะไรและทำให้ผู้ใช้รอนานขึ้น
export function isServiceBlocked(e: unknown): boolean {
  const s = String((e as any)?.message ?? e)
  return (
    s.includes('PERMISSION_DENIED') ||
    s.includes('UNAUTHENTICATED') ||
    s.includes('API key not valid') ||
    s.includes('"code":403') ||
    s.includes('"code":401')
  )
}
