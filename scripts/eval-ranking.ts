import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildJobEmbedText, type JobInput } from '@/lib/jobs/normalize'
import { buildJobEmbedTextLegacy } from '@/lib/jobs/legacyEmbedText'
import { gradeFromChecks, type Rubric } from '@/lib/eval/rubric'

// Scores the current job-embedding format against the one it replaced, using
// the human labels from eval/label.html as ground truth.
//
// Only labelled candidates are ranked. An unlabelled candidate is not evidence
// of anything — treating it as irrelevant would punish whichever variant
// surfaced people the labeller never got to.
//
// Usage:  npx tsx scripts/eval-ranking.ts [path/to/labels.json]
// Cost:   2 embeddings per job. Read-only.

const labelsPath = process.argv[2] ?? join(process.cwd(), 'eval', 'labels.json')

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

const precisionAt = (graded: number[], k: number) =>
  graded.slice(0, k).filter((g) => g >= 1).length / Math.min(k, graded.length)

const mrr = (graded: number[]) => {
  const i = graded.findIndex((g) => g === 2)
  return i === -1 ? 0 : 1 / (i + 1)
}

function ndcgAt(graded: number[], k: number): number {
  const dcg = (xs: number[]) =>
    xs.slice(0, k).reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0)
  const ideal = dcg([...graded].sort((a, b) => b - a))
  return ideal === 0 ? 0 : dcg(graded) / ideal
}

const parseVec = (v: unknown): number[] | null =>
  v == null ? null : typeof v === 'string' ? JSON.parse(v) : (v as number[])

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + '%'

