import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'

// Scores how well a candidate fits a requirement (skill/role text).
// Returns an integer score 0–100 plus a short Thai reasoning.
export async function analyzeCandidate(profile: CandidateInput, requirement: string) {
  const prompt = `ประเมินผู้สมัครเทียบกับความต้องการ ตอบเป็น JSON เท่านั้น {"score":<0-100 integer>,"reasoning":"<ไทย สั้น>"}

ความต้องการ: ${requirement}

ผู้สมัคร: ${JSON.stringify(profile)}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
  })
  const parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  return { score: Math.round(parsed.score), reasoning: String(parsed.reasoning ?? '') }
}
