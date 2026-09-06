import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'

// วัดว่าคีย์ปัจจุบันอยู่ tier ไหนและคิดเงินเท่าไร — รันก่อนและหลังเปิด billing
//
//   npx tsx scripts/check-gemini-tier.ts
//
// สามอย่างที่สคริปต์นี้ตอบ ซึ่งหน้าเว็บของ Google ไม่ได้บอกตรงๆ:
//
// 1. `gemini-flash-latest` ชี้ไปรุ่นไหน ณ ตอนนี้ — **ต้องอ่านจาก `modelVersion`
//    ในคำตอบ ไม่ใช่จาก `models.get`** ซึ่งกับ alias จะคืนแค่ชื่อ alias ตัวเอง
//    ("Gemini Flash Latest") ไม่บอกรุ่นจริงที่อยู่ข้างหลัง
// 2. thinking token ที่ถูกคิดเป็น output — ไม่ปรากฏในข้อความที่เราได้กลับมา
//    แต่คิดเงินเต็มราคา output
// 3. เวลาตอบจริงของคำขอขนาดเท่างานจริง ใช้ตั้ง GEMINI_TIMEOUT_MS ให้พอดี
//
// **503 ไม่ใช่ความล้มเหลวของสคริปต์ แต่คือคำตอบ** — free tier ถูกตัดตามความจุ
// สคริปต์จึงลองซ้ำแล้วรายงานว่าลองกี่ครั้ง แทนที่จะตายทิ้งไป จำนวนครั้งที่ต้องลอง
// ก่อนสำเร็จคือตัวเลขที่เอาไปเทียบหลังเปิด billing ได้ตรงที่สุด

// ราคาต่อ 1M token (USD) ณ 2026-09-06 — ตรวจซ้ำที่หน้า pricing ก่อนใช้อ้างอิง
// ตัวเลข flash เป็นราคาแนะนำตัวถึง 31 ธ.ค. 2026 แล้วขึ้นเท่าตัววันที่ 1 ม.ค. 2027
const PRICE = { flashInput: 0.75, flashOutput: 3.75, embedInput: 0.15 }

const ATTEMPTS = 4

const sample = {
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

const prompt = `ประเมินผู้สมัครเทียบกับความต้องการ ตอบเป็น JSON เท่านั้น {"score":<0-100 integer>,"reasoning":"<ไทย สั้น>"}

ความต้องการ: หา Data Scientist ที่จบปริญญาโทต่างประเทศ ประสบการณ์ 5 ปีขึ้นไป

ผู้สมัคร: ${JSON.stringify(sample)}`

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 2)}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const codeOf = (e: unknown) => String((e as any)?.message ?? e).match(/"code":\s*(\d+)/)?.[1] ?? '?'
const transient = (e: unknown) => ['503', '429'].includes(codeOf(e))

// ต้องประกาศชนิดคืนค่าเป็น discriminated union ให้ชัด ไม่งั้น TS อนุมานเป็น union
// ที่ `'value' in r` แคบชนิดไม่ได้ แล้ว tsc จะฟ้อง "possibly undefined" ทั้งที่โค้ดถูก
type Attempt<T> =
  | { ok: true; value: T; ms: number; attempts: number }
  | { ok: false; error: unknown; code: string; attempts: number }

// ลองซ้ำแบบถอยห่างขึ้นเรื่อยๆ คืนจำนวนครั้งที่ใช้ไปด้วย เพราะนั่นคือตัววัด
async function retry<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  for (let i = 1; i <= ATTEMPTS; i++) {
    const started = Date.now()
    try {
      const value = await fn()
      return { ok: true, value, ms: Date.now() - started, attempts: i }
    } catch (e) {
      const code = codeOf(e)
      console.log(`  ครั้งที่ ${i}/${ATTEMPTS} — ล้มเหลว ${code} (${Date.now() - started} ms)`)
      if (!transient(e) || i === ATTEMPTS) return { ok: false, error: e, code, attempts: i }
      await sleep(5000 * i)
    }
  }
  return { ok: false, error: new Error('unreachable'), code: '?', attempts: ATTEMPTS }
}

