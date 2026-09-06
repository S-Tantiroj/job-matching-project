import { toMonthYear, fromMonthYear, yearOptions, MONTHS_TH } from './monthYear'

test('toMonthYear อ่านเดือนและปีจากค่า ISO', () => {
  expect(toMonthYear('2025-04-01')).toEqual({ month: 4, year: 2025 })
})

test('toMonthYear ไม่เพี้ยนตามโซนเวลา', () => {
  // ถ้าใช้ new Date('2025-01-01') แล้วอ่าน getMonth() เครื่องที่ offset ติดลบ
  // จะได้เดือนธันวาคมของปี 2024 — เทสต์นี้ดักการเปลี่ยนไปใช้ Date
  expect(toMonthYear('2025-01-01')).toEqual({ month: 1, year: 2025 })
  expect(toMonthYear('2025-12-31')).toEqual({ month: 12, year: 2025 })
})

test('toMonthYear อ่านแถวเก่าที่มีวันจริงได้ ไม่ทิ้งทั้งค่า', () => {
  expect(toMonthYear('2025-04-15')).toEqual({ month: 4, year: 2025 })
})

test('toMonthYear คืน null เมื่อค่าว่างหรือผิดรูป', () => {
  for (const bad of [undefined, null, '', '2025', '04/2025', '2025-13-01']) {
    expect(toMonthYear(bad as any)).toBeNull()
  }
})

test('fromMonthYear ประกอบเป็นวันที่ 1 เสมอ', () => {
  expect(fromMonthYear(4, 2025)).toBe('2025-04-01')
  expect(fromMonthYear(12, 1999)).toBe('1999-12-01')
})

test('fromMonthYear คืน undefined เมื่อเลือกไม่ครบ ไม่เดาให้', () => {
  expect(fromMonthYear(4, undefined)).toBeUndefined()
  expect(fromMonthYear(undefined, 2025)).toBeUndefined()
  expect(fromMonthYear(undefined, undefined)).toBeUndefined()
})

test('fromMonthYear ปฏิเสธค่านอกช่วง', () => {
  expect(fromMonthYear(13, 2025)).toBeUndefined()
  expect(fromMonthYear(0, 2025)).toBeUndefined()
  expect(fromMonthYear(4, 1899)).toBeUndefined()
  expect(fromMonthYear(4, 2101)).toBeUndefined()
})

test('ค่าที่ fromMonthYear สร้าง อ่านกลับด้วย toMonthYear ได้ค่าเดิม', () => {
  for (const [m, y] of [[1, 2000], [7, 2026], [12, 1975]] as const) {
    expect(toMonthYear(fromMonthYear(m, y))).toEqual({ month: m, year: y })
  }
})

test('MONTHS_TH มีสิบสองเดือนเรียงตามลำดับ', () => {
  expect(MONTHS_TH).toHaveLength(12)
  expect(MONTHS_TH[0]).toBe('มกราคม')
  expect(MONTHS_TH[11]).toBe('ธันวาคม')
})

test('yearOptions ไล่จากปีหน้าลงไปถึง 1960', () => {
  const ys = yearOptions(2026)
  expect(ys[0]).toBe(2027)
  expect(ys[ys.length - 1]).toBe(1960)
  // เรียงจากมากไปน้อย เพราะปีล่าสุดคือค่าที่คนเลือกบ่อยที่สุด
  expect(ys[0]).toBeGreaterThan(ys[1])
})
