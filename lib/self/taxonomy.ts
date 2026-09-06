// รายการค่าที่เลือกได้ในฟอร์มประเมินตัวเอง — ระดับการศึกษาและกลุ่มอุตสาหกรรม
//
// **`value` เป็นภาษาอังกฤษเสมอ `label` เป็นภาษาไทยสำหรับแสดงบนหน้าจอเท่านั้น**
// เพราะสิ่งที่ถูกเก็บลงฐานและป้อนเข้า `buildEmbedText` คือ `value` ซึ่งต้องอยู่
// สเปซภาษาอังกฤษเดียวกับตาราง `jobs` ถ้าเก็บภาษาไทย เวกเตอร์จะไปกองคนละมุม
// แล้วการจับคู่งานแย่ลงโดยไม่มีอาการอะไรให้สังเกต
//
// รายการอุตสาหกรรมคือ **กลุ่มบนสุดทั้ง 20 กลุ่มของ LinkedIn Industry Codes V2**
// (ตรวจกับ learn.microsoft.com/linkedin/shared/references/reference-tables/industry-codes-v2
// เมื่อ 2026-09-07) ใต้กลุ่มเหล่านี้ยังมีอีก 414 รายการย่อย แต่เราใช้แค่ระดับบนสุด
// เพราะเทียบกับ `jobs.category` ที่หยาบอยู่แล้ว และ dropdown 434 ตัวไม่มีใครเลือกไหว

export type Choice = { value: string; label: string }

// ปวช./ปวส. ใช้ชื่ออังกฤษตามที่กระทรวงศึกษาธิการใช้ ไม่ใช่คำแปลตรงตัว
export const EDUCATION_LEVELS: Choice[] = [
  { value: 'High School', label: 'มัธยมศึกษา' },
  { value: 'Vocational Certificate', label: 'ปวช. (ประกาศนียบัตรวิชาชีพ)' },
  { value: 'High Vocational Certificate', label: 'ปวส. (ประกาศนียบัตรวิชาชีพชั้นสูง)' },
  { value: "Bachelor's Degree", label: 'ปริญญาตรี' },
  { value: "Master's Degree", label: 'ปริญญาโท' },
  { value: 'Doctoral Degree', label: 'ปริญญาเอก' },
]

export const INDUSTRY_GROUPS: Choice[] = [
  { value: 'Accommodation Services', label: 'ที่พักและโรงแรม' },
  { value: 'Administrative and Support Services', label: 'ธุรการและบริการสนับสนุนธุรกิจ' },
  { value: 'Construction', label: 'ก่อสร้าง' },
  { value: 'Consumer Services', label: 'บริการผู้บริโภค' },
  { value: 'Education', label: 'การศึกษา' },
  { value: 'Entertainment Providers', label: 'บันเทิงและสันทนาการ' },
  { value: 'Farming, Ranching, Forestry', label: 'เกษตร ปศุสัตว์ และป่าไม้' },
  { value: 'Financial Services', label: 'การเงินและการธนาคาร' },
  { value: 'Government Administration', label: 'ราชการและหน่วยงานรัฐ' },
  { value: 'Holding Companies', label: 'บริษัทโฮลดิ้ง' },
  { value: 'Hospitals and Health Care', label: 'โรงพยาบาลและสาธารณสุข' },
  { value: 'Manufacturing', label: 'การผลิต' },
  { value: 'Oil, Gas, and Mining', label: 'น้ำมัน ก๊าซ และเหมืองแร่' },
  { value: 'Professional Services', label: 'บริการวิชาชีพ (ที่ปรึกษา กฎหมาย บัญชี)' },
  { value: 'Real Estate and Equipment Rental Services', label: 'อสังหาริมทรัพย์และให้เช่าอุปกรณ์' },
  { value: 'Retail', label: 'ค้าปลีก' },
  { value: 'Technology, Information and Media', label: 'เทคโนโลยี สารสนเทศ และสื่อ' },
  {
    value: 'Transportation, Logistics, Supply Chain and Storage',
    label: 'ขนส่ง โลจิสติกส์ และคลังสินค้า',
  },
  { value: 'Utilities', label: 'สาธารณูปโภค (ไฟฟ้า ประปา)' },
  { value: 'Wholesale', label: 'ค้าส่ง' },
]

// แสดงเป็น "ไทย (English)" เพราะผู้ใช้อ่านไทย แต่ค่าที่ถูกเก็บเป็นอังกฤษ
// การซ่อนค่าจริงไว้ทำให้คนที่เห็นข้อมูลในฐานทีหลังงงว่ามันมาจากตัวเลือกไหน
export const choiceLabel = (c: Choice): string => `${c.label} (${c.value})`

const values = (list: Choice[]) => new Set(list.map((c) => c.value))
const EDU = values(EDUCATION_LEVELS)
const IND = values(INDUSTRY_GROUPS)

export const isKnownEducationLevel = (v: string | undefined): boolean => !!v && EDU.has(v)
export const isKnownIndustry = (v: string | undefined): boolean => !!v && IND.has(v)

// ค่านี้เคยถูกบันทึกไว้ก่อนมีรายการตัวเลือกหรือเปล่า
//
// แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะเป็นเส้นทางที่พังแล้วเงียบที่สุด: ถ้าตอบผิด
// select จะเด้งไปค่าว่าง แล้วผู้ใช้กดบันทึกทับข้อมูลเดิมโดยไม่รู้ว่าเพิ่งลบอะไรไป
// (repo นี้ไม่มี jsdom/RTL จึงทดสอบตรรกะของคอมโพเนนต์ด้วยการแยกออกมาแบบนี้
//  เหมือน buildTimeline ใน components/Timeline.tsx)
export function isLegacyChoice(value: string | undefined, choices: Choice[]): boolean {
  if (!value) return false
  return !choices.some((c) => c.value === value)
}
