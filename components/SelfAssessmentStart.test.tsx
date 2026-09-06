import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

// สภาพแวดล้อมทดสอบนี้ (run-tests.mjs + alias-hook.mjs) ไม่มี resolver ให้ 'next/navigation'
// เพราะแพ็กเกจ next ไม่มี field "exports" ที่แม็ปพาธย่อยนี้ — ของจริง webpack/vitest
// แก้ปัญหานี้ให้เองตอน build/รันเทสต์ แต่ loader เฉพาะกิจของแซนด์บ็อกซ์นี้ไม่ได้ทำ
// (และห้ามแก้ alias-hook.mjs ตามข้อกำหนดของรอบแก้นี้) จึงต้องลงทะเบียน resolver
// เพิ่มเฉพาะไฟล์เทสต์นี้ ชี้ specifier ไปที่ไฟล์จริงตรงๆ ก่อนจะ import คอมโพเนนต์
// ที่เรียก useRouter — ไม่แตะโค้ดจริงหรือไฟล์ runner/hook ที่มีอยู่แล้วเลย
const ROOT = process.env.SDD_ROOT ?? process.cwd()
const navUrl = pathToFileURL(path.join(ROOT, 'node_modules/next/navigation.js')).href
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === 'next/navigation') {
          return { url: ${JSON.stringify(navUrl)}, shortCircuit: true }
        }
        return nextResolve(specifier, context)
      }
    `)
)

const { isStaleAttempt } = await import('./SelfAssessmentStart')

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
