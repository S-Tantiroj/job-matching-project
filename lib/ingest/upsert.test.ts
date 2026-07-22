import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertCandidate } from './upsert'

// Integration test: requires real Supabase env + Gemini key (embeds on insert).
// Uses a unique name and cleans up after itself so re-runs stay green.
const NAME = `__test__ สมชาย ใจดี ${Date.now()}`

test('upsert inserts, then updates the same candidate on duplicate name+country', async () => {
  const base = {
    full_name: NAME,
    source: 'csv' as const,
    education: [{ institution: 'Oxford', country: 'UK' }],
  }

  const a = await upsertCandidate(base, null)
  expect(a.updated).toBe(false)

  const b = await upsertCandidate({ ...base, headline: 'Updated headline' }, null)
  expect(b.updated).toBe(true)
  expect(b.id).toBe(a.id)

  // cleanup
  await getServerClient().from('candidates').delete().eq('id', a.id)
}, 30000)
