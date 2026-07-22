import 'dotenv/config'
import { generateThaiCandidates } from '@/lib/gemini/generate'
import { upsertCandidate } from '@/lib/ingest/upsert'

// Seeds synthetic Thai candidates (educated abroad) into the DB.
// Usage:  npx tsx scripts/seed-synthetic.ts [total]
//   e.g.  npx tsx scripts/seed-synthetic.ts 30
const total = Number(process.argv[2] ?? 30)
const BATCH = 10

async function main() {
  let done = 0
  for (let i = 0; i < total; i += BATCH) {
    const n = Math.min(BATCH, total - i)
    const batch = await generateThaiCandidates(n)
    for (const c of batch) {
      try {
        await upsertCandidate(c, null)
        done++
      } catch (e: any) {
        console.error('  skip one profile:', e?.message ?? e)
      }
    }
    console.log(`seeded ${done}/${total}`)
  }
  console.log(`Done. ${done} synthetic candidates in the database.`)
}

main().catch((e) => {
  console.error('Seed failed:', e?.message ?? e)
  process.exit(1)
})
