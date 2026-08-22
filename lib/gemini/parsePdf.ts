import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

export type ParsedPdf = { profile: CandidateInput; raw_text: string }

// อ่าน resume PDF ด้วย Gemini โดยตรง (ไม่ต้องมีไลบรารีอ่าน PDF) รองรับไฟล์ที่สแกน
// มาเป็นรูปด้วย เพราะโมเดลมองเห็นหน้ากระดาษจริง
//
// ไฟล์ต้นทางเป็นภาษาอะไรก็ได้ แต่ค่าในโปรไฟล์ต้องออกมาเป็นภาษาอังกฤษ เพราะ embedding
// ต้องอยู่สเปซเดียวกับตาราง jobs ที่เก็บเป็นอังกฤษ ส่วน raw_text เก็บตามต้นฉบับ
export async function parsePdfProfile(pdfBase64: string): Promise<ParsedPdf> {
  const prompt = `Read this resume PDF and return JSON only, matching this schema:
{"profile":{"full_name":"","headline":"","location":"","summary":"","skills":[],"education":[{"institution":"","country":"","degree":"","field_of_study":"","start_year":0,"end_year":0}],"experience":[{"company":"","title":"","start_date":"","end_date":"","description":""}]},"raw_text":""}

Rules:
- The source document may be in Thai, English, or a mix. Handle any language.
- Output ALL values inside "profile" in ENGLISH. Translate or romanize Thai (e.g. a Thai name becomes "Somchai Jaidee", a Thai university becomes its English name).
- "raw_text" must be the text of the document AS IT APPEARS, in its original language. Do NOT translate raw_text.
- Dates in "experience" must be strict ISO "YYYY-MM-DD". Use null for end_date of a current role.
- Omit a field or use null when the resume does not state it. Never invent facts.`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: [
      {
        role: 'user',
        parts: [
          // เอกสาร Gemini แนะนำให้วาง part ของไฟล์ก่อนข้อความ prompt
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: { responseMimeType: 'application/json' },
  })

  const text = (res.text ?? '').replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let parsed: any
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text)
  } catch {
    throw new Error('gemini returned unparseable JSON for the PDF')
  }

  const profile = parsed?.profile
  if (!profile || typeof profile !== 'object' || !String(profile.full_name ?? '').trim()) {
    throw new Error('gemini could not extract a profile from the PDF')
  }

  return {
    profile: { ...profile, source: 'upload' } as CandidateInput,
    raw_text: String(parsed.raw_text ?? ''),
  }
}
