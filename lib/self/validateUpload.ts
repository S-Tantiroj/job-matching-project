// ตรวจไฟล์ที่อัปโหลดก่อนส่งเข้า Gemini ฟังก์ชันบริสุทธิ์
//
// รับค่าพื้นฐาน { type, size } แทน object File เพื่อให้เขียนเทสต์ได้โดยไม่ต้องสร้าง
// File จำลองใน Node — route เป็นคนดึงสองฟิลด์นี้จาก File มาส่งให้
//
// 4MB เพราะ Vercel จำกัด request body ที่ 4.5MB การกันไว้ที่ 4MB ทำให้ผู้ใช้เห็น
// ข้อความที่เข้าใจได้ แทนที่จะโดน platform ตัดทิ้งแบบไม่มีสัญญาณ

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export function validateUpload(
  input: { type?: string; size?: number } | null
): string | null {
  if (!input) return 'กรุณาเลือกไฟล์ PDF'
  if (input.type !== 'application/pdf') return 'รองรับเฉพาะไฟล์ PDF เท่านั้น'
  if (typeof input.size !== 'number' || input.size <= 0) return 'ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่'
  if (input.size > MAX_UPLOAD_BYTES) return 'ไฟล์ใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 4MB'
  return null
}
