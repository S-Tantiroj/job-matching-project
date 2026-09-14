import { readDefaultRequirement, mergeSettings } from './profileSettings'

test('reads the stored value', () => {
  expect(readDefaultRequirement({ defaultRequirement: 'Data scientist' })).toBe('Data scientist')
})

test('returns an empty string when the column is null or not an object', () => {
  // แถวใหม่มี settings = null จนกว่าจะบันทึกครั้งแรก
  expect(readDefaultRequirement(null)).toBe('')
  expect(readDefaultRequirement(undefined)).toBe('')
  expect(readDefaultRequirement('ไม่ใช่ออบเจกต์')).toBe('')
  expect(readDefaultRequirement(42)).toBe('')
})

test('returns an empty string when the key is missing or not a string', () => {
  expect(readDefaultRequirement({})).toBe('')
  expect(readDefaultRequirement({ defaultRequirement: 123 })).toBe('')
  expect(readDefaultRequirement({ other: 'x' })).toBe('')
})

// ---------------------------------------------------------------------------
// การรวมค่า — เดิมเขียนทับ jsonb ทั้งก้อน
//
// `update({ settings: { defaultRequirement } })` ลบทุกคีย์ที่ไม่ได้ระบุ
// ตอนนี้ยังไม่กระทบเพราะมีคีย์เดียว **แต่วันที่เพิ่มคีย์ที่สอง การบันทึกคีย์แรก
// จะลบคีย์ที่สองทุกครั้งโดยไม่มี error** ซึ่งเป็นบั๊กที่หาสาเหตุยากมาก
// ---------------------------------------------------------------------------

test('keeps keys the patch does not mention', () => {
  const merged = mergeSettings({ theme: 'dark', locale: 'th' }, { defaultRequirement: 'x' })
  expect(merged).toEqual({ theme: 'dark', locale: 'th', defaultRequirement: 'x' })
})

test('overwrites the key the patch does mention', () => {
  const merged = mergeSettings({ defaultRequirement: 'เก่า' }, { defaultRequirement: 'ใหม่' })
  expect(merged.defaultRequirement).toBe('ใหม่')
})

test('works when there were no settings at all', () => {
  expect(mergeSettings(null, { defaultRequirement: 'x' })).toEqual({ defaultRequirement: 'x' })
  expect(mergeSettings(undefined, { defaultRequirement: 'x' })).toEqual({ defaultRequirement: 'x' })
})

test('ignores a non-object stored value instead of throwing', () => {
  expect(mergeSettings('ขยะ', { defaultRequirement: 'x' })).toEqual({ defaultRequirement: 'x' })
})

test('does not mutate the value it was given', () => {
  // ถ้ากลายพันธุ์ค่าเดิม การเปรียบเทียบ "เปลี่ยนไหม" ที่ผู้เรียกทำจะพังเงียบๆ
  const existing = { theme: 'dark' }
  mergeSettings(existing, { defaultRequirement: 'x' })
  expect(existing).toEqual({ theme: 'dark' })
})
