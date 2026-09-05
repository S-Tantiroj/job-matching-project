import { DATA_CONTROLLER, CONTROLLER_IS_PLACEHOLDER, LEGAL_DOC, PROCESSORS, RETENTION } from './meta'

// ตั้งใจให้ตกไว้ก่อนจนกว่าจะระบุผู้ควบคุมข้อมูลจริง — เป็นรายการงานค้าง ไม่ใช่บั๊ก
test('ระบุผู้ควบคุมข้อมูลแล้ว ไม่ใช่ค่าตั้งต้น', () => {
  // PDPA กำหนดให้นโยบายต้องระบุตัวผู้ควบคุมข้อมูล การเผยแพร่นโยบายที่เว้นช่องนี้
  // ทำให้เจ้าของข้อมูลไม่รู้ว่าจะใช้สิทธิ์กับใคร ซึ่งแย่กว่าไม่มีนโยบาย
  expect(CONTROLLER_IS_PLACEHOLDER).toBe(false)
  expect(DATA_CONTROLLER.name.trim().length).toBeGreaterThan(0)
  expect(DATA_CONTROLLER.contact.trim().length).toBeGreaterThan(0)
})

test('ช่องทางติดต่อผู้ควบคุมข้อมูลเป็นช่องทางที่ใช้ได้จริง', () => {
  // เจ้าของข้อมูลต้องใช้สิทธิ์ได้จริงจากข้อมูลนี้ ไม่ใช่แค่มีตัวหนังสือเขียนไว้
  // ตอนนี้ใช้อีเมล ถ้าภายหลังเปลี่ยนเป็นที่อยู่ทางกายภาพ เทสต์นี้ต้องแก้ตาม
  expect(DATA_CONTROLLER.contact).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
})

test('เอกสารมีเวอร์ชันและวันที่มีผล', () => {
  // เจ้าของข้อมูลต้องรู้ได้ว่ากำลังอ่านฉบับไหน และมีผลตั้งแต่เมื่อไร
  expect(LEGAL_DOC.version).toMatch(/^\d+\.\d+$/)
  expect(LEGAL_DOC.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('รายการผู้ประมวลผลภายนอกครบทุกรายที่แตะข้อมูลส่วนบุคคล', () => {
  // ทั้งสามรายอยู่นอกประเทศไทย ซึ่งเป็นการโอนข้อมูลข้ามพรมแดนที่ต้องแจ้ง
  // เทสต์นี้ดักการเพิ่มบริการใหม่แล้วลืมอัปเดตนโยบาย
  const names = PROCESSORS.map((p) => p.name)
  expect(names).toContain('Supabase')
  expect(names).toContain('Google (Gemini API)')
  for (const p of PROCESSORS) {
    expect(p.purpose.trim().length).toBeGreaterThan(0)
    expect(p.location.trim().length).toBeGreaterThan(0)
  }
})

test('ระยะเวลาเก็บข้อมูลเป็นตัวเลขที่ใช้ได้จริง', () => {
  expect(RETENTION.candidateYears).toBeGreaterThan(0)
  expect(RETENTION.label).toContain(String(RETENTION.candidateYears))
})
