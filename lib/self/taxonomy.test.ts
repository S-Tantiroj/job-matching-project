import {
  EDUCATION_LEVELS,
  INDUSTRY_GROUPS,
  choiceLabel,
  isKnownEducationLevel,
  isKnownIndustry,
  isLegacyChoice,
} from './taxonomy'
import { LIMITS } from './profileDraft'

test('อุตสาหกรรมมีครบ 20 กลุ่มบนสุดของ LinkedIn V2', () => {
  // ถ้ามีคนเผลอเพิ่มรายการย่อยเข้ามา จำนวนจะไม่ใช่ 20 อีกต่อไป
  expect(INDUSTRY_GROUPS).toHaveLength(20)
})

test('ระดับการศึกษามีครบหกระดับตามที่ระบบไทยใช้', () => {
  expect(EDUCATION_LEVELS).toHaveLength(6)
  const labels = EDUCATION_LEVELS.map((c) => c.label).join(' ')
  for (const t of ['มัธยม', 'ปวช.', 'ปวส.', 'ปริญญาตรี', 'ปริญญาโท', 'ปริญญาเอก']) {
    expect(labels).toContain(t)
  }
})

test('ทุกตัวเลือกมี value อังกฤษและ label ไทย', () => {
  // value เข้า embedding ซึ่งอยู่สเปซอังกฤษร่วมกับตาราง jobs — ถ้าหลุดเป็นไทย
  // เวกเตอร์จะไปกองคนละมุมแล้วจับคู่งานแย่ลงเงียบๆ
  const thai = /[฀-๿]/
  for (const c of [...EDUCATION_LEVELS, ...INDUSTRY_GROUPS]) {
    expect(thai.test(c.value)).toBe(false)
    expect(thai.test(c.label)).toBe(true)
  }
})

test('ไม่มี value ซ้ำในแต่ละรายการ', () => {
  for (const list of [EDUCATION_LEVELS, INDUSTRY_GROUPS]) {
    const vals = list.map((c) => c.value)
    expect(new Set(vals).size).toBe(vals.length)
  }
})

test('ทุก value สั้นพอที่ตัวตรวจฝั่งเซิร์ฟเวอร์จะรับได้', () => {
  // ชื่อกลุ่มยาวที่สุดคือ "Transportation, Logistics, Supply Chain and Storage"
  // ถ้าใครลดเพดาน LIMITS ลงต่ำกว่านี้ ตัวเลือกที่ให้เลือกจะถูกปฏิเสธเอง
  for (const c of EDUCATION_LEVELS) expect(c.value.length).toBeLessThanOrEqual(LIMITS.degree)
  for (const c of INDUSTRY_GROUPS) expect(c.value.length).toBeLessThanOrEqual(LIMITS.industry)
})

test('choiceLabel แสดงทั้งไทยและอังกฤษ', () => {
  expect(choiceLabel({ value: 'Retail', label: 'ค้าปลีก' })).toBe('ค้าปลีก (Retail)')
})

test('ตัวเช็คค่ารู้จักเฉพาะค่าในรายการ', () => {
  expect(isKnownEducationLevel("Master's Degree")).toBe(true)
  expect(isKnownEducationLevel('MS')).toBe(false)
  expect(isKnownEducationLevel(undefined)).toBe(false)
  expect(isKnownIndustry('Retail')).toBe(true)
  expect(isKnownIndustry('Banking')).toBe(false)
})

test('isLegacyChoice รู้จักค่าเดิมที่ไม่อยู่ในรายการ', () => {
  // "MS" คือค่าที่โปรไฟล์เก่าเก็บไว้ก่อนมี dropdown — ต้องถือว่าเป็นค่าเดิม
  // เพื่อให้ฟอร์มแสดงมันไว้ ไม่ใช่เด้งเป็นว่างแล้วผู้ใช้บันทึกทับโดยไม่รู้ตัว
  expect(isLegacyChoice('MS', EDUCATION_LEVELS)).toBe(true)
  expect(isLegacyChoice("Master's Degree", EDUCATION_LEVELS)).toBe(false)
  expect(isLegacyChoice('Banking', INDUSTRY_GROUPS)).toBe(true)
  expect(isLegacyChoice('Retail', INDUSTRY_GROUPS)).toBe(false)
})

test('isLegacyChoice ถือว่าค่าว่างไม่ใช่ค่าเดิม', () => {
  // ไม่งั้นฟอร์มจะขึ้น option "ค่าเดิม: " ที่ว่างเปล่าให้คนที่ยังไม่ได้กรอกอะไรเลย
  expect(isLegacyChoice(undefined, EDUCATION_LEVELS)).toBe(false)
  expect(isLegacyChoice('', EDUCATION_LEVELS)).toBe(false)
})
