import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'
import { PARSE_PDF_PROMPT, parseProfileResponse } from '@/lib/gemini/parsePdf'
import { buildResumePrompt } from '@/lib/gemini/parse'
import { buildAssessPrompt } from '@/lib/gemini/assess'
import { normalizeAssessment } from '@/lib/self/assessmentShape'
import type { ProfileDraft } from '@/lib/self/profileDraft'

// เทียบรุ่นและระดับการคิด บนงานจริงของระบบนี้
//
//   npx tsx scripts/compare-gemini-models.ts
//   COMPARE_PDF="C:\path\resume.pdf" npx tsx scripts/compare-gemini-models.ts
//
// ทำไมต้องมี: `gemini-flash-latest` ขยับไปที่ gemini-3.8-flash ซึ่งเป็นโมเดลที่
// ออกแบบมาเพื่องานวิศวกรรมซอฟต์แวร์ยาวๆ วัดจริงแล้ว output 417 token เป็น
// thinking 373 (89%) — เราจ่ายค่าการคิดที่ทิ้งไปเปล่าๆ และรอผลนานขึ้นด้วย
//
// **ทุก prompt ที่นี่ import มาจากโมดูลจริง ไม่ใช่สำเนา** — สำเนาจะ drift ทันที
// ที่มีคนแก้ prompt ฝั่งงานจริง แล้วตัวเลขที่วัดได้จะไม่ใช่ของงานจริงอีกต่อไป
//
// **อ่านคอลัมน์ "ผ่าน" ก่อนราคาเสมอ** — ผลของแต่ละรุ่นถูกส่งเข้าตัวตรวจตัวเดียวกับ
// ที่งานจริงใช้ (parseProfileResponse / normalizeAssessment) รุ่นที่ถูกกว่า 10 เท่า
// แต่ตกตัวตรวจ 1 ใน 3 ครั้งคือรุ่นที่ใช้ไม่ได้ ซึ่งมองจากจำนวน token ไม่เห็นเลย
//
// ราคาต่อ 1M token (USD) ณ 2026-09-06 — ตัวเลข 3.8 เป็นราคาแนะนำตัว
// **ขึ้นเท่าตัว 1 ม.ค. 2027** ($1.50/$7.50) ส่วน flash-lite ไม่ได้ประกาศว่าจะขึ้น
const VARIANTS = [
  { id: 'gemini-3.8-flash', label: '3.8-flash (ปัจจุบัน)', in: 0.75, out: 3.75 },
  { id: 'gemini-3.8-flash', label: '3.8-flash + คิดน้อย', in: 0.75, out: 3.75, level: 'LOW' },
  { id: 'gemini-3.5-flash-lite', label: '3.5-flash-lite', in: 0.3, out: 2.5 },
  // ตัด gemini-2.5-flash-lite ออกแล้ว — ตอบ 404 ทุกงานทุกรอบ คีย์นี้ไม่มีสิทธิ์ใช้
  // ถ้าวันไหนได้สิทธิ์แล้วอยากวัด ใส่กลับได้: { id: 'gemini-2.5-flash-lite', in: 0.1, out: 0.4 }
]

// ทำซ้ำจริง ไม่ใช่ลองใหม่ตอน error — รุ่นเบามัก "ถูกบ้างผิดบ้าง" ไม่ใช่ "ผิดตลอด"
// ถ้ารันครั้งเดียวแล้วบังเอิญได้ครั้งที่ถูก จะสรุปว่าใช้ได้ทั้งที่ใช้ไม่ได้
const REPEATS = Number(process.env.COMPARE_REPEATS ?? 3)
const RETRIES = 3

// ความต้องการเดียวกันสำหรับทุกเคสของ analyze
const REQUIREMENT = 'หา Data Scientist ที่จบปริญญาโทต่างประเทศ ประสบการณ์ 5 ปีขึ้นไป'

