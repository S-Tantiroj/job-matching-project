import 'dotenv/config'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildJobEmbedText, type JobInput } from '@/lib/jobs/normalize'
import { buildJobEmbedTextLegacy } from '@/lib/jobs/legacyEmbedText'
import { buildRubric, type Rubric } from '@/lib/eval/rubric'

// Builds the candidate pool that a human labels to create ground truth.
//
// Why a pool and not just "top 20 of the current ranker": if the set to be
// judged came from one ranker, that ranker could not lose — every candidate it
// likes would be judged, and anyone it wrongly buried would never get a label
// and so never count against it. So the pool is the UNION of the top slice from
// every variant under comparison, plus random draws, then shuffled with the
// source hidden. This is standard pooled relevance judging.
//
// Usage:  npx tsx scripts/make-eval-set.ts
// Cost:   2 embeddings per job (legacy + current text). Nothing is written to
//         the database — output is eval/pool.js for the labelling page.

const TOP_PER_VARIANT = 15
const RANDOM_DRAWS = 5

const DIR = join(process.cwd(), 'eval')
const RUBRIC_JSON = join(DIR, 'rubric.json')
const RUBRIC_JS = join(DIR, 'rubric.js')

// เขียนสำเนาให้เบราว์เซอร์อ่าน — หน้า label.html เปิดจาก file:// ซึ่งโหลด .json
// ด้วย fetch ไม่ได้ แต่โหลด <script src> ได้
const writeRubricJs = (rubrics: Record<string, Rubric>) =>
  writeFileSync(
    RUBRIC_JS,
    `// generated from eval/rubric.json — แก้ที่ rubric.json แล้วรัน: npx tsx scripts/make-eval-set.ts --rubric-only\nwindow.__RUBRIC__ = ${JSON.stringify(rubrics, null, 1)}\n`
  )

// --rebuild-rubric ทิ้งเกณฑ์เดิมแล้วสร้างใหม่จากฟิลด์ของงาน ใช้เมื่อกฎการสร้าง
// เกณฑ์ใน lib/eval/rubric.ts เปลี่ยน — ปกติไฟล์เดิมจะถูกรักษาไว้เสมอเพื่อไม่ให้
// ข้อความที่แก้ด้วยมือหายไป
const REBUILD = process.argv.includes('--rebuild-rubric')

const readRubrics = (): Record<string, Rubric> =>
  !REBUILD && existsSync(RUBRIC_JSON) ? JSON.parse(readFileSync(RUBRIC_JSON, 'utf8')) : {}

// แปลง rubric.json ที่แก้ด้วยมือแล้วให้เบราว์เซอร์ใช้ ไม่แตะฐานข้อมูลและไม่ใช้โควตา
if (process.argv.includes('--rubric-only')) {
  if (!existsSync(RUBRIC_JSON)) {
    console.error('ยังไม่มี eval/rubric.json — รันสคริปต์นี้แบบไม่ใส่ --rubric-only ก่อนหนึ่งครั้ง')
    process.exit(1)
  }
  writeRubricJs(readRubrics())
  console.log('อัปเดต eval/rubric.js จาก rubric.json แล้ว — รีเฟรชหน้า label.html ได้เลย')
  process.exit(0)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Deterministic shuffle so re-running does not reorder a partly-finished job.
function seededShuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261
  for (const ch of seed) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  const rand = () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return Math.abs(h) / 2 ** 31
  }
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const parseVec = (v: unknown): number[] | null =>
  v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as number[])