async function main() {
  let raw: any
  try {
    raw = JSON.parse(readFileSync(labelsPath, 'utf8'))
  } catch {
    throw new Error(
      `อ่าน ${labelsPath} ไม่ได้ — ติดป้ายใน eval/label.html แล้วกดดาวน์โหลด จากนั้นวางไฟล์ไว้ที่ eval/labels.json`
    )
  }
  const rubricPath = join(process.cwd(), 'eval', 'rubric.json')
  let rubrics: Record<string, Rubric>
  try {
    rubrics = JSON.parse(readFileSync(rubricPath, 'utf8'))
  } catch {
    throw new Error(`อ่าน ${rubricPath} ไม่ได้ — รัน npx tsx scripts/make-eval-set.ts ก่อน`)
  }

  const labels: Record<string, any> = raw.labels ?? raw

  // key = "<jobId>|<candidateId>" · ค่าเป็น { checks, done } — คะแนนถูกคำนวณตรงนี้
  // ที่เดียวจากเกณฑ์ปัจจุบัน แก้ rubric.json แล้วรันซ้ำได้เลย ไม่ต้องติดป้ายใหม่
  const byJob = new Map<string, Map<string, number>>()
  let skippedUnfinished = 0
  for (const [k, rec] of Object.entries(labels)) {
    const [jobId, candId] = k.split('|')
    const rubric = rubrics[jobId]
    if (!rubric) continue
    if (!rec?.done) {
      skippedUnfinished++
      continue
    }
    const grade =
      typeof rec === 'number'
        ? rec
        : typeof rec.legacyGrade === 'number'
          ? rec.legacyGrade
          : gradeFromChecks(rubric, rec.checks ?? {})
    if (!byJob.has(jobId)) byJob.set(jobId, new Map())
    byJob.get(jobId)!.set(candId, grade)
  }

  const judgedTotal = [...byJob.values()].reduce((n, m) => n + m.size, 0)
  if (judgedTotal < 20) throw new Error(`ตัดสินเสร็จแค่ ${judgedTotal} รายการ — ควรมีอย่างน้อย 20`)
  if (skippedUnfinished) console.log(`ข้าม ${skippedUnfinished} รายการที่ยังไม่กด "ตัดสินแล้ว"\n`)
  const entries = { length: judgedTotal }

  const db = getServerClient()
  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, company, description, required_skills, min_experience_years, location, category')
    .in('id', [...byJob.keys()])
  const { data: cands } = await db.from('candidates').select('id, full_name, embedding')

  const vecOf = new Map<string, number[]>()
  for (const c of (cands ?? []) as any[]) {
    const v = parseVec(c.embedding)
    if (v) vecOf.set(c.id, v)
  }
  const nameOf = new Map((cands ?? []).map((c: any) => [c.id, c.full_name]))

  const agg: Record<string, { p5: number[]; p10: number[]; mrr: number[]; ndcg: number[] }> = {
    legacy: { p5: [], p10: [], mrr: [], ndcg: [] },
    current: { p5: [], p10: [], mrr: [], ndcg: [] },
  }

  console.log(`ตัดสินแล้ว ${entries.length} รายการ ใน ${byJob.size} งาน (คะแนนคำนวณจาก eval/rubric.json)\n`)

  for (const j of (jobs ?? []) as any[]) {
    const judged = byJob.get(j.id)!
    const ids = [...judged.keys()].filter((id) => vecOf.has(id))
    const good = ids.filter((id) => judged.get(id)! >= 1).length
    if (!good) {
      console.log(`${j.title} — ข้าม (ไม่มีใครถูกตัดสินว่าเหมาะเลย)\n`)
      continue
    }

    const input: JobInput = {
      title: j.title,
      company: j.company ?? undefined,
      description: j.description ?? '',
      required_skills: j.required_skills ?? undefined,
      min_experience_years: j.min_experience_years ?? undefined,
      location: j.location ?? undefined,
      category: j.category ?? undefined,
    }
    const variants = {
      legacy: await embedText(buildJobEmbedTextLegacy(input)),
      current: await embedText(buildJobEmbedText(input)),
    }

    // ถ้าคนที่สูตรหนึ่งดันขึ้น top-10 ยังไม่ถูกติดป้าย ตัวเลขของสูตรนั้นจะดูดีเกินจริง
    // เพราะความผิดพลาดของมันไม่มีใครตัดสิน — เตือนไว้ให้เห็นก่อนอ่านผล
    const allVecs = [...vecOf.entries()]
    const coverage = Object.entries(variants).map(([name, jv]) => {
      const top10 = allVecs
        .map(([id, v]) => ({ id, s: cosine(v, jv) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 10)
      return { name, judged: top10.filter((x) => judged.has(x.id)).length }
    })

    console.log(`${j.title}  (ตรวจ ${ids.length} คน · เหมาะ ${good} คน)`)
    for (const c of coverage) {
      if (c.judged < 10) {
        console.log(`  ⚠ top-10 ของสูตร ${c.name} ถูกติดป้ายแค่ ${c.judged}/10 — ตัวเลขของมันจะดูดีเกินจริง`)
      }
    }
    const ranked: Record<string, string[]> = {}

    for (const [name, jv] of Object.entries(variants)) {
      const order = ids
        .map((id) => ({ id, s: cosine(vecOf.get(id)!, jv) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id)
      ranked[name] = order
      const graded = order.map((id) => judged.get(id)!)

      const m = {
        p5: precisionAt(graded, 5),
        p10: precisionAt(graded, 10),
        mrr: mrr(graded),
        ndcg: ndcgAt(graded, 10),
      }
      agg[name].p5.push(m.p5)
      agg[name].p10.push(m.p10)
      agg[name].mrr.push(m.mrr)
      agg[name].ndcg.push(m.ndcg)
      console.log(
        `  ${name.padEnd(8)} P@5 ${pct(m.p5)}   P@10 ${pct(m.p10)}   MRR ${m.mrr.toFixed(3)}   nDCG@10 ${m.ndcg.toFixed(3)}`
      )
    }

    const top = (n: string) => ranked[n].slice(0, 3).map((id) => `${nameOf.get(id)}(${judged.get(id)})`).join(', ')
    console.log(`  บนสุดเก่า : ${top('legacy')}`)
    console.log(`  บนสุดใหม่ : ${top('current')}\n`)
  }

  console.log('=== เฉลี่ยทุกงาน ===')
  for (const name of ['legacy', 'current']) {
    const a = agg[name]
    console.log(
      `  ${name.padEnd(8)} P@5 ${pct(mean(a.p5))}   P@10 ${pct(mean(a.p10))}   MRR ${mean(a.mrr).toFixed(3)}   nDCG@10 ${mean(a.ndcg).toFixed(3)}`
    )
  }

  const d = mean(agg.current.ndcg) - mean(agg.legacy.ndcg)
  const nJobs = agg.legacy.ndcg.length
  console.log(`\n  ส่วนต่าง nDCG@10 = ${d >= 0 ? '+' : ''}${d.toFixed(3)} (สูตรใหม่ - สูตรเก่า)`)
  console.log(
    `\nอ่านผลอย่างระวัง: วัดจาก ${nJobs} งาน ซึ่งน้อยเกินกว่าจะสรุปเชิงสถิติ\n` +
      'ถ้าส่วนต่างน้อยกว่า 0.05 ให้ถือว่าเสมอ และตัดสินด้วยเหตุผลอื่นแทน\n' +
      'ถ้าสูตรใหม่แย่กว่าชัดเจน ให้ย้อน buildJobEmbedText กลับเป็นเวอร์ชันใน lib/jobs/legacyEmbedText.ts'
  )
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
