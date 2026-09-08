import {
  identityName,
  identitySecondary,
  normalizeDisplayName,
  DISPLAY_NAME_MAX,
} from './identity'

describe('identityName', () => {
  test('ใช้ชื่อที่ผู้ใช้ตั้งก่อน', () => {
    expect(identityName({ display_name: 'ตั้ม', email: 'a@b.com' })).toBe('ตั้ม')
  })

  test('ไม่มีชื่อให้ใช้อีเมล', () => {
    expect(identityName({ display_name: null, email: 'a@b.com' })).toBe('a@b.com')
  })

  test('ชื่อที่มีแต่ช่องว่างไม่นับว่ามีชื่อ', () => {
    expect(identityName({ display_name: '   ', email: 'a@b.com' })).toBe('a@b.com')
  })

  test('ไม่มีทั้งคู่ให้ใช้ fallback', () => {
    expect(identityName({ display_name: null, email: null }, 'uuid-1')).toBe('uuid-1')
  })

  test('ไม่มีทั้งคู่และไม่ส่ง fallback ได้สตริงว่าง ไม่ใช่ undefined', () => {
    expect(identityName({})).toBe('')
  })
})

describe('identitySecondary', () => {
  // เหตุผลหลักที่ฟังก์ชันนี้มีอยู่ — display_name ปลอมได้ อีเมลปลอมไม่ได้
  test('ชื่อที่ตั้งเองต่างจากอีเมล ต้องแสดงอีเมลกำกับ', () => {
    expect(identitySecondary({ display_name: 'ตั้ม', email: 'a@b.com' })).toBe('a@b.com')
  })

  test('ผู้ใช้ตั้งชื่อตัวเองเป็นอีเมลของคนอื่น ต้องยังเห็นอีเมลจริง', () => {
    expect(identitySecondary({ display_name: 'boss@company.com', email: 'intern@company.com' }))
      .toBe('intern@company.com')
  })

  test('ค่าตั้งต้นที่ชื่อคืออีเมลอยู่แล้ว ไม่ต้องแสดงซ้ำ', () => {
    expect(identitySecondary({ display_name: 'a@b.com', email: 'a@b.com' })).toBeNull()
  })

  test('ต่างกันแค่ตัวพิมพ์และช่องว่าง ถือว่าเหมือนกัน', () => {
    expect(identitySecondary({ display_name: ' A@B.com ', email: 'a@b.com' })).toBeNull()
  })

  test('ไม่มีอีเมลก็ไม่มีอะไรให้กำกับ', () => {
    expect(identitySecondary({ display_name: 'ตั้ม', email: null })).toBeNull()
  })

  test('ไม่มีชื่อ แปลว่าอีเมลถูกใช้เป็นชื่อหลักไปแล้ว ไม่ต้องซ้ำ', () => {
    expect(identitySecondary({ display_name: null, email: 'a@b.com' })).toBeNull()
  })
})

describe('normalizeDisplayName', () => {
  test('ตัดช่องว่างหัวท้ายก่อนบันทึก', () => {
    expect(normalizeDisplayName('  ตั้ม  ')).toEqual({ ok: true, value: 'ตั้ม' })
  })

  test('ชื่อว่างล้วนบันทึกไม่ได้', () => {
    const r = normalizeDisplayName('')
    expect(r.ok).toBe(false)
  })

  test('ชื่อที่มีแต่ช่องว่างบันทึกไม่ได้ — ไม่ใช่บันทึกเป็นสตริงว่าง', () => {
    const r = normalizeDisplayName('    ')
    expect(r.ok).toBe(false)
  })

  test('ยาวพอดีขอบบนยังผ่าน', () => {
    const r = normalizeDisplayName('ก'.repeat(DISPLAY_NAME_MAX))
    expect(r.ok).toBe(true)
  })

  test('ยาวเกินขอบบนหนึ่งตัวไม่ผ่าน', () => {
    const r = normalizeDisplayName('ก'.repeat(DISPLAY_NAME_MAX + 1))
    expect(r.ok).toBe(false)
  })

  test('วัดความยาวหลังตัดช่องว่าง ไม่ใช่ก่อน', () => {
    const r = normalizeDisplayName('  ' + 'ก'.repeat(DISPLAY_NAME_MAX) + '  ')
    expect(r.ok).toBe(true)
  })

  // ตั้งใจอนุญาต — ค่าตั้งต้นของทุกคนคืออีเมลของตัวเอง ถ้าห้ามจะกดบันทึกชื่อเดิมไม่ผ่าน
  // การกันการปลอมตัวอยู่ที่ identitySecondary ที่แสดงอีเมลจริงกำกับเสมอ
  test('ชื่อที่มีรูปแบบอีเมลยังบันทึกได้', () => {
    expect(normalizeDisplayName('boss@company.com')).toEqual({
      ok: true,
      value: 'boss@company.com',
    })
  })
})
