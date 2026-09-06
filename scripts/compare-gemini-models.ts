import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'

// เทียบรุ่นและระดับการคิด บนงานจริงสองอย่างของระบบนี้
//
//   npx tsx scripts/compare-gemini-models.ts
//
// ทำไมต้องมี: `gemini-flash-latest` ขยับไปที่ gemini-3.8-flash ซึ่งเป็นโมเดลที่
// ออกแบบมาเพื่องานวิศวกรรมซอฟต์แวร์ยาวๆ วัดจริงแล้ว output 417 token เป็น
// thinking 373 (89%) — เราจ่ายค่าการคิดที่ทิ้งไปเปล่าๆ และรอผลนานขึ้นด้วย
//
// สองงานที่วัด ต่างกันคนละเรื่อง:
//   analyze — ผู้ใช้กดเองทีละคน ผลถูก cache ด้วย requirement_hash ช้าได้บ้าง
//             แต่ **คะแนนต้องไม่เพี้ยน** เพราะมันคือคำตอบที่ผู้ใช้เห็น
//   filters — วิ่งทุกครั้งที่ค้นหา ไม่ cache ข้ามคำค้น **ความเร็วคือ UX**
//             และถ้าพลาดก็แค่ตกกลับไปค้นแบบ semantic ล้วน ไม่พัง
// เกณฑ์ตัดสินจึงคนละแบบ อย่าเลือกรุ่นเดียวกันด้วยเหตุผลเดียวกัน
//
// ราคาต่อ 1M token (USD) ณ 2026-09-06 — ตัวเลข 3.8 เป็นราคาแนะนำตัว
// **ขึ้นเท่าตัว 1 ม.ค. 2027** ($1.50/$7.50) ส่วน flash-lite ไม่ได้ประกาศว่าจะขึ้น
const VARIANTS = [
  { id: 'gemini-3.8-flash', label: '3.8-flash (ปัจจุบัน)', in: 0.75, out: 3.75 },
  { id: 'gemini-3.8-flash', label: '3.8-flash + คิดน้อย', in: 0.75, out: 3.75, level: 'LOW' },
  { id: 'gemini-3.5-flash-lite', label: '3.5-flash-lite', in: 0.3, out: 2.5 },
  { id: 'gemini-2.5-flash-lite', label: '2.5-flash-lite', in: 0.1, out: 0.4 },
]

const profile = {
  full_name: 'Somchai Jaidee',
  headline: 'Senior Data Scientist at a retail bank',
  industry: 'Banking',
  summary:
    'Ten years building forecasting and risk models. Led a team of six. Master of Science from a US university.',
  education: [{ degree: 'MS Statistics', institution: 'University of Michigan', country: 'USA' }],
  experience: [
    { title: 'Senior Data Scientist', company: 'Bank of Ayudhya' },
    { title: 'Data Scientist', company: 'Agoda' },
  ],
}

// คัดลอกจาก lib/gemini/analyze.ts และ lib/search/extractFilters.ts
// ถ้าแก้ prompt ที่นั่น ตัวเลขที่นี่จะไม่ใช่ของงานจริงอีกต่อไป
const TASKS = [
  {
    name: 'analyze',
    json: false,
    prompt: `ประเมินผู้สมัครเทียบกับความต้องการ ตอบเป็น JSON เท่านั้น {"score":<0-100 integer>,"reasoning":"<ไทย สั้น>"}

ความต้องการ: หา Data Scientist ที่จบปริญญาโทต่างประเทศ ประสบการณ์ 5 ปีขึ้นไป

ผู้สมัคร: ${JSON.stringify(profile)}`,
  },
  {
    name: 'filters',
    json: true,
    prompt: `You extract structured search filters from a recruiter's natural-language request. Respond with JSON ONLY, no prose.

Schema:
{
  "semanticQuery": "<short English phrase describing the ROLE and core skills, for semantic search>",
  "filters": {
    "skills": ["<hard skill>", ...],
    "minYears": <integer years of experience>,
    "fieldOrDegree": ["<field of study or degree>", ...]
  }
}

Rules:
- Omit any filter key not mentioned. Omit "filters" entirely if none apply.
- Put the job title / role in semanticQuery, NOT in filters.
- Translate any Thai in the query to English for ALL output values.
- An education level counts as fieldOrDegree. Map Thai levels: ปริญญาตรี = "Bachelor", ปริญญาโท = "Master", ปริญญาเอก = "PhD". A field of study (e.g. "Computer Science") also goes in fieldOrDegree.
- Output English values.

Request: หา Data Scientist จบโทอเมริกา ประสบการณ์ 5 ปีขึ้นไป`,
  },
]