// **ผู้สมัครสี่คนที่ต่างกันทีละมิติเดียว** — การวัดรอบแรก (2026-09-08) ใช้คนเดียว
// ที่ตรงเงื่อนไขทุกข้อ ผลคือทุกรุ่นให้ 100 เท่ากันทุกรอบ ซึ่งบอกไม่ได้เลยว่าสองรุ่น
// ตัดสินต่างกันไหม เหมือนใช้ข้อสอบที่ทุกคนได้เต็มมาวัดว่าใครเก่งกว่ากัน
//
// สามคนหลังผิดเงื่อนไขคนละข้อพอดี ทำให้อ่านออกว่ารุ่นไหนหักคะแนนเรื่องอะไรเท่าไร
// ถ้าเปลี่ยนสองอย่างพร้อมกันจะแยกไม่ออกว่าคะแนนที่ต่างมาจากอะไร
const CANDIDATES = [
  {
    label: 'ตรงเป๊ะ',
    profile: {
      full_name: 'Somchai Jaidee',
      headline: 'Senior Data Scientist at a retail bank',
      industry: 'Banking',
      summary:
        'Ten years building forecasting and risk models. Led a team of six. Master of Science from a US university.',
      education: [
        { degree: 'MS Statistics', institution: 'University of Michigan', country: 'USA' },
      ],
      experience: [
        { title: 'Senior Data Scientist', company: 'Bank of Ayudhya' },
        { title: 'Data Scientist', company: 'Agoda' },
      ],
    },
  },
  {
    // ผิดข้อเดียว: จบโทในไทย ไม่ใช่ต่างประเทศ
    label: 'โทในไทย',
    profile: {
      full_name: 'Naruemon Thongdee',
      headline: 'Senior Data Scientist at a retail bank',
      industry: 'Banking',
      summary: 'Eight years building forecasting and risk models. Led a team of four.',
      education: [
        { degree: 'MS Statistics', institution: 'Chulalongkorn University', country: 'Thailand' },
      ],
      experience: [
        { title: 'Senior Data Scientist', company: 'Bank of Ayudhya' },
        { title: 'Data Scientist', company: 'Agoda' },
      ],
    },
  },
  {
    // ผิดข้อเดียว: ประสบการณ์ 3 ปี ไม่ถึง 5
    label: 'ประสบการณ์น้อย',
    profile: {
      full_name: 'Pattarapon Srisai',
      headline: 'Data Scientist at a retail bank',
      industry: 'Banking',
      summary: 'Three years building forecasting models. Master of Science from a US university.',
      education: [
        { degree: 'MS Statistics', institution: 'University of Michigan', country: 'USA' },
      ],
      experience: [{ title: 'Data Scientist', company: 'Bank of Ayudhya' }],
    },
  },
  {
    // ผิดข้อเดียว: ตำแหน่งใกล้เคียงแต่ไม่ตรง (Analyst ไม่ใช่ Scientist)
    label: 'ตำแหน่งเพี้ยน',
    profile: {
      full_name: 'Kanokwan Petcharat',
      headline: 'Senior Data Analyst at a retail bank',
      industry: 'Banking',
      summary:
        'Six years building dashboards and business reporting. Master of Science from a US university.',
      education: [
        { degree: 'MS Statistics', institution: 'University of Michigan', country: 'USA' },
      ],
      experience: [
        { title: 'Senior Data Analyst', company: 'Bank of Ayudhya' },
        { title: 'Data Analyst', company: 'Agoda' },
      ],
    },
  },
]

// โปรไฟล์รูปทรง ProfileDraft สำหรับ assess — ต่างจาก profile ข้างบนตรงที่มีวันที่
// ให้ computeYearsExperience ใช้ได้จริง
const draft: ProfileDraft = {
  full_name: 'Somchai Jaidee',
  headline: 'Senior Data Scientist',
  industry: 'Financial Services',
  location: 'Bangkok',
  summary: 'Ten years building forecasting and risk models. Led a team of six.',
  skills: ['Python', 'SQL', 'Machine Learning'],
  education: [
    {
      institution: 'University of Michigan',
      country: 'USA',
      degree: "Master's Degree",
      field_of_study: 'Statistics',
      start_year: 2013,
      end_year: 2015,
      gpa: '3.70/4.00',
    },
  ],
  experience: [
    {
      company: 'Bank of Ayudhya',
      title: 'Senior Data Scientist',
      start_date: '2019-06-01',
      end_date: null,
      description: 'Risk and forecasting models for retail lending.',
    },
    {
      company: 'Agoda',
      title: 'Data Scientist',
      start_date: '2015-08-01',
      end_date: '2019-05-01',
      description: 'Demand forecasting.',
    },
  ],
} as ProfileDraft

