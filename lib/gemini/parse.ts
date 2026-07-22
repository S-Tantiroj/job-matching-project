import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

// Parses raw resume/profile text into a structured CandidateInput (source=upload).
export async function parseResume(text: string): Promise<CandidateInput> {
  const prompt = `Convert the following resume into JSON matching this schema:
{full_name, headline, location, summary, skills:[], education:[{institution, country, degree, field_of_study, start_year, end_year}], experience:[{company, title, start_date, end_date, description}]}
Output ALL field values in ENGLISH — if the source is in Thai, translate or romanize (e.g. names like "Somchai Jaidee"). Respond with JSON only.

${text}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
  })
  const parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return { ...parsed, source: 'upload', raw: text }
}
