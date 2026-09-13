// เทมเพลต CSV สำหรับกรอกด้วยมือ — ดาวน์โหลดได้จากการ์ด X-ray บนหน้า /import
//
// **มีอยู่เพราะหน้า /import ไม่เคยบอกว่าคอลัมน์ต้องชื่ออะไร** `parseLinkedInCsv`
// รับ alias หลายชื่อต่อฟิลด์ แต่ผู้ใช้มองไม่เห็นรายชื่อนั้น คนที่หาโปรไฟล์เจอจาก
// Google แล้วอยากกรอกเองจึงติดตายตรงนี้ — เจอโปรไฟล์แล้วแต่ไม่รู้จะกรอกลงอะไร
//
// สิ่งที่ทำให้ไฟล์นี้เชื่อถือได้คือเทสต์ของมัน: เทมเพลตที่สร้างออกมาถูกป้อนเข้า
// `parseLinkedInCsv` **ตัวจริง** แล้วยืนยันว่า `classifyRow` คืนอาร์เรย์ว่าง
// เทมเพลตจึงเพี้ยนจาก parser ไม่ได้โดยไม่มีเทสต์แดง ซึ่งเป็นสิ่งที่ CLAUDE.md
// ระบุว่า `KNOWN_COLUMNS` รับประกันเองไม่ได้

/**
 * คอลัมน์ในเทมเพลต เรียงตามลำดับที่คนกรอกจริงจะไล่อ่านจากโปรไฟล์ LinkedIn
 *
 * ใช้ชื่อสกุล `linkedin*` (ของ profile scraper) เพราะเป็นชุดที่ `makeGetter`
 * ลองก่อนเสมอ — ถ้าวันหนึ่งไฟล์มีทั้งสองชุด ชุดนี้คือชุดที่ระบบเชื่อ
 *
 * **ไม่มี `refreshedAt`** โดยตั้งใจ — มันแปลว่า "phantom ดึงข้อมูลเมื่อไร"
 * ซึ่งไม่มีความหมายกับแถวที่คนพิมพ์เอง ปล่อยว่างดีกว่าให้กรอกค่าที่ตีความผิด
 */
export const TEMPLATE_COLUMNS = [
  'fullName',
  'linkedinHeadline',
  'linkedinProfileUrl',
  'location',
  'linkedinCompanyIndustry',
  'linkedinDescription',
  'linkedinJobTitle',
  'companyName',
  'linkedinJobDateRange',
  'linkedinJobDescription',
  'linkedinPreviousJobTitle',
  'previousCompanyName',
  'linkedinPreviousJobDateRange',
  'linkedinPreviousJobDescription',
  'linkedinSchoolName',
  'linkedinSchoolDegree',
  'linkedinSchoolFieldOfStudy',
  'linkedinSchoolDateRange',
  'linkedinPreviousSchoolName',
  'linkedinPreviousSchoolDegree',
  'linkedinPreviousSchoolFieldOfStudy',
  'linkedinPreviousSchoolDateRange',
  'linkedinSkillsLabel',
  'professionalEmail',
] as const

/**
 * แถวตัวอย่าง — **คนสมมติทั้งหมด**
 *
 * URL จงใจให้อ่านแล้วรู้ทันทีว่าไม่ใช่คนจริง ถ้าใส่โปรไฟล์จริงลงไฟล์ที่ commit
 * ผู้ใช้จะเปิดตามไปหาคนที่ไม่เคยยินยอมให้ใครใช้ข้อมูลเขาเป็นตัวอย่าง
 *
 * ทุกช่องมีค่า **ช่องว่างในตัวอย่างสอนให้คนคิดว่าฟิลด์นั้นไม่ต้องกรอก** แล้วแถวจริง
 * จะขาด education หรือ experience ซึ่งทำให้ตกคิวรอตรวจโดยไม่มีใครเข้าใจว่าทำไม
 *
 * รูปแบบวันที่ต้องเป็นแบบที่ `parseLinkedInDateRange` อ่านออก ("Jan 2022 - Present",
 * "2013 - 2017") อ่านไม่ออกจะได้ null เงียบๆ แล้ว `computeYearsExperience` ได้ 0
 * ซึ่งทำให้คนนั้นหลุดตัวกรองประสบการณ์ทุกครั้ง
 *
 * ทักษะคั่นด้วย `;` ไม่ใช่ `,` — parser รับทั้งคู่ แต่เซมิโคลอนทำให้คนที่เปิดไฟล์
 * ด้วย Excel ไม่เผลอทำคอลัมน์แตก
 */
const EXAMPLE_ROW: Record<(typeof TEMPLATE_COLUMNS)[number], string> = {
  fullName: 'Somchai Wattanakul',
  linkedinHeadline: 'Financial Analyst at Example Capital',
  linkedinProfileUrl: 'https://www.linkedin.com/in/example-not-a-real-person',
  location: 'Bangkok, Thailand',
  linkedinCompanyIndustry: 'Financial Services',
  linkedinDescription:
    'Financial analyst focused on equity research across Southeast Asian consumer markets.',
  linkedinJobTitle: 'Financial Analyst',
  companyName: 'Example Capital',
  linkedinJobDateRange: 'Jan 2022 - Present',
  linkedinJobDescription: 'Equity research covering the consumer and retail sectors.',
  linkedinPreviousJobTitle: 'Junior Analyst',
  previousCompanyName: 'Example Bank',
  linkedinPreviousJobDateRange: 'Jun 2019 - Dec 2021',
  linkedinPreviousJobDescription: 'Supported credit analysis for SME lending.',
  linkedinSchoolName: 'University of Melbourne',
  linkedinSchoolDegree: 'Master of Finance',
  linkedinSchoolFieldOfStudy: 'Finance',
  linkedinSchoolDateRange: '2017 - 2019',
  linkedinPreviousSchoolName: 'Chulalongkorn University',
  linkedinPreviousSchoolDegree: 'Bachelor of Economics',
  linkedinPreviousSchoolFieldOfStudy: 'Economics',
  linkedinPreviousSchoolDateRange: '2013 - 2017',
  linkedinSkillsLabel: 'Financial Modeling; Equity Research; Python',
  professionalEmail: 'somchai@example.com',
}

/**
 * หนีอักขระตาม RFC 4180 — ค่าที่มีจุลภาค อัญประกาศ หรือขึ้นบรรทัดใหม่ ต้องถูกครอบ
 *
 * ไม่หนีแล้ว "Bangkok, Thailand" จะกลายเป็นสองคอลัมน์ **แล้วคอลัมน์ที่เหลือเลื่อน
 * ไปหมดทั้งแถวโดยไม่มี error** ค่าของช่องหนึ่งไปโผล่ในอีกช่องเงียบๆ
 */
function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const toRow = (cells: readonly string[]) => cells.map(escapeCell).join(',')

/** ไฟล์ CSV: หัวตาราง + แถวตัวอย่างหนึ่งแถว */
export function buildCsvTemplate(): string {
  const header = toRow(TEMPLATE_COLUMNS)
  const example = toRow(TEMPLATE_COLUMNS.map((c) => EXAMPLE_ROW[c]))
  return `${header}\n${example}\n`
}

export const CSV_TEMPLATE_FILENAME = 'skouth-candidate-template.csv'
