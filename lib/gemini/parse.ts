import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

// Parses raw resume/profile text into a structured CandidateInput (source=upload).
export async function parseResume(text: string): Promise<CandidateInput> {
  const prompt = `แปลง resume ต่อไปนี้เป็น JSON ตาม schema {full_name, headline, location, summary, skills:[], education:[{institution,country,degree,field_of_study,start_year,end_year}], experience:[{company,title,start_date,end_date,description}]} ตอบ JSON เท่านั้น

${text}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
  })
  const parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return { ...parsed, source: 'upload', raw: text }
}