const RESUME_TEXT = `Somchai Jaidee
Senior Data Scientist, Bangkok

ประสบการณ์
Bank of Ayudhya — Senior Data Scientist (มิ.ย. 2019 - ปัจจุบัน)
  สร้างโมเดลพยากรณ์และประเมินความเสี่ยงสำหรับสินเชื่อรายย่อย ดูแลทีม 6 คน
Agoda — Data Scientist (ส.ค. 2015 - พ.ค. 2019)
  พยากรณ์อุปสงค์ที่พัก

การศึกษา
University of Michigan, USA — MS Statistics (2013-2015), GPA 3.70/4.00
จุฬาลงกรณ์มหาวิทยาลัย — วท.บ. สถิติ (2009-2013)

ทักษะ: Python, SQL, Machine Learning, Forecasting`

type Check = { ok: boolean; note: string }

// งานหนึ่งมีได้หลายเคส — analyze ใช้สี่คนเพื่อดูว่ารุ่นต่างกันตัดสินต่างกันไหม
// ส่วนงานอื่นมีเคสเดียว รายงานยังเป็นหนึ่งบรรทัดต่อรุ่นเหมือนกันหมด
type Case = { label: string; contents: any }

type Task = {
  name: string
  cases: Case[]
  json: boolean
  check: (text: string) => Check
  skip?: string
}

const one = (contents: any): Case[] => [{ label: '', contents }]

function loadPdfBase64(): string | null {
  const p = process.env.COMPARE_PDF
  if (!p) return null
  try {
    return readFileSync(p).toString('base64')
  } catch (e) {
    console.error(`อ่านไฟล์ COMPARE_PDF ไม่ได้: ${p}\n${(e as any)?.message ?? e}`)
    return null
  }
}

