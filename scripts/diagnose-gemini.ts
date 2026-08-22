import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'

// ตัวตรวจชั่วคราว — ลบทิ้งได้หลังแก้ปัญหาเสร็จ
//
// ทดสอบสมมติฐานเดียว: 503 ที่เจอ ขึ้นกับ "ขนาดคำขอ" หรือ "ทุกอย่างพังหมด"
//
// ถ้าเล็กผ่าน กลางผ่าน ใหญ่ไม่ผ่าน  -> ถูกตัดตามน้ำหนักคำขอ (free tier capacity)
// ถ้าพังหมดทุกขนาด                  -> ฝั่ง Google มีปัญหาเป็นวงกว้าง ให้รอ
// ถ้าผ่านหมด                        -> คลี่คลายแล้ว รันงานจริงได้เลย

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `skill_${i}`).join(', ')

const CASES = [
  { label: 'เล็ก  (~20 tokens)', prompt: 'ตอบคำเดียวว่า OK' },
  {
    label: 'กลาง (~500 tokens)',
    prompt: `สรุปโปรไฟล์นี้เป็นหนึ่งประโยค: ${JSON.stringify({
      full_name: 'Somchai Jaidee',
      headline: 'Data Scientist',
      skills: filler(60),
    })}`,
  },
  {
    label: 'ใหญ่  (~3000 tokens)',
    prompt: `สรุปโปรไฟล์นี้เป็นหนึ่งประโยค: ${JSON.stringify({
      full_name: 'Somchai Jaidee',
      headline: 'Data Scientist',
      summary: filler(120),
      skills: filler(400),
      experience: Array.from({ length: 8 }, (_, i) => ({
        company: `Company ${i}`,
        title: `Title ${i}`,
        description: filler(40),
      })),
    })}`,
  },
]

async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.error('ไม่พบ GEMINI_API_KEY ใน .env')
    process.exit(1)
  }
  const ai = new GoogleGenAI({ apiKey: key })

  for (const c of CASES) {
    process.stdout.write(`${c.label} ... `)
    const started = Date.now()
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: c.prompt,
      })
      console.log(`OK (${Date.now() - started}ms) — "${(res.text ?? '').trim().slice(0, 30)}"`)
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      const code = msg.match(/"code":(\d+)/)?.[1] ?? '?'
      console.log(`FAIL ${code} (${Date.now() - started}ms)`)
    }
    // เว้นจังหวะกันชนลิมิต 5 req/นาที ของ free tier
    await new Promise((r) => setTimeout(r, 4000))
  }
}

main().catch((e) => {
  console.error('unexpected:', e?.message ?? e)
  process.exit(1)
})