async function main() {
  const db = getServerClient()

  const { data: jobs, error: jErr } = await db
    .from('jobs')
    .select('id, title, company, description, required_skills, min_experience_years, location, category')
  if (jErr) throw new Error(`jobs query failed: ${jErr.message}`)
  if (!jobs?.length) throw new Error('no jobs — run scripts/seed-jobs.ts first')

  const { data: cands, error: cErr } = await db
    .from('candidates')
    .select(
      'id, full_name, headline, industry, location, summary, embedding, education(institution,country,degree,field_of_study,start_year,end_year), experience(company,title,start_date,end_date), candidate_skills(skills(name))'
    )
  if (cErr) throw new Error(`candidates query failed: ${cErr.message}`)

  const pool = (cands ?? [])
    .map((c: any) => ({ ...c, vec: parseVec(c.embedding) }))
    .filter((c: any) => c.vec)
  if (pool.length < 20) throw new Error(`need >=20 candidates with embeddings, found ${pool.length}`)

  console.log(`jobs: ${jobs.length}   candidates with embeddings: ${pool.length}`)
  console.log(`embedding ${jobs.length * 2} job texts (legacy + current)…`)

  mkdirSync(DIR, { recursive: true })
  // เกณฑ์ที่คุณแก้ไว้แล้วต้องไม่ถูกเขียนทับ — เติมเฉพาะงานที่ยังไม่มีเกณฑ์
  const rubrics = readRubrics()
  let added = 0

  const out: any[] = []

  for (const j of jobs as any[]) {
    const input: JobInput = {
      title: j.title,
      company: j.company ?? undefined,
      description: j.description ?? '',
      required_skills: j.required_skills ?? undefined,
      min_experience_years: j.min_experience_years ?? undefined,
      location: j.location ?? undefined,
      category: j.category ?? undefined,
    }

    if (!rubrics[j.id]) {
      rubrics[j.id] = buildRubric(j.id, input)
      added++
    }

    const legacyVec = await embedText(buildJobEmbedTextLegacy(input))
    const currentVec = await embedText(buildJobEmbedText(input))

    const fullRank = (jv: number[]) =>
      pool
        .map((c: any) => ({ id: c.id as string, s: cosine(c.vec, jv) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id)

    const topOf = (jv: number[]) => fullRank(jv).slice(0, TOP_PER_VARIANT)

    const ids = new Set<string>([...topOf(legacyVec), ...topOf(currentVec)])
    const rest = pool.filter((c: any) => !ids.has(c.id))
    for (const c of seededShuffle(rest, j.id).slice(0, RANDOM_DRAWS)) ids.add((c as any).id)

    // Order by how much the two variants DISAGREE about a person, because that
    // is what a label is worth. If both rank someone 5th, judging them says
    // nothing about which variant is better; if one ranks them 3rd and the other
    // 18th, that single judgement settles the question.
    //
    // Tier 1 = anyone either variant puts in its top 10. Those must be judged or
    // P@5 / P@10 cannot be computed at all. Tier 2 is everyone else — useful for
    // sharpening nDCG, safe to skip. Within each tier, biggest disagreement first,
    // so stopping early still spends the effort where it counted.
    const rankIn = (jv: number[]) => {
      const order = fullRank(jv)
      const m = new Map<string, number>()
      order.forEach((id, i) => m.set(id, i + 1))
      return m
    }
    const rL = rankIn(legacyVec)
    const rC = rankIn(currentVec)
    const FAR = pool.length + 1
    const priority = (id: string) => {
      const a = rL.get(id) ?? FAR
      const b = rC.get(id) ?? FAR
      return { tier: Math.min(a, b) <= 10 ? 1 : 2, gap: Math.abs(a - b) }
    }

    const byId = new Map(pool.map((c: any) => [c.id, c]))
    const ordered = seededShuffle([...ids], j.id).sort((x, y) => {
      const px = priority(x)
      const py = priority(y)
      return px.tier !== py.tier ? px.tier - py.tier : py.gap - px.gap
    })

    const cards = ordered.map((id) => {
      const c: any = byId.get(id)
      return {
        // tier only — never the ranks themselves. Showing a candidate's current
        // position would tell the labeller what the system already thinks and
        // quietly turn the ground truth into an echo of it.
        tier: priority(id).tier,
        id: c.id,
        full_name: c.full_name,
        headline: c.headline,
        industry: c.industry,
        location: c.location,
        summary: c.summary,
        education: (c.education ?? []).map((e: any) => ({
          institution: e.institution,
          country: e.country,
          degree: e.degree,
          field_of_study: e.field_of_study,
          years: [e.start_year, e.end_year].filter(Boolean).join('–'),
        })),
        experience: (c.experience ?? []).map((e: any) => ({
          title: e.title,
          company: e.company,
          years: [e.start_date?.slice(0, 4), e.end_date?.slice(0, 4) ?? 'now'].filter(Boolean).join('–'),
        })),
        skills: (c.candidate_skills ?? []).map((x: any) => x.skills?.name).filter(Boolean),
      }
    })

    out.push({
      job: {
        id: j.id,
        title: j.title,
        company: j.company,
        category: j.category,
        location: j.location,
        min_experience_years: j.min_experience_years,
        required_skills: j.required_skills ?? [],
        description: j.description,
      },
      candidates: cards,
    })
    const need = cards.filter((c) => c.tier === 1).length
    console.log(`  ${j.title}: ${cards.length} คน (จำเป็น ${need} · เสริม ${cards.length - need})`)
  }

  writeFileSync(
    join(DIR, 'pool.js'),
    `// generated by scripts/make-eval-set.ts — do not edit by hand\nwindow.__POOL__ = ${JSON.stringify(out, null, 1)}\n`
  )
  writeFileSync(RUBRIC_JSON, JSON.stringify(rubrics, null, 2) + '\n')
  writeRubricJs(rubrics)
  if (added) console.log(`\nสร้างเกณฑ์ใหม่ ${added} งาน (งานที่มีเกณฑ์อยู่แล้วไม่ถูกแตะ)`)

  const total = out.reduce((n, x) => n + x.candidates.length, 0)
  const needed = out.reduce((n, x) => n + x.candidates.filter((c: any) => c.tier === 1).length, 0)
  console.log(`\nเขียน eval/pool.js แล้ว`)
  console.log(`  จำเป็น ${needed} รายการ — พอสำหรับคำนวณผลได้ครบทุกตัวชี้วัด`)
  console.log(`  เสริมอีก ${total - needed} รายการ — ทำให้แม่นขึ้น ข้ามได้`)
  console.log('\nอ่าน eval/rubric.json ก่อน — แก้ข้อความเกณฑ์ได้ตามใจ')
  console.log('แก้แล้วรัน: npx tsx scripts/make-eval-set.ts --rubric-only')
  console.log('จากนั้นเปิด eval/label.html ในเบราว์เซอร์เพื่อเริ่มติดป้าย')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
