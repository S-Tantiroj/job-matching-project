import { toBars, MIN_VISIBLE_PCT } from './BarList'

test('ค่าสูงสุดได้เต็ม 100%', () => {
  const bars = toBars([
    { label: 'Python', value: 50 },
    { label: 'SQL', value: 25 },
  ])
  expect(bars[0].pct).toBe(100)
  expect(bars[1].pct).toBe(50)
})

test('รายการว่างคืนอาร์เรย์ว่าง ไม่ใช่พัง', () => {
  expect(toBars([])).toEqual([])
})

// max เป็น 0 ได้จริงตอนระบบยังไม่มีข้อมูล ถ้าไม่กันจะได้ NaN แล้ว width: NaN%
// ซึ่งเบราว์เซอร์เมินเงียบๆ กลายเป็นแท่งเต็มความกว้าง = ตรงข้ามกับความจริง
test('ทุกค่าเป็นศูนย์ ต้องไม่หารด้วยศูนย์', () => {
  const bars = toBars([
    { label: 'a', value: 0 },
    { label: 'b', value: 0 },
  ])
  expect(bars.every((b) => b.pct === 0)).toBe(true)
})

test('ค่าศูนย์ปนกับค่าอื่น ต้องได้ 0% ไม่ใช่ความกว้างขั้นต่ำ', () => {
  const bars = toBars([
    { label: 'a', value: 10 },
    { label: 'b', value: 0 },
  ])
  expect(bars[1].pct).toBe(0)
})

// ทักษะที่พบครั้งเดียวในฐานที่มีทักษะยอดฮิต 500 ครั้ง จะได้ 0.2% ซึ่งบางจนหายไป
// ผู้ใช้จะเห็นแถวที่มีตัวเลขแต่ไม่มีแท่ง แล้วนึกว่าหน้าจอพัง
test('ค่าน้อยมากยังต้องมีแท่งให้เห็น', () => {
  const bars = toBars([
    { label: 'ฮิต', value: 500 },
    { label: 'หายาก', value: 1 },
  ])
  expect(bars[1].pct).toBe(MIN_VISIBLE_PCT)
})

test('ค่าติดลบถูกดันขึ้นเป็นศูนย์ ไม่ยื่นออกนอกกรอบ', () => {
  const bars = toBars([
    { label: 'a', value: 10 },
    { label: 'b', value: -5 },
  ])
  expect(bars[1].value).toBe(0)
  expect(bars[1].pct).toBe(0)
})

test('มีรายการเดียวได้ 100%', () => {
  expect(toBars([{ label: 'a', value: 3 }])[0].pct).toBe(100)
})

test('ไม่แก้ไขอาร์เรย์ที่รับเข้ามา', () => {
  const input = [{ label: 'a', value: -5 }]
  toBars(input)
  expect(input[0].value).toBe(-5)
})
