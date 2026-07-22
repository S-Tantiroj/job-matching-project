import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

// Generates synthetic Thai candidate profiles (educated abroad, working in
// Thailand) for demo/seed data. No real personal data. source = 'synthetic'.
export async function generateThaiCandidates(count: number): Promise<CandidateInput[]> {
  const prompt = `สร้างโปรไฟล์คนไทยสมมติ ${count} คน ที่จบการศึกษาจากต่างประเทศ ทำงานในไทย ให้หลากหลายสายอาชีพ ตอบเป็น JSON array เท่านั้น ตาม schema {full_name(ชื่อไทย), headline, location, summary, skills:[], education:[{institution,country(ไม่ใช่ Thailand),degree,field_of_study,start_year,end_year}], experience:[{company,title,start_date,end_date,description}]}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
  })
  const arr = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return arr.map((a: any) => ({ ...a, source: 'synthetic' as const }))
}