function buildTasks(): Task[] {
  const pdf = loadPdfBase64()

  return [
    {
      name: 'analyze (4 เคส ต่างกันทีละมิติ)',
      json: false,
      cases: CANDIDATES.map((c) => ({
        label: c.label,
        contents: `ประเมินผู้สมัครเทียบกับความต้องการ ตอบเป็น JSON เท่านั้น {"score":<0-100 integer>,"reasoning":"<ไทย สั้น>"}

ความต้องการ: ${REQUIREMENT}

ผู้สมัคร: ${JSON.stringify(c.profile)}`,
      })),
      // analyze ไม่มีตัวตรวจ schema ในงานจริง (JSON.parse ตรงๆ) เกณฑ์คือ
      // แปลงได้และ score เป็นเลข 0-100
      check: (text) => {
        try {
          const o = JSON.parse(text)
          const s = Math.round(o.score)
          const ok = Number.isFinite(s) && s >= 0 && s <= 100
          return { ok, note: ok ? String(s) : `เพี้ยน(${o.score})` }
        } catch {
          return { ok: false, note: 'JSON เสีย' }
        }
      },
    },
    {
      name: 'filters',
      json: true,
      cases: one(`You extract structured search filters from a recruiter's natural-language request. Respond with JSON ONLY, no prose.

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

Request: หา Data Scientist จบโทอเมริกา ประสบการณ์ 5 ปีขึ้นไป`),
      check: (text) => {
        try {
          const o = JSON.parse(text)
          const f = o.filters ?? {}
          const ok = typeof o.semanticQuery === 'string' && o.semanticQuery.trim().length > 0
          return {
            ok,
            note: `${o.semanticQuery} · yrs ${f.minYears ?? '-'} · ${(f.fieldOrDegree ?? []).join('/') || '-'}`,
          }
        } catch {
          return { ok: false, note: `แปลง JSON ไม่ได้: ${text.slice(0, 30)}` }
        }
      },
    },
    {
      name: 'parsePdf',
      json: true,
      skip: pdf
        ? undefined
        : 'ข้าม — ตั้ง COMPARE_PDF ให้ชี้ไฟล์ resume PDF ก่อน (อย่า commit ไฟล์นั้นเข้า repo)',
      cases: one(
        pdf
          ? [
              {
                role: 'user',
                parts: [
                  { inlineData: { mimeType: 'application/pdf', data: pdf } },
                  { text: PARSE_PDF_PROMPT },
                ],
              },
            ]
          : ''
      ),
      // ตัวตรวจตัวจริง — โยน error เมื่อ industry/degree ไม่ตรงรายการ วันที่ไม่ลงท้าย 01
      // หรือรายการเกินเพดาน ซึ่งเป็นความผิดที่มองจากจำนวน token ไม่เห็น
      check: (text) => {
        try {
          const d = parseProfileResponse(text)
          return {
            ok: true,
            note: `${d.full_name} · edu ${d.education?.length ?? 0} · exp ${d.experience?.length ?? 0} · ${d.industry ?? '-'}`,
          }
        } catch (e) {
          return { ok: false, note: `ตกตัวตรวจ: ${(e as any)?.message ?? e}` }
        }
      },
    },
    {
      name: 'parseResume (ข้อความ)',
      json: false,
      cases: one(buildResumePrompt(RESUME_TEXT)),
      // งานจริงใน lib/gemini/parse.ts ทำ JSON.parse ตรงๆ ไม่มีตัวตรวจ schema เลย
      // เกณฑ์ที่นี่จึงเป็นขั้นต่ำสุดที่ทำให้ /api/ingest ไม่ระเบิด
      check: (text) => {
        try {
          const o = JSON.parse(text.replace(/```json|```/g, '').trim())
          const ok = typeof o.full_name === 'string' && o.full_name.trim().length > 0
          return {
            ok,
            note: ok
              ? `${o.full_name} · edu ${o.education?.length ?? 0} · exp ${o.experience?.length ?? 0}`
              : 'ไม่มี full_name',
          }
        } catch {
          return { ok: false, note: `แปลง JSON ไม่ได้: ${text.slice(0, 30)}` }
        }
      },
    },
    {
      name: 'assess',
      json: true,
      cases: one(buildAssessPrompt(draft, 10)),
      check: (text) => {
        try {
          const cleaned = text.replace(/```json|```/g, '').trim()
          const s = cleaned.indexOf('{')
          const e = cleaned.lastIndexOf('}')
          const parsed = JSON.parse(s >= 0 && e > s ? cleaned.slice(s, e + 1) : cleaned)
          const a = normalizeAssessment(parsed)
          if (!a) return { ok: false, note: 'normalizeAssessment คืน null' }
          const ok = a.strengths.length > 0 && a.summary.length > 0
          return {
            ok,
            note: `จุดแข็ง ${a.strengths.length} · จุดอ่อน ${a.weaknesses.length} · พัฒนา ${a.development.length}`,
          }
        } catch {
          return { ok: false, note: `แปลง JSON ไม่ได้: ${text.slice(0, 30)}` }
        }
      },
    },
  ]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const codeOf = (e: unknown) => String((e as any)?.message ?? e).match(/"code":\s*(\d+)/)?.[1] ?? '?'
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length))
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

type Once =
  | { error: string }
  | { ms: number; input: number; output: number; thoughts: number; cost: number; text: string }