const ATTEMPTS = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const codeOf = (e: unknown) => String((e as any)?.message ?? e).match(/"code":\s*(\d+)/)?.[1] ?? '?'
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length))

async function run(ai: GoogleGenAI, v: (typeof VARIANTS)[number], task: (typeof TASKS)[number]) {
  const config: any = {}
  if (task.json) config.responseMimeType = 'application/json'
  if (v.level) config.thinkingConfig = { thinkingLevel: v.level }

  for (let i = 1; i <= ATTEMPTS; i++) {
    const started = Date.now()
    try {
      const res = await ai.models.generateContent({
        model: v.id,
        contents: task.prompt,
        config,
      })
      const u: any = res.usageMetadata ?? {}
      const input = u.promptTokenCount ?? 0
      const thoughts = u.thoughtsTokenCount ?? 0
      const output = Math.max((u.totalTokenCount ?? input) - input, 0)
      return {
        ms: Date.now() - started,
        input,
        output,
        thoughts,
        cost: (input / 1e6) * v.in + (output / 1e6) * v.out,
        text: (res.text ?? '').replace(/```json|```/g, '').trim(),
      }
    } catch (e) {
      const code = codeOf(e)
      // 404 = ไม่มีรุ่นนี้ให้คีย์นี้ใช้ ลองซ้ำไปก็ได้ผลเดิม
      if (code === '404' || i === ATTEMPTS) return { error: code }
      await sleep(4000 * i)
    }
  }
  return { error: '?' }
}

// ดึงคะแนนออกมาเทียบกัน — รุ่นที่ถูกที่สุดแต่ให้คะแนนคนละเรื่องคือของแพง
function summarize(taskName: string, text: string) {
  try {
    const o = JSON.parse(text)
    if (taskName === 'analyze') return `score ${o.score}`
    const f = o.filters ?? {}
    return `${o.semanticQuery} · yrs ${f.minYears ?? '-'} · ${(f.fieldOrDegree ?? []).join('/') || '-'}`
  } catch {
    return `แปลง JSON ไม่ได้: ${text.slice(0, 40)}`
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('ไม่พบ GEMINI_API_KEY ใน .env')
    process.exit(1)
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

  for (const task of TASKS) {
    console.log(`\n=== ${task.name} ===`)
    console.log(
      `${pad('รุ่น', 24)}${pad('เวลา', 10)}${pad('out(คิด)', 14)}${pad('1,000 ครั้ง', 13)}ผลลัพธ์`
    )
    for (const v of VARIANTS) {
      const r = await run(ai, v, task)
      if ('error' in r) {
        console.log(`${pad(v.label, 24)}ล้มเหลว ${r.error}`)
      } else {
        console.log(
          pad(v.label, 24) +
            pad(`${r.ms}ms`, 10) +
            pad(`${r.output}(${r.thoughts})`, 14) +
            pad(`$${(r.cost * 1000).toFixed(2)}`, 13) +
            summarize(task.name, r.text)
        )
      }
      await sleep(2000)
    }
  }

  console.log(
    '\nอ่านผลอย่างไร: ดูคอลัมน์ "ผลลัพธ์" ก่อนราคาเสมอ — รุ่นที่ถูกกว่าแต่ให้คะแนน\n' +
      'หรือชิปต่างจากเดิมมาก แปลว่าเปลี่ยนแล้วผู้ใช้เห็นคำตอบคนละชุด ไม่ใช่แค่ประหยัด'
  )
}

main().catch((e) => {
  console.error('ล้มเหลวแบบไม่คาดคิด:', (e as any)?.message ?? e)
  process.exit(1)
})
