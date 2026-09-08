import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'
import { MODEL_FAST } from './models'

// export เพื่อให้ scripts/compare-gemini-models.ts วัด prompt ตัวจริง
// ถ้าคัดลอกไปไว้ในสคริปต์ ตัวเลขที่วัดได้จะไม่ใช่ของงานจริงทันทีที่แก้ prompt ที่นี่
export function buildResumePrompt(text: string): string {
  return `Convert the following resume into JSON matching this schema:
{full_name, headline, location, summary, skills:[], education:[{institution, country, degree, field_of_study, start_year, end_year}], experience:[{company, title, start_date, end_date, description}]}
Output ALL field values in ENGLISH — if the source is in Thai, translate or romanize (e.g. names like "Somchai Jaidee"). Respond with JSON only.

${text}`
}

// Parses raw resume/profile text into a structured CandidateInput (source=upload).
export async function parseResume(text: string): Promise<CandidateInput> {
  const prompt = buildResumePrompt(text)

  // วัดเมื่อ 2026-09-08: flash-lite ให้ผลเหมือน 3.8-flash ทุกฟิลด์ และ**เหมือนกัน
  // ทั้ง 3 รอบ** ต่างจาก 3.8-flash ที่ผลแกว่ง ขณะที่เร็วกว่า 2.7 เท่าและถูกกว่า 4.8 เท่า
  // ($1.03 เทียบ $4.92 ต่อ 1,000 ครั้ง) การคิด 875 token ของรุ่นใหญ่ไม่ได้ช่วยอะไร
  const res = await getGemini().models.generateContent({
    model: MODEL_FAST,
    contents: prompt,
  })
  const parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return { ...parsed, source: 'upload', raw: text }
}
