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
