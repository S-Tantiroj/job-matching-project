// เทียบเลขรุ่นความพยายาม (attempt) ที่บันทึกไว้ตอนเริ่มคำขอ กับเลขรุ่นปัจจุบันของ
// คอมโพเนนต์ — ถ้าไม่ตรงกันแปลว่าผู้ใช้ไปเริ่มอย่างอื่นแล้วระหว่างที่คำขอเก่ายังไม่
// เสร็จ (กดย้อนกลับ, เริ่มอัปโหลดใหม่, ไปกรอกเอง) ต้องทิ้งผลของคำขอเก่าไปเงียบๆ
// ดึงออกมาเป็นฟังก์ชันล้วนเพื่อเทสต์ได้โดยไม่ต้อง mount คอมโพเนนต์ ตามแบบ
// buildTimeline ใน components/Timeline.tsx
export function isStaleAttempt(requestAttempt: number, currentAttempt: number): boolean {
  return requestAttempt !== currentAttempt
}
