import { validateJobInput, JOB_TEXT_LIMITS, JOB_YEARS_RANGE } from './validate'

const ok = { title: 'Data Scientist', description: 'ทำงานกับข้อมูล' }
const long = (n: number) => 'ก'.repeat(n)

describe('ช่องบังคับ', () => {
  test('ครบผ่าน', () => {
    expect(validateJobInput(ok)).toBeNull()
  })

  test('ไม่มี title ตอนสร้างใหม่ไม่ผ่าน', () => {
    expect(validateJobInput({ description: 'x' })?.field).toBe('title')
  })

  test('ไม่มี description ตอนสร้างใหม่ไม่ผ่าน', () => {
    expect(validateJobInput({ title: 'x' })?.field).toBe('description')
  })

  test('ช่องว่างล้วนไม่นับว่ามีค่า', () => {
    expect(validateJobInput({ ...ok, title: '   ' })?.field).toBe('title')
  })

  // PATCH ที่แก้แค่สถานที่ ไม่ควรถูกบังคับให้ส่ง title/description มาด้วย
  test('partial: ไม่ส่ง title มาก็ผ่าน', () => {
    expect(validateJobInput({ location: 'Bangkok' }, { partial: true })).toBeNull()
  })

  test('partial: ส่ง title มาว่างยังต้องไม่ผ่าน', () => {
    expect(validateJobInput({ title: '' }, { partial: true })?.field).toBe('title')
  })
})

describe('ความยาว varchar(255)', () => {
  // นี่คือบั๊กที่ทำให้ผู้ใช้ได้ 500 เปล่าๆ ตอน POST และได้ข้อความ
  // "ระบบมีปัญหาชั่วคราว กรุณาลองใหม่" ตอน PATCH ทั้งที่ลองใหม่ก็ล้มเหมือนเดิม
  for (const field of Object.keys(JOB_TEXT_LIMITS) as (keyof typeof JOB_TEXT_LIMITS)[]) {
    const max = JOB_TEXT_LIMITS[field]

    test(`${field}: ยาวพอดี ${max} ผ่าน`, () => {
      expect(validateJobInput({ ...ok, [field]: long(max) })).toBeNull()
    })

    test(`${field}: ยาวเกินหนึ่งตัวไม่ผ่าน`, () => {
      const e = validateJobInput({ ...ok, [field]: long(max + 1) })
      expect(e?.field).toBe(field)
      // ข้อความต้องบอกตัวเลขจริง ไม่ใช่ "ยาวเกินไป" ลอยๆ ผู้ใช้ต้องรู้ว่าต้องตัดเท่าไร
      expect(e?.message).toContain(String(max))
      expect(e?.message).toContain(String(max + 1))
    })
  }

  test('วัดความยาวหลังตัดช่องว่างหัวท้าย เพราะนั่นคือค่าที่บันทึกจริง', () => {
    const v = '  ' + long(JOB_TEXT_LIMITS.title) + '  '
    expect(validateJobInput({ ...ok, title: v })).toBeNull()
  })

  test('ค่า null ของช่องไม่บังคับข้ามไป ไม่ใช่ error', () => {
    expect(validateJobInput({ ...ok, company: null, location: null })).toBeNull()
  })

  // description เป็น text ไม่มีเพดานใน DDL จึงต้องไม่ถูกจำกัดที่นี่
  test('description ยาวมากยังผ่าน เพราะคอลัมน์เป็น text', () => {
    expect(validateJobInput({ ...ok, description: long(50_000) })).toBeNull()
  })
})

describe('min_experience_years', () => {
  test('จำนวนเต็มในช่วงผ่าน', () => {
    expect(validateJobInput({ ...ok, min_experience_years: 5 })).toBeNull()
  })

  test('ขอบล่างและขอบบนผ่าน', () => {
    expect(validateJobInput({ ...ok, min_experience_years: JOB_YEARS_RANGE.min })).toBeNull()
    expect(validateJobInput({ ...ok, min_experience_years: JOB_YEARS_RANGE.max })).toBeNull()
  })

  // คนกรอก "3.5 ปี" จริง และคอลัมน์เป็น integer ซึ่ง Postgres ปฏิเสธ
  test('ทศนิยมไม่ผ่าน', () => {
    const e = validateJobInput({ ...ok, min_experience_years: 3.5 })
    expect(e?.field).toBe('min_experience_years')
    expect(e?.message).toContain('จำนวนเต็ม')
  })

  test('ติดลบไม่ผ่าน', () => {
    expect(validateJobInput({ ...ok, min_experience_years: -1 })?.field).toBe(
      'min_experience_years'
    )
  })

  // เกินขอบเขตของ integer ใน Postgres จะพังที่ฐานข้อมูล ต้องกันไว้ก่อน
  test('มากเกินจริงไม่ผ่าน', () => {
    expect(validateJobInput({ ...ok, min_experience_years: 99_999_999_999 })?.field).toBe(
      'min_experience_years'
    )
  })

  test('ค่าที่ไม่ใช่ตัวเลขไม่ผ่าน', () => {
    expect(validateJobInput({ ...ok, min_experience_years: 'สามปี' })?.field).toBe(
      'min_experience_years'
    )
  })

  test('null และสตริงว่างแปลว่าไม่ระบุ ไม่ใช่ error', () => {
    expect(validateJobInput({ ...ok, min_experience_years: null })).toBeNull()
    expect(validateJobInput({ ...ok, min_experience_years: '' })).toBeNull()
  })

  test('ไม่ส่งมาเลยก็ผ่าน', () => {
    expect(validateJobInput(ok)).toBeNull()
  })
})

test('เพดานตรงกับ DDL จริงของตาราง jobs', () => {
  // ยืนยันกับ information_schema เมื่อ 2026-09-09 — ถ้าวันหนึ่งมีคนขยายคอลัมน์
  // ในฐานข้อมูล ต้องมาแก้ที่นี่ด้วย ไม่งั้นระบบจะกันสิ่งที่ฐานข้อมูลยอมรับได้แล้ว
  expect(JOB_TEXT_LIMITS).toEqual({ title: 255, company: 255, location: 255, category: 255 })
})
