import type { JobInput } from './normalize'

// ตรวจความยาวและช่วงค่าให้ตรงกับข้อจำกัดจริงของตาราง `jobs` **ก่อน**แตะฐานข้อมูล
//
// ============================================================================
// ทำไมต้องมีไฟล์นี้
// ============================================================================
// ตาราง `jobs` ถูกสร้างก่อนโปรเจกต์นี้ (โดย `import_jobs.py` ซึ่งไม่อยู่ในรีโป)
// จึงไม่มี migration ให้อ่าน และไม่มีใครเคยเห็นว่ามันตั้ง `varchar(255)` ไว้
// ยืนยันกับ `information_schema` เมื่อ 2026-09-09 ว่า:
//   title / company / location / category  →  varchar(255)
//   min_experience_years                   →  integer
//   description                            →  text (ไม่จำกัด)
//
// เดิมไม่มีด่านกั้นเลยสักชั้น — ฟอร์มไม่มี `maxLength` และ route ตรวจแค่ว่า
// title/description ไม่ว่าง ผลคือชื่อตำแหน่งยาวเกิน 255 ตัวทำให้ Postgres ตอบ
// `value too long for type character varying(255)` แล้ว:
//   POST  → `upsertJob` โยน error ที่ไม่มีใครรับ ผู้ใช้ได้ 500 เปล่าๆ
//   PATCH → catch-all ตอบว่า "ระบบมีปัญหาชั่วคราว กรุณาลองใหม่"
//
// **ข้อความของ PATCH ผิดหนักกว่าการไม่มีข้อความ** — มันบอกให้ผู้ใช้ลองใหม่
// ทั้งที่ลองอีกกี่ครั้งก็ล้มเหมือนเดิม เพราะสาเหตุอยู่ที่ข้อมูลที่กรอก ไม่ใช่ที่ระบบ
// ผู้ใช้จะกดซ้ำแล้วสรุปว่าเว็บพัง ทั้งที่แค่ต้องตัดข้อความให้สั้นลง
//
// **ด่านที่ฟอร์มอย่างเดียวไม่พอ** `maxLength` กันได้แค่การพิมพ์ ไม่ได้กันการวาง
// หรือคำขอที่ยิงตรงมาที่ API — body มาจาก client ที่เชื่อไม่ได้เสมอ

/** ความยาวสูงสุดของคอลัมน์ที่เป็น varchar (ตรงกับ DDL จริง) */
export const JOB_TEXT_LIMITS = {
  title: 255,
  company: 255,
  location: 255,
  category: 255,
} as const

/**
 * ช่วงของ `min_experience_years`
 *
 * คอลัมน์เป็น `integer` ซึ่งรับได้ถึง 2,147,483,647 แต่เพดานที่มีความหมายกับงาน
 * จริงต่ำกว่านั้นมาก **สำคัญกว่าเพดานคือการห้ามทศนิยม** — ช่อง `type="number"`
 * ยอมให้พิมพ์ "3.5" ได้ แล้ว `Number('3.5')` ได้ 3.5 ซึ่ง Postgres ปฏิเสธเพราะ
 * คอลัมน์เป็นจำนวนเต็ม เป็นค่าที่คนกรอกจริงโดยไม่รู้ว่าผิด
 */
export const JOB_YEARS_RANGE = { min: 0, max: 80 } as const

const LABELS: Record<string, string> = {
  title: 'ตำแหน่งงาน',
  company: 'บริษัท',
  location: 'สถานที่',
  category: 'หมวดงาน',
}

export type JobFieldError = { field: string; message: string }

/**
 * คืน error ตัวแรกที่เจอ หรือ `null` เมื่อผ่าน
 *
 * `partial: true` สำหรับ PATCH — ตรวจเฉพาะคีย์ที่ส่งมาจริง ไม่บังคับว่าต้องมี
 * title/description เพราะการแก้เฉพาะบางช่องเป็นเรื่องปกติ
 */
export function validateJobInput(
  input: Record<string, unknown>,
  opts: { partial?: boolean } = {}
): JobFieldError | null {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(input, k)

  // ช่องบังคับ — ตรวจเฉพาะตอนสร้างใหม่ หรือตอนที่ PATCH ส่งค่านั้นมาด้วย
  for (const k of ['title', 'description']) {
    if (!opts.partial || has(k)) {
      if (!String(input[k] ?? '').trim()) {
        return {
          field: k,
          message: k === 'title' ? 'ตำแหน่งงานห้ามว่าง' : 'รายละเอียดงานห้ามว่าง',
        }
      }
    }
  }

  for (const [field, max] of Object.entries(JOB_TEXT_LIMITS)) {
    if (!has(field)) continue
    const raw = input[field]
    if (raw == null) continue
    // นับความยาวหลังตัดช่องว่างหัวท้าย เพราะนั่นคือค่าที่จะถูกบันทึกจริง
    const value = String(raw).trim()
    if (value.length > max) {
      return {
        field,
        message: `${LABELS[field]}ยาวเกินไป (${value.length} ตัวอักษร สูงสุด ${max})`,
      }
    }
  }

  if (has('min_experience_years')) {
    const raw = input.min_experience_years
    if (raw != null && raw !== '') {
      const n = Number(raw)
      if (!Number.isFinite(n)) {
        return { field: 'min_experience_years', message: 'ประสบการณ์ขั้นต่ำต้องเป็นตัวเลข' }
      }
      if (!Number.isInteger(n)) {
        return {
          field: 'min_experience_years',
          message: 'ประสบการณ์ขั้นต่ำต้องเป็นจำนวนเต็ม ใส่ทศนิยมไม่ได้',
        }
      }
      if (n < JOB_YEARS_RANGE.min || n > JOB_YEARS_RANGE.max) {
        return {
          field: 'min_experience_years',
          message: `ประสบการณ์ขั้นต่ำต้องอยู่ระหว่าง ${JOB_YEARS_RANGE.min}-${JOB_YEARS_RANGE.max} ปี`,
        }
      }
    }
  }

  return null
}

/** ตัวช่วยให้ route เรียกสั้นๆ โดยยังได้ชนิดที่แคบลง */
export function isValidJobInput(input: Record<string, unknown>): input is JobInput {
  return validateJobInput(input) === null
}
