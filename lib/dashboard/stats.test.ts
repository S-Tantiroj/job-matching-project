import { sourceLabel, SOURCE_LABELS } from './stats'

test('แปลค่า enum ทั้งสี่เป็นภาษาไทย', () => {
  expect(sourceLabel('scraper')).toBe('ดึงอัตโนมัติ')
  expect(sourceLabel('csv')).toBe('นำเข้าจาก CSV')
  expect(sourceLabel('upload')).toBe('อัปโหลด Resume')
  expect(sourceLabel('synthetic')).toBe('ข้อมูลจำลอง')
})

// ถ้ายุบค่าที่ไม่รู้จักเป็น "อื่นๆ" แหล่งข้อมูลใหม่จะหายเข้ากองรวมโดยไม่มีใครสังเกต
// ซึ่งขัดกับเหตุผลที่ทำกราฟนี้ — มันมีไว้ตอบว่าข้อมูลในระบบมาจากไหนบ้าง
test('ค่าที่ยังไม่มีป้ายคืนค่าดิบ ไม่ใช่ "อื่นๆ" หรือค่าว่าง', () => {
  expect(sourceLabel('api_partner')).toBe('api_partner')
})

test('ครอบคลุมค่า enum cand_source ครบทั้งสี่ค่าที่มีอยู่จริง', () => {
  // migration 001: create type cand_source as enum ('synthetic','csv','upload','scraper')
  expect(Object.keys(SOURCE_LABELS).sort()).toEqual(['csv', 'scraper', 'synthetic', 'upload'])
})
