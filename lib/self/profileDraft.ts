import type { CandidateInput } from '@/lib/ingest/normalize'

// รูปร่างของข้อมูลที่ผู้ใช้ตรวจและยืนยันใน template ก่อนส่งไปวิเคราะห์
//
// ต่างจาก CandidateInput สองอย่าง: มี gpa ต่อรายการการศึกษา (ฝั่งผู้สมัครไม่มี)
// และไม่มี source เพราะ client ไม่ควรกำหนดที่มาของข้อมูลตัวเอง — createProfile
// เป็นคนใส่ให้
export type DraftEducation = NonNullable<CandidateInput['education']>[number] & {
  gpa?: string
}
export type ProfileDraft = Omit<CandidateInput, 'source' | 'education' | 'raw'> & {
  education?: DraftEducation[]
}

// เพดานทุกตัวนับเป็น code point (String.length) ไม่ใช่ตัวอักษรที่ตาเห็น
// ภาษาไทยใช้หลาย code point ต่อหนึ่งตัวอักษร เช่น "เกียรตินิยมอันดับหนึ่ง"
// ยาว 22 code point ทั้งที่ดูสั้น เพดานที่ตั้งจากการนับด้วยตาจะตัดค่าที่ถูกต้องทิ้ง
export const LIMITS = {
  full_name: 120,
  headline: 200,
  industry: 120,
  location: 120,
  summary: 2000,
  education: 20,
  institution: 200,
  country: 60,
  degree: 120,
  field_of_study: 120,
  gpa: 60,
  experience: 20,
  company: 200,
  title: 200,
  description: 1000,
  skills: 50,
  skill: 60,
  yearMin: 1900,
  yearMax: 2100,
} as const

// prompt ขอ 10 รายการล่าสุดเพื่อให้ฟอร์มสั้น ส่วนเพดานเซิร์ฟเวอร์ข้างบนเป็น 20
// เพราะเราบอกผู้ใช้ว่าเพิ่มเองได้ ถ้าสองค่านี้เท่ากันคำเชิญนั้นจะเป็นคำโกหก
export const PARSE_ENTRY_LIMIT = 10

export const EMPTY_DRAFT: ProfileDraft = {
  full_name: '',
  headline: '',
  industry: '',
  location: '',
  summary: '',
  education: [],
  experience: [],
  skills: [],
}

type Fail = { ok: false; field: string; message: string }
type Pass = { ok: true; draft: ProfileDraft }

const fail = (field: string, message: string): Fail => ({ ok: false, field, message })

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// คืน undefined เมื่อค่าว่าง เพื่อให้ filter(Boolean) ใน buildEmbedText ทำงานเหมือนเดิม
function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t : undefined
}

function tooLong(v: string | undefined, max: number): boolean {
  return v !== undefined && v.length > max
}

function year(v: unknown): number | undefined | null {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  if (!Number.isInteger(n)) return null
  if (n < LIMITS.yearMin || n > LIMITS.yearMax) return null
  return n
}

// วันที่ต้องตรงรูป YYYY-MM-DD และต้องเป็นวันที่ที่มีจริง
// null = ตำแหน่งปัจจุบัน ซึ่งเป็นความหมายเดียวกับที่ computeYearsExperience ใช้
function isoDate(v: unknown): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return null
  const d = new Date(v)
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null
  return v
}

