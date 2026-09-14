import { IMPORT_TABS, type ImportTabKey } from './tabs'

test('every tab href lives under /import/ so the middleware matcher covers it', () => {
  // `matcher` ใน middleware.ts มี '/import/:path*' ซึ่งครอบหน้าย่อยให้อัตโนมัติ
  // แต่พิมพ์ '/imports/xray' ผิดตัวเดียว หน้านั้นจะเปิดได้โดยไม่ต้องล็อกอินแบบเงียบๆ
  const outside = IMPORT_TABS.filter((t) => !t.href.startsWith('/import/'))
  expect(outside).toEqual([])
})

test('hrefs are unique', () => {
  const hrefs = IMPORT_TABS.map((t) => t.href)
  expect(new Set(hrefs).size).toBe(hrefs.length)
})

test('keys are unique, so `current` can only highlight one tab', () => {
  const keys = IMPORT_TABS.map((t) => t.key)
  expect(new Set(keys).size).toBe(keys.length)
})

test('every tab has a label', () => {
  expect(IMPORT_TABS.filter((t) => !t.label.trim())).toEqual([])
})

// เทสต์ที่ตรึงค่าไว้ — ลูปข้างบนจับ "ชี้ไปหน้าที่ไม่มีอยู่" ไม่ได้
// (หลักการใน CLAUDE.md: ค่าคงที่ที่สะท้อนของนอกไฟล์ — ในที่นี้คือโฟลเดอร์
//  ของ route จริงใน app/(app)/import/ — ต้องมีเทสต์ที่เขียนค่านั้นตรงๆ)
test('the three routes are exactly these, so a rename cannot pass silently', () => {
  expect(IMPORT_TABS.map((t) => [t.key, t.href])).toEqual([
    ['manual', '/import/manual'],
    ['xray', '/import/xray'],
    ['auto', '/import/auto'],
  ])
})

test('ImportTabKey covers every key in the list', () => {
  // ถ้าเพิ่มแท็บใหม่แล้วลืมเติมใน type หน้าที่ส่ง current ตัวใหม่จะไม่ผ่าน tsc
  const keys: ImportTabKey[] = IMPORT_TABS.map((t) => t.key)
  expect(keys).toHaveLength(IMPORT_TABS.length)
})
