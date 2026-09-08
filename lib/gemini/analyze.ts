import { getGemini } from './client'
import { withTimeout, isTransient, GEMINI_TIMEOUT_MS } from './withTimeout'
import type { CandidateInput } from '@/lib/ingest/normalize'
import { MODEL_FAST } from './models'

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
      // วัดเมื่อ 2026-09-08 ด้วยผู้สมัครสี่คนที่ต่างกันทีละมิติ (ตรงเป๊ะ / โทในไทย /
      // ประสบการณ์ไม่ถึง / ตำแหน่งใกล้เคียง) ทุกรุ่นแยกแยะได้เหมือนกันคือให้ 100
      // เฉพาะคนที่ตรงเงื่อนไข แล้วหักคะแนนสามคนที่เหลือลงมาที่ 60-75
      //
      // **แต่เลือกรุ่นนี้เพราะเร็วกว่าและถูกกว่า ไม่ใช่เพราะพิสูจน์ว่าคุณภาพเท่ากัน** —
      // คะแนนของผู้สมัครคนเดียวกันแกว่งได้ 10 แต้มจากการรันซ้ำด้วย input เดียวกัน
      // บนรุ่นเดียวกัน (3.8-flash ได้คนละชุดทั้งสามรอบ) ซึ่งเท่ากับหรือมากกว่าช่องว่าง
      // ระหว่างรุ่น จึงแยกไม่ออกว่ารุ่นไหนตัดสินดีกว่า เมื่อแยกไม่ออกก็เอาตัวที่
      // เร็วกว่า 4.6 เท่าและถูกกว่า 13 เท่า ($0.56 เทียบ $7.49 ต่อ 1,000 ครั้ง)
      // ถ้าวันไหนมีวิธีวัดที่ละเอียดกว่านี้แล้วพบว่ารุ่นใหญ่ดีกว่าจริง ให้ย้อนกลับได้
      const res = await withTimeout(
        getGemini().models.generateContent({ model: MODEL_FAST, contents: prompt }),
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
