import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { computeYearsExperience } from '@/lib/ingest/normalize'

// One-off: recompute candidates.years_experience for existing rows from their
// experience records. Idempotent.
// Usage:  npx tsx scripts/backfill-years.ts
async function main() {
  const db = getServerClient()
  const { data: rows } = await db.from('candidates').select('id, experience(start_date, end_date)')
  let done = 0
  for (const c of (rows ?? []) as any[]) {
    const years = computeYearsExperience(c.experience ?? [])
    await db.from('candidates').update({ years_experience: years }).eq('id', c.id)
    done++
  }
  console.log(`Backfilled years_experience for ${done} candidates.`)
}

main().catch((e) => {
  console.error('Backfill failed:', e?.message ?? e)
  process.exit(1)
})
