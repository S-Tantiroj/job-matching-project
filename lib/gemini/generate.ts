import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

// Generates synthetic Thai candidate profiles (educated abroad, working in
// Thailand) for demo/seed data. No real personal data. source = 'synthetic'.
export async function generateThaiCandidates(count: number): Promise<CandidateInput[]> {
  const prompt = `Generate ${count} fictional profiles of Thai people who were educated abroad and now work in Thailand. Cover a diverse range of careers.
Output ALL field values in ENGLISH — romanize Thai names (e.g. "Somchai Jaidee"), and write institutions, degrees, skills, summaries, titles, and companies in English.
Respond with a JSON array only, matching this schema:
{full_name, headline, location, summary, skills:[], education:[{institution, country (NOT Thailand), degree, field_of_study, start_year, end_year}], experience:[{company, title, start_date, end_date, description}]}
Each profile MUST include 2 to 4 experience entries forming a realistic career of 3 to 12 total years. start_date and end_date MUST be strings in strict ISO format "YYYY-MM-DD" (e.g. "2019-06-01"). Use null for end_date of a current role.`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
  })
  const arr = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return arr.map((a: any) => ({ ...a, source: 'synthetic' as const }))
}
