import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText } from '@/lib/ingest/normalize'
import type { CandidateInput } from '@/lib/ingest/normalize'

// Measures how much candidate ranking degrades when the fields a PhantomBuster
// SEARCH EXPORT cannot supply are removed from the embedding.
//
// Why this script exists: the search-export phantom has no `skills` column and
// only a partial summary (additionalInfo). buildEmbedText never used
// field_of_study or experience.description, so those two cost the ranking
// nothing — skills and summary are the whole question, and this answers it with
// numbers instead of intuition.
//
// Method: take candidates that DO have skills, re-embed each one three ways,
// then rank all of them against every stored job embedding and compare the
// orderings. Read-only — nothing is written back to the database.
//
// Usage:  npx tsx scripts/ablate-embedding.ts [candidateCount]
// Cost:   3 embeddings per candidate (default 25 -> 75 calls, no generate calls)

const N = Number(process.argv[2] ?? 25)

type Variant = 'full' | 'noSkills' | 'noSkillsNoSummary'

const strip = (c: CandidateInput, v: Variant): CandidateInput =>
  v === 'full'
    ? c
    : v === 'noSkills'
      ? { ...c, skills: undefined }
      : { ...c, skills: undefined, summary: undefined }

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

// Spearman rank correlation: 1.0 = identical order, 0 = unrelated.
function spearman(a: string[], b: string[]): number {
  const rb = new Map(b.map((id, i) => [id, i]))
  const n = a.length
  let sum = 0
  a.forEach((id, i) => {
    const d = i - (rb.get(id) ?? 0)
    sum += d * d
  })
  return 1 - (6 * sum) / (n * (n * n - 1))
}

const overlap = (a: string[], b: string[], k: number) =>
  a.slice(0, k).filter((id) => b.slice(0, k).includes(id)).length

async function main() {
  const db = getServerClient()

  const { data: raw, error } = await db
    .from('candidates')
    .select(
      'id, full_name, headline, summary, education(institution,country,degree,field_of_study), experience(company,title), candidate_skills(skills(name))'
    )
    .limit(300)
  if (error) throw new Error(`candidates query failed: ${error.message}`)

  const pool = (raw ?? [])
    .map((c: any) => ({
      id: c.id as string,
      input: {
        full_name: c.full_name,
        headline: c.headline ?? undefined,
        summary: c.summary ?? undefined,
        source: 'scraper',
        education: c.education ?? undefined,
        experience: c.experience ?? undefined,
        skills: (c.candidate_skills ?? []).map((x: any) => x.skills?.name).filter(Boolean),
      } as CandidateInput,
    }))
    .filter((c) => (c.input.skills?.length ?? 0) > 0)
    .slice(0, N)

  if (pool.length < 5) throw new Error(`need >=5 candidates with skills, found ${pool.length}`)

  const { data: jobs } = await db.from('jobs').select('id, title, embedding').limit(20)
  const usable = (jobs ?? []).filter((j: any) => j.embedding)
  if (!usable.length) throw new Error('no jobs with an embedding — run scripts/seed-jobs.ts first')

  console.log(`candidates: ${pool.length}   jobs: ${usable.length}`)
  console.log(`embedding ${pool.length * 3} texts…\n`)

  const vecs = new Map<string, Record<Variant, number[]>>()
  const variants: Variant[] = ['full', 'noSkills', 'noSkillsNoSummary']
  let done = 0
  for (const c of pool) {
    const v = {} as Record<Variant, number[]>
    for (const name of variants) v[name] = await embedText(buildEmbedText(strip(c.input, name)))
    vecs.set(c.id, v)
    process.stdout.write(`\r  ${++done}/${pool.length}`)
  }
  console.log('\n')

  const agg: Record<string, { rho: number[]; ov: number[] }> = {
    noSkills: { rho: [], ov: [] },
    noSkillsNoSummary: { rho: [], ov: [] },
  }

  for (const j of usable as any[]) {
    const je: number[] = typeof j.embedding === 'string' ? JSON.parse(j.embedding) : j.embedding
    const rank = (v: Variant) =>
      pool
        .map((c) => ({ id: c.id, s: cosine(vecs.get(c.id)![v], je) }))
        .sort((a, b) => b.s - a.s)
        .map((x) => x.id)

    const base = rank('full')
    console.log(`งาน: ${j.title}`)
    for (const v of ['noSkills', 'noSkillsNoSummary'] as Variant[]) {
      const r = rank(v)
      const rho = spearman(base, r)
      const ov = overlap(base, r, 10)
      agg[v].rho.push(rho)
      agg[v].ov.push(ov)
      console.log(`  ${v.padEnd(18)} spearman ${rho.toFixed(3)}   top-10 เหมือนเดิม ${ov}/10`)
    }
    console.log()
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  console.log('=== สรุปเฉลี่ยทุกงาน ===')
  for (const v of ['noSkills', 'noSkillsNoSummary']) {
    console.log(
      `  ${v.padEnd(18)} spearman ${mean(agg[v].rho).toFixed(3)}   top-10 ${mean(agg[v].ov).toFixed(1)}/10`
    )
  }
  console.log(
    '\nอ่านผล: spearman ใกล้ 1 และ top-10 ใกล้ 10 = การเสีย skills แทบไม่เปลี่ยนอันดับ\n' +
      'ถ้า top-10 ต่ำกว่า 7 แปลว่าควรเปลี่ยนไปใช้ phantom แบบดูดโปรไฟล์'
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
