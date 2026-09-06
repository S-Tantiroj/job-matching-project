import { isStaleAttempt } from './staleAttempt'

test('isStaleAttempt is false when the request attempt still matches current', () => {
  expect(isStaleAttempt(1, 1)).toBe(false)
  expect(isStaleAttempt(0, 0)).toBe(false)
})

test('isStaleAttempt is true once the user has moved on to a newer attempt', () => {
  // จำลอง: อัปโหลดเริ่มตอนเลขรุ่น 1 แต่ผู้ใช้กดย้อนกลับ/กรอกเองก่อนคำขอจะเสร็จ
  // ทำให้เลขรุ่นปัจจุบันขยับไปเป็น 2 แล้ว — ผลของคำขอเก่าต้องถูกทิ้ง
  expect(isStaleAttempt(1, 2)).toBe(true)
})

test('isStaleAttempt treats any mismatch as stale regardless of direction', () => {
  expect(isStaleAttempt(5, 3)).toBe(true)
})
