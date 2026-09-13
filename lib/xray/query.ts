// ตัวสร้างคำค้น X-ray สำหรับ Google — ใช้ที่การ์ดบนหน้า /import
//
// **ไฟล์นี้ไม่ยิงเครือข่าย** มันผลิตสตริงกับลิงก์ คนกดเปิดเอง อ่านเอง แล้วกรอกลง CSV
// การดึงผลลัพธ์อัตโนมัติทำไม่ได้ ไม่ใช่เพราะเราไม่อยากทำ แต่เพราะประตูปิดทั้งสองบาน:
// Google Custom Search JSON API ปิดรับลูกค้าใหม่และเลิกให้บริการ 1 ม.ค. 2027
// ส่วน Bing Search API ถูกถอดถาวรไปแล้วเมื่อ 11 ส.ค. 2025
// เหลือแต่ SERP scraper เจ้าที่สามซึ่งขัดข้อกำหนดของ Google เอง
// (ดูบันทึกการประเมินใน docs/thesis/ — สรุปเมื่อ 2026-09-13)
//
// และต่อให้ดึงได้ ผลลัพธ์ก็ให้ได้แค่ URL + ชื่อ + headline ซึ่งขาด experience กับ
// education — สองในสี่ฟิลด์ที่ classifyRow ต้องการ ทุกแถวจะตกคิวรอตรวจ 100%
// วิธีนี้จึงเป็น "เครื่องมือค้นหา" ไม่ใช่ "ท่อข้อมูล" โดยตั้งใจ

export type XrayScope = 'th' | 'global'

/**
 * ขอบเขตโดเมน
 *
 * ค่าตั้งต้นเป็น `th` เพราะเมื่อ 28 มี.ค. 2026 โดเมน `www.linkedin.com` หลุดจาก
 * ดัชนีของ Google ทั้งก้อนในชั่วข้ามคืน **แต่ซับโดเมนรายประเทศ (th. uk. in.)
 * ไม่โดนด้วย** — และกลุ่มเป้าหมายของระบบนี้อยู่ในไทยอยู่แล้ว
 *
 * `global` ใช้ `site:linkedin.com/in` ซึ่ง Google นับรวมซับโดเมนทั้งหมด
 * (ครอบ th. ด้วย) ไว้สำหรับคนไทยที่ทำงานอยู่ต่างประเทศ
 */
export const XRAY_SITE: Record<XrayScope, string> = {
  th: 'site:th.linkedin.com/in',
  global: 'site:linkedin.com/in',
}

export type XrayInput = {
  jobTitle?: string
  /** กลุ่ม OR — จบจากที่ไหนก็ได้ในรายการนี้ */
  institutions?: string[]
  /** กลุ่ม AND — ต้องมีครบทุกตัว */
  skills?: string[]
  location?: string
  scope?: XrayScope
}

/**
 * ตัดอัญประกาศออกจากค่าที่ผู้ใช้กรอก แล้วตัดช่องว่างหัวท้าย
 *
 * ตัดทั้งอัญประกาศตรงและโค้ง เพราะคนคัดลอกจาก LinkedIn, Word หรือ Google Docs
 * มักติดมาด้วย ปล่อยไว้จะได้ `""Data Scientist""` ที่ Google อ่านเพี้ยน
 *
 * **ไม่ตัดวงเล็บ** — ค่าอย่าง "Google (Thailand)" ถูกครอบด้วยอัญประกาศอยู่แล้ว
 * วงเล็บข้างในจึงเป็นตัวอักษรธรรมดา ไม่ไปปนกับการจัดกลุ่ม OR
 *
 * **ไม่ตัดเครื่องหมายวรรคตอนเดี่ยว** — "King's College London" ต้องอยู่ครบ
 * อะพอสทรอฟีข้างในอัญประกาศคู่ไม่ทำให้วลีขาด มีแต่อัญประกาศคู่เท่านั้นที่ขาด
 */
const clean = (v: string | null | undefined): string =>
  typeof v === 'string' ? v.replace(/["“”]/g, '').trim() : ''

const phrase = (v: string) => `"${v}"`

const cleanAll = (values: string[] | undefined): string[] =>
  (values ?? []).map(clean).filter(Boolean)

/**
 * กลุ่ม OR — ตรงไหนก็ได้ในรายการนี้
 *
 * ศูนย์ค่า -> คืนว่าง (ต้องหายไปทั้งกลุ่ม ไม่ใช่เหลือ `()` ค้าง)
 * หนึ่งค่า -> ไม่ต้องมีวงเล็บ วงเล็บครอบค่าเดียวเป็นเสียงรบกวน
 * สองค่าขึ้นไป -> ต้องมีวงเล็บ ไม่งั้น OR จะไปผูกกับเงื่อนไขข้างเคียงผิดตัว
 */
function orGroup(values: string[] | undefined): string {
  const items = cleanAll(values)
  if (items.length === 0) return ''
  if (items.length === 1) return phrase(items[0])
  return `(${items.map(phrase).join(' OR ')})`
}

/**
 * ประกอบคำค้น X-ray — คืนสตริงว่างเมื่อไม่มีเงื่อนไขสักข้อ
 *
 * **การคืนว่างสำคัญกว่าที่ดู** ถ้าคืน `site:th.linkedin.com/in` เปล่าๆ Google จะ
 * ตอบด้วยโปรไฟล์เป็นล้านรายการ ซึ่ง**ดูเหมือนคำค้นทำงานสำเร็จ** ผู้ใช้ไม่มีทางรู้ว่า
 * ตัวเองลืมกรอกเงื่อนไข — ความผิดพลาดชนิดเดียวกับ `width: NaN%` ที่กลายเป็นแท่งเต็ม
 * และ "ไม่พบผลลัพธ์" ที่ขึ้นตอนระบบค้นหาพัง คือคำตอบผิดที่หน้าตาน่าเชื่อถือ
 */
export function buildXrayQuery(input: XrayInput): string {
  const parts: string[] = []

  const title = clean(input.jobTitle)
  if (title) parts.push(phrase(title))

  const institutions = orGroup(input.institutions)
  if (institutions) parts.push(institutions)

  parts.push(...cleanAll(input.skills).map(phrase))

  const location = clean(input.location)
  if (location) parts.push(phrase(location))

  if (parts.length === 0) return ''

  return [XRAY_SITE[input.scope ?? 'th'], ...parts].join(' ')
}

/**
 * ลิงก์เปิดคำค้นใน Google — คืนว่างเมื่อคำค้นว่าง
 *
 * `encodeURIComponent` ทั้งก้อน ไม่ใช่แค่ช่องว่าง เพราะ `+` ใน "C++" จะถูก Google
 * อ่านเป็นช่องว่างถ้าไม่ encode แล้วคำค้นจะกลายเป็น "C" เงียบๆ
 */
export function xraySearchUrl(query: string): string {
  const q = query.trim()
  if (!q) return ''
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}