export function validateProfileDraft(input: unknown): Pass | Fail {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fail('_', 'รูปแบบข้อมูลไม่ถูกต้อง')
  }
  const i = input as Record<string, unknown>

  const full_name = str(i.full_name)
  if (!full_name) return fail('full_name', 'กรุณากรอกชื่อ')
  if (tooLong(full_name, LIMITS.full_name)) return fail('full_name', 'ชื่อยาวเกินไป')

  const headline = str(i.headline)
  if (tooLong(headline, LIMITS.headline)) return fail('headline', 'ตำแหน่งย่อยาวเกินไป')
  const industry = str(i.industry)
  if (tooLong(industry, LIMITS.industry)) return fail('industry', 'อุตสาหกรรมยาวเกินไป')
  const location = str(i.location)
  if (tooLong(location, LIMITS.location)) return fail('location', 'สถานที่ยาวเกินไป')
  const summary = str(i.summary)
  if (tooLong(summary, LIMITS.summary)) return fail('summary', 'ข้อความแนะนำตัวยาวเกินไป')

  // --- การศึกษา ---
  const eduRaw = Array.isArray(i.education) ? i.education : []
  if (eduRaw.length > LIMITS.education) {
    return fail('education', `การศึกษาเกิน ${LIMITS.education} รายการ`)
  }
  const education: DraftEducation[] = []
  for (const e of eduRaw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const institution = str(r.institution)
    if (tooLong(institution, LIMITS.institution)) return fail('education.institution', 'ชื่อสถาบันยาวเกินไป')
    const country = str(r.country)
    if (tooLong(country, LIMITS.country)) return fail('education.country', 'ชื่อประเทศยาวเกินไป')
    const degree = str(r.degree)
    if (tooLong(degree, LIMITS.degree)) return fail('education.degree', 'วุฒิยาวเกินไป')
    const field_of_study = str(r.field_of_study)
    if (tooLong(field_of_study, LIMITS.field_of_study)) return fail('education.field_of_study', 'สาขายาวเกินไป')
    // gpa เป็น string เสมอ เพราะสเกลไม่เหมือนกัน — 3.45 จากระบบ 4.0,
    // 4.2 จากระบบ 5.0, "เกียรตินิยมอันดับหนึ่ง" ล้วนถูกต้อง
    const gpa = str(r.gpa)
    if (tooLong(gpa, LIMITS.gpa)) return fail('education.gpa', 'ผลการเรียนยาวเกินไป')
    const start_year = year(r.start_year)
    if (start_year === null) return fail('education.start_year', 'ปีเริ่มไม่ถูกต้อง')
    const end_year = year(r.end_year)
    if (end_year === null) return fail('education.end_year', 'ปีจบไม่ถูกต้อง')

    const item: DraftEducation = {}
    if (institution) item.institution = institution
    if (country) item.country = country
    if (degree) item.degree = degree
    if (field_of_study) item.field_of_study = field_of_study
    if (gpa) item.gpa = gpa
    if (start_year !== undefined) item.start_year = start_year
    if (end_year !== undefined) item.end_year = end_year
    if (Object.keys(item).length) education.push(item)
  }

  // --- ประสบการณ์ ---
  const expRaw = Array.isArray(i.experience) ? i.experience : []
  if (expRaw.length > LIMITS.experience) {
    return fail('experience', `ประสบการณ์เกิน ${LIMITS.experience} รายการ`)
  }
  const experience: NonNullable<ProfileDraft['experience']> = []
  for (const e of expRaw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const company = str(r.company)
    if (tooLong(company, LIMITS.company)) return fail('experience.company', 'ชื่อบริษัทยาวเกินไป')
    const title = str(r.title)
    if (tooLong(title, LIMITS.title)) return fail('experience.title', 'ชื่อตำแหน่งยาวเกินไป')
    const description = str(r.description)
    if (tooLong(description, LIMITS.description)) return fail('experience.description', 'รายละเอียดยาวเกินไป')
    const start_date = isoDate(r.start_date)
    if (start_date === null) return fail('experience.start_date', 'วันที่เริ่มต้องเป็นรูปแบบ YYYY-MM-DD')
    const end_date = isoDate(r.end_date)
    if (end_date === null) return fail('experience.end_date', 'วันที่สิ้นสุดต้องเป็นรูปแบบ YYYY-MM-DD')

    const item: NonNullable<ProfileDraft['experience']>[number] = {}
    if (company) item.company = company
    if (title) item.title = title
    if (description) item.description = description
    if (start_date) item.start_date = start_date
    if (end_date) item.end_date = end_date
    if (Object.keys(item).length) experience.push(item)
  }

  // --- สกิล ---
  const skillsRaw = Array.isArray(i.skills) ? i.skills : []
  if (skillsRaw.length > LIMITS.skills) {
    return fail('skills', `สกิลเกิน ${LIMITS.skills} รายการ`)
  }
  const skills: string[] = []
  for (const s of skillsRaw) {
    const v = str(s)
    if (!v) continue
    if (tooLong(v, LIMITS.skill)) return fail('skills', 'ชื่อสกิลยาวเกินไป')
    skills.push(v)
  }

  // ประกอบใหม่จากค่าที่ตรวจแล้วเท่านั้น — ไม่ spread ของเดิม เพื่อให้ฟิลด์ที่ไม่รู้จัก
  // (owner_id, ข้อมูลอ่อนไหว, อะไรก็ตามที่ยิงมา) หายไปโดยอัตโนมัติ ไม่ใช่ต้องไล่ลบทีละตัว
  const draft: ProfileDraft = { full_name }
  if (headline) draft.headline = headline
  if (industry) draft.industry = industry
  if (location) draft.location = location
  if (summary) draft.summary = summary
  if (education.length) draft.education = education
  if (experience.length) draft.experience = experience
  if (skills.length) draft.skills = skills

  return { ok: true, draft }
}