async function main() {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.error('ไม่พบ GEMINI_API_KEY ใน .env')
    process.exit(1)
  }
  const ai = new GoogleGenAI({ apiKey: key })
  let capacityHit = false

  // --- generateContent: รุ่นจริง + token + เวลา ---
  console.log('generateContent ขนาดเท่า analyzeCandidate จริง')
  const gen = await retry(() =>
    ai.models.generateContent({ model: 'gemini-flash-latest', contents: prompt })
  )

  if (gen.ok) {
    const res = gen.value
    const u: any = res.usageMetadata ?? {}
    const input = u.promptTokenCount ?? 0
    const thoughts = u.thoughtsTokenCount ?? 0
    // candidatesTokenCount บางรุ่นรวม thinking บางรุ่นไม่รวม จึงคิดจาก total
    // ซึ่งเป็นตัวเดียวที่ Google ใช้ออกบิลแน่นอน
    const output = Math.max((u.totalTokenCount ?? input + thoughts) - input, 0)
    const perCall = (input / 1e6) * PRICE.flashInput + (output / 1e6) * PRICE.flashOutput

    console.log(`  สำเร็จในครั้งที่ ${gen.attempts} (${gen.ms} ms)`)
    console.log(`  รุ่นจริง       : ${res.modelVersion ?? 'ไม่ระบุ'}`)
    console.log(`  input tokens  : ${input}`)
    console.log(`  output tokens : ${output}${thoughts ? ` (เป็น thinking ${thoughts})` : ''}`)
    console.log(`  ราคา/ครั้ง     : ${usd(perCall)}  →  1,000 ครั้ง = ${usd(perCall * 1000)}`)
    if (thoughts && thoughts > output - thoughts) {
      console.log('  ⚠ thinking token มากกว่าคำตอบจริง — จ่ายค่าการคิดที่งานนี้ไม่ได้ใช้')
    }
  } else {
    capacityHit = transient(gen.error)
    console.log(`  ล้มเหลวครบ ${gen.attempts} ครั้ง (${gen.code})`)
  }

  // --- embedContent: คนละรุ่น คนละความจุ จึงต้องวัดแยก ---
  // ตัวนี้สำคัญกว่าสำหรับงานประจำ เพราะ sync ทุกคืนเรียกมันคนละครั้งต่อผู้สมัคร
  console.log('\nembedContent (รุ่นที่ sync ทุกคืนใช้)')
  const text = JSON.stringify(sample)
  const emb = await retry(() =>
    ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' },
    })
  )

  if (emb.ok) {
    const dims = emb.value.embeddings?.[0]?.values?.length ?? 0
    // embedContent ไม่คืน usageMetadata จึงประมาณจากความยาว
    const tokens = Math.ceil(text.length / 4)
    console.log(`  สำเร็จในครั้งที่ ${emb.attempts} (${emb.ms} ms) · dims ${dims}`)
    console.log(
      `  ราคาโดยประมาณ : ${usd((tokens / 1e6) * PRICE.embedInput)}/คน  →  ` +
        `500 คน = ${usd(((tokens * 500) / 1e6) * PRICE.embedInput)}`
    )
    if (dims !== 768) console.log(`  ⚠ ได้ ${dims} มิติ ไม่ใช่ 768 — จะเก็บลง vector(768) ไม่ได้`)
  } else {
    capacityHit = capacityHit || transient(emb.error)
    console.log(`  ล้มเหลวครบ ${emb.attempts} ครั้ง (${emb.code})`)
  }

  console.log('')
  if (capacityHit) {
    console.log(
      '503/429 คือการถูกตัดตามความจุ ไม่ใช่บั๊กของโค้ด — เป็นอาการที่การเปิด billing แก้โดยตรง\n' +
        'รันสคริปต์นี้ซ้ำหลังเปิดแล้วเทียบ "สำเร็จในครั้งที่" กับเวลาตอบ'
    )
  }
  console.log(
    'free tier ยอมให้ Google นำ prompt ไปพัฒนาผลิตภัณฑ์ ส่วน paid tier ไม่ยอม\n' +
      'ระบบนี้ส่งข้อมูลส่วนบุคคลของผู้สมัครเข้าไป จึงเป็นเหตุผลหลักของการเปิด billing'
  )
}

main().catch((e) => {
  console.error('ล้มเหลวแบบไม่คาดคิด:', (e as any)?.message ?? e)
  process.exit(1)
})