async function once(
  ai: GoogleGenAI,
  v: (typeof VARIANTS)[number],
  task: Task,
  contents: any
): Promise<Once> {
  const config: any = {}
  if (task.json) config.responseMimeType = 'application/json'
  if (v.level) config.thinkingConfig = { thinkingLevel: v.level }

  for (let i = 1; i <= RETRIES; i++) {
    const started = Date.now()
    try {
      const res = await ai.models.generateContent({
        model: v.id,
        contents,
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
      // 404 = ไม่มีรุ่นนี้ให้คีย์นี้ใช้ / รุ่นนี้ไม่รับ input แบบนี้ ลองซ้ำไปก็ได้ผลเดิม
      if (code === '404' || i === RETRIES) return { error: code }
      await sleep(4000 * i)
    }
  }
  return { error: '?' }
}

// หนึ่งรอบ = ยิงครบทุกเคสของงานนั้น เวลา/ราคาที่รายงานจึงเป็นของ "หนึ่งรอบเต็ม"
// ส่วน note ของรอบนั้นคือผลของทุกเคสต่อกัน — เอามาเทียบข้ามรอบเพื่อดูความคงเส้นคงวา
async function measure(ai: GoogleGenAI, v: (typeof VARIANTS)[number], task: Task) {
  const ms: number[] = []
  const outs: number[] = []
  const thoughts: number[] = []
  const costs: number[] = []
  const notes: string[] = []
  let passed = 0
  let checks = 0
  let failedCall = ''

  for (let i = 0; i < REPEATS && !failedCall; i++) {
    let roundMs = 0
    let roundOut = 0
    let roundThoughts = 0
    let roundCost = 0
    const parts: string[] = []

    for (const cs of task.cases) {
      const r = await once(ai, v, task, cs.contents)
      if ('error' in r) {
        failedCall = r.error
        break
      }
      roundMs += r.ms
      roundOut += r.output
      roundThoughts += r.thoughts
      roundCost += r.cost
      const c = task.check(r.text)
      checks++
      if (c.ok) passed++
      parts.push(cs.label ? `${cs.label} ${c.note}` : c.note)
      await sleep(2000)
    }
    if (failedCall) break

    ms.push(roundMs)
    outs.push(roundOut)
    thoughts.push(roundThoughts)
    costs.push(roundCost)
    notes.push(parts.join(' · '))
  }

  return { failedCall, ms, outs, thoughts, costs, notes, passed, checks }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('ไม่พบ GEMINI_API_KEY ใน .env')
    process.exit(1)
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const tasks = buildTasks()

  console.log(`ทำซ้ำรุ่นละ ${REPEATS} ครั้ง (ปรับด้วย COMPARE_REPEATS)`)

  for (const task of tasks) {
    console.log(`\n=== ${task.name} ===`)
    if (task.skip) {
      console.log(task.skip)
      continue
    }
    console.log(
      `${pad('รุ่น', 24)}${pad('เวลากลาง', 11)}${pad('out(คิด)', 13)}${pad('1,000 ครั้ง', 13)}${pad('ผ่าน', 7)}ผลลัพธ์`
    )
    for (const v of VARIANTS) {
      const m = await measure(ai, v, task)
      if (m.failedCall) {
        console.log(`${pad(v.label, 24)}เรียกไม่สำเร็จ ${m.failedCall}`)
        continue
      }
      const uniq = new Set(m.notes).size
      const warn = uniq > 1 ? `⚠ ผลต่างกัน ${uniq} แบบ · ` : ''
      console.log(
        pad(v.label, 24) +
          pad(`${median(m.ms)}ms`, 11) +
          pad(`${median(m.outs)}(${median(m.thoughts)})`, 13) +
          pad(`$${(median(m.costs) * 1000).toFixed(2)}`, 13) +
          pad(`${m.passed}/${m.checks}`, 7) +
          warn +
          m.notes[0]
      )
    }
  }

  console.log(
    '\nอ่านผลอย่างไร:\n' +
      '1. ดูคอลัมน์ "ผ่าน" ก่อน — ไม่ครบทุกครั้งแปลว่ารุ่นนั้นใช้ไม่ได้ ไม่ต้องดูราคาต่อ\n' +
      '2. ⚠ ผลต่างกัน แปลว่ารันซ้ำแล้วได้คนละคำตอบ ผู้ใช้สองคนที่ทำเหมือนกันจะเห็นไม่เหมือนกัน\n' +
      '3. ค่อยดูเวลาและราคา — และจำไว้ว่าราคา 3.8-flash ขึ้นเท่าตัว 1 ม.ค. 2027\n' +
      '4. เกณฑ์ต่างกันตามงาน: filters วิ่งทุกครั้งที่ค้นหา ความเร็วคือ UX พลาดแล้วตกกลับไป\n' +
      '   ค้นแบบ semantic ล้วน ไม่พัง · parsePdf/assess ผู้ใช้เห็นผลตรงๆ ความถูกต้องมาก่อน'
  )
}

main().catch((e) => {
  console.error('ล้มเหลวแบบไม่คาดคิด:', (e as any)?.message ?? e)
  process.exit(1)
})
