import { countActiveFilters, describeFilters } from './describeFilters'

test('ไม่มีตัวกรองเลยได้ศูนย์และข้อความว่าง', () => {
  expect(countActiveFilters({})).toBe(0)
  expect(describeFilters({})).toBe('')
})

test('นับทุกชิปเป็นหนึ่ง ไม่ใช่นับเป็นกลุ่ม', () => {
  // ผู้ใช้สนใจว่ามีเงื่อนไขกี่ข้อกำลังตัดคนออก ไม่ใช่ว่ามันอยู่กี่กลุ่ม
  expect(countActiveFilters({ skills: ['Python', 'SQL'], fieldOrDegree: ['Master'], minYears: 3 })).toBe(4)
})

test('minYears = 0 ยังนับว่าใช้อยู่', () => {
  // 0 เป็นค่าที่ตั้งใจตั้ง ไม่ใช่ค่าว่าง เช็คด้วย != null ไม่ใช่ค่าความจริง
  expect(countActiveFilters({ minYears: 0 })).toBe(1)
  expect(describeFilters({ minYears: 0 })).toBe('ประสบการณ์ 0 ปีขึ้นไป')
})

test('รายการว่างไม่นับว่าใช้อยู่', () => {
  // FilterChips ส่ง [] กลับมาเมื่อผู้ใช้ลบชิปสุดท้ายทิ้ง
  expect(countActiveFilters({ skills: [], fieldOrDegree: [] })).toBe(0)
  expect(describeFilters({ skills: [], fieldOrDegree: [] })).toBe('')
})

test('สรุปครบทุกกลุ่มเรียงเหมือนที่แสดงในแผง', () => {
  expect(describeFilters({ skills: ['Python', 'SQL'], fieldOrDegree: ['Master'], minYears: 3 })).toBe(
    'สกิล: Python, SQL · สาขา/ปริญญา: Master · ประสบการณ์ 3 ปีขึ้นไป'
  )
})

test('มีกลุ่มเดียวก็ไม่มีตัวคั่นห้อยท้าย', () => {
  expect(describeFilters({ skills: ['Python'] })).toBe('สกิล: Python')
})
