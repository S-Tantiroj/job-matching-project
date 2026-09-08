import { getGemini } from './client'
import { withTimeout, GEMINI_TIMEOUT_MS } from './withTimeout'
import {
  validateProfileDraft,
  PARSE_ENTRY_LIMIT,
  LIMITS,
  type ProfileDraft,
} from '@/lib/self/profileDraft'
import { EDUCATION_LEVELS, INDUSTRY_GROUPS } from '@/lib/self/taxonomy'
import { MODEL_TEXT, THINKING_LOW } from './models'

// อ่าน resume/CV PDF ด้วย Gemini โดยตรง (ไม่ต้องมีไลบรารีอ่าน PDF) รองรับไฟล์ที่
// สแกนมาเป็นรูปด้วย เพราะโมเดลมองเห็นหน้ากระดาษจริง
//
// ผลที่ได้เป็นเพียง "ร่าง" ผู้ใช้ต้องตรวจและยืนยันก่อนถึงจะถูกวิเคราะห์และบันทึก
// ฟังก์ชันนี้จึงไม่แตะฐานข้อมูลเลย
// รายการค่าที่ยอมรับถูกฉีดเข้า prompt จากไฟล์เดียวกับที่ฟอร์มใช้ ถ้าเพิ่ม/ลบตัวเลือก
// ที่ taxonomy.ts prompt จะตามเองทันที ไม่ต้องไล่แก้สองที่แล้วลืมที่หนึ่ง
const EDU_VALUES = EDUCATION_LEVELS.map((c) => `"${c.value}"`).join(', ')
const IND_VALUES = INDUSTRY_GROUPS.map((c) => `"${c.value}"`).join(', ')

// export เพื่อให้ scripts/compare-gemini-models.ts วัด prompt ตัวจริง
// ถ้าคัดลอกไปไว้ในสคริปต์ ตัวเลขที่วัดได้จะไม่ใช่ของงานจริงทันทีที่แก้ prompt ที่นี่
export const PARSE_PDF_PROMPT = `Read this resume/CV PDF and return JSON only, matching this schema:
{"profile":{"full_name":"","headline":"","industry":"","location":"","summary":"","skills":[],"education":[{"institution":"","country":"","degree":"","field_of_study":"","start_year":0,"end_year":0,"gpa":""}],"experience":[{"company":"","title":"","start_date":"","end_date":"","description":""}]}}

Rules:
- The source document may be in Thai, English, or a mix. Handle any language.
- Output ALL values in ENGLISH. Translate or romanize Thai (e.g. a Thai name becomes "Somchai Jaidee", a Thai university becomes its English name).
- "industry" MUST be EXACTLY one of these values, copied verbatim: ${IND_VALUES}. Infer the closest one from their roles and employers. If none genuinely fits, omit the field — do NOT invent a new value or return a sub-industry.
- "degree" MUST be EXACTLY one of these values, copied verbatim: ${EDU_VALUES}. Map what the document says onto the closest one ("BSc"/"B.E." -> "Bachelor's Degree", "MS"/"M.Eng." -> "Master's Degree", "PhD" -> "Doctoral Degree", Thai "ปวช." -> "Vocational Certificate", "ปวส." -> "High Vocational Certificate"). Put the subject in "field_of_study", NOT in "degree". If the level is genuinely unclear, omit "degree".
- "gpa" is a STRING, copied as written. Keep the scale if stated ("3.45/4.00"). Honours wording such as "First Class Honours" is a valid value. Never convert between scales.
- Return AT MOST ${PARSE_ENTRY_LIMIT} education entries and AT MOST ${PARSE_ENTRY_LIMIT} experience entries — the MOST RECENT ones. Drop older entries.
- Dates in "experience" must be strict ISO "YYYY-MM-DD" and the DAY MUST ALWAYS BE 01 — only the month and year are used, e.g. "2020-03-01". Use null for end_date of a current role. If only a year is stated, use January ("2020-01-01").
- NEVER extract date of birth, age, religion, marital status, nationality, race, height, weight, health information, national ID number, or any photograph. Omit them entirely, including from "summary". They are not relevant to job matching.
- Omit a field or use null when the document does not state it. Never invent facts.
- Do NOT return the full text of the document. Only the structured fields above.`

// แยกการแกะคำตอบออกจากการเรียกเครือข่าย เพื่อให้ทดสอบเป็น unit ได้
export function parseProfileResponse(text: string): ProfileDraft {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  let parsed: any
  try {
    parsed = JSON.parse(start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned)
  } catch {
    throw new Error('gemini returned unparseable JSON for the PDF')
  }

  const profile = parsed?.profile
  if (!profile || typeof profile !== 'object') {
    throw new Error('gemini could not extract a profile from the PDF')
  }

  // ผ่านตัวตรวจตัวเดียวกับที่ route ใช้ ทำให้ร่างจาก AI กับร่างที่คนกรอกเอง
  // อยู่ภายใต้กติกาเดียวกัน และฟิลด์แปลกปลอม (รวมถึง raw_text) ถูกตัดทิ้งที่นี่
  const r = validateProfileDraft(coerceForReview(profile))
  if (!r.ok) throw new Error(`gemini profile failed validation at ${r.field}`)
  return r.draft
}

