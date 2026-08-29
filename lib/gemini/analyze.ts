import { getGemini } from './client'
import { withTimeout, isTransient, GEMINI_TIMEOUT_MS } from './withTimeout'
import type { CandidateInput } from '@/lib/ingest/normalize'

const ATTEMPTS = 2
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Scores how well a candidate fits a requirement (skill/role text).
// Returns an integer score 0–100 plus a short Thai reasoning.
export async function analyzeCandidate(profile: CandidateInput, requirement: string) {
  const prompt = `ประเมินผู้สมัครเทียบกับความต้องการ ตอบเป็น JSON เท่านั้น {"score":<0-100 integer>,"reasoning":"<ไทย สั้น>"}

ความต้องการ: ${requirement}

ผู้สมัคร: ${JSON.stringify(profile)}`

  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await withTimeout(
        getGemini().models.generateContent({ model: 'gemini-flash-latest', contents: prompt }),
        GEMINI_TIMEOUT_MS
      )
      const parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
      return { score: Math.round(parsed.score), reasoning: String(parsed.reasoning ?? '') }
    } catch (e) {
      lastError = e
      // ตอบผิดรูปแบบไม่ใช่ปัญหาชั่วคราว ลองใหม่ก็ได้ผลเดิม
      if (!isTransient(e) || attempt === ATTEMPTS) break
      await sleep(2000 * attempt)
    }
  }
  throw lastError
}