// ผ่อนปรนกับผลจากโมเดลก่อนส่งเข้าตัวตรวจ — **ตั้งใจให้ต่างจากด่านฝั่ง route**
//
// ด่านของ route เข้มงวดเพราะผู้ส่งคือเบราว์เซอร์ที่อาจเป็นใครก็ได้ ส่วนตรงนี้ผู้ส่งคือ
// โมเดลของเราเอง และผลจะถูกมนุษย์ตรวจต่ออีกชั้นอยู่แล้ว
//
// ถ้าไม่ผ่อนปรน วันที่ผิดรูปเพียงตัวเดียว — ซึ่งโมเดลพลาดบ่อยแม้ prompt จะสั่งไว้ —
// จะทำให้ผู้ใช้เจอ "อ่านไฟล์ไม่สำเร็จ" ทั้งที่อ่านได้ครบ นั่นคือการทิ้งงานที่สำเร็จแล้ว
// ซึ่งเป็นสิ่งเดียวกับที่ flow นี้ตั้งใจเลิกทำ ปล่อยช่องว่างให้ผู้ใช้เติมดีกว่ามาก
function coerceForReview(p: any): any {
  const cut = (v: unknown, max: number) =>
    typeof v === 'string' ? v.slice(0, max) : undefined
  const iso = (v: unknown) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
    const d = new Date(v)
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return undefined
    return v
  }
  const yr = (v: unknown) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= LIMITS.yearMin && n <= LIMITS.yearMax ? n : undefined
  }

  return {
    full_name: cut(p.full_name, LIMITS.full_name),
    headline: cut(p.headline, LIMITS.headline),
    industry: cut(p.industry, LIMITS.industry),
    location: cut(p.location, LIMITS.location),
    summary: cut(p.summary, LIMITS.summary),
    education: (Array.isArray(p.education) ? p.education : [])
      .slice(0, LIMITS.education)
      .filter((e: unknown) => e && typeof e === 'object')
      .map((e: any) => ({
        institution: cut(e.institution, LIMITS.institution),
        country: cut(e.country, LIMITS.country),
        degree: cut(e.degree, LIMITS.degree),
        field_of_study: cut(e.field_of_study, LIMITS.field_of_study),
        // gpa เป็น string เสมอ โมเดลอาจคืนเป็น number มา จึงแปลงก่อนตัด
        gpa: cut(e.gpa == null ? undefined : String(e.gpa), LIMITS.gpa),
        start_year: yr(e.start_year),
        end_year: yr(e.end_year),
      })),
    experience: (Array.isArray(p.experience) ? p.experience : [])
      .slice(0, LIMITS.experience)
      .filter((e: unknown) => e && typeof e === 'object')
      .map((e: any) => ({
        company: cut(e.company, LIMITS.company),
        title: cut(e.title, LIMITS.title),
        description: cut(e.description, LIMITS.description),
        start_date: iso(e.start_date),
        end_date: iso(e.end_date),
      })),
    skills: (Array.isArray(p.skills) ? p.skills : [])
      .slice(0, LIMITS.skills)
      .map((s: unknown) => cut(s, LIMITS.skill))
      .filter(Boolean),
  }
}

export async function parsePdfProfile(pdfBase64: string): Promise<ProfileDraft> {
  const res = await withTimeout(
    getGemini().models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            // เอกสาร Gemini แนะนำให้วาง part ของไฟล์ก่อนข้อความ prompt
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: PARSE_PDF_PROMPT },
          ],
        },
      ],
      // **ยังอยู่บน MODEL_TEXT โดยตั้งใจ ไม่ย้ายไป MODEL_FAST**
      // วัดเมื่อ 2026-09-08 กับ CV จริง: flash-lite ผ่านตัวตรวจ 3/3 และถูกกว่า
      // แต่ให้ผลไม่ซ้ำกันเลยสักครั้งใน 3 รอบ และ**ทำ education หายไปหนึ่งรายการ**
      // (4 แทนที่จะเป็น 5) ตัวตรวจดูแค่ว่ารูปทรงถูก ไม่ได้ดูว่าครบ
      // ข้อมูลที่หายตั้งแต่ต้นคือสิ่งที่คนตรวจร่างมักไม่ทันสังเกต ต่างจากค่าที่ผิด
      // ซึ่งเห็นแล้วรู้ทันที — จึงยอมจ่ายแพงกว่าเพื่อความครบ
      config: { responseMimeType: 'application/json', thinkingConfig: THINKING_LOW },
    }),
    GEMINI_TIMEOUT_MS
  )

  return parseProfileResponse(res.text ?? '')
}
