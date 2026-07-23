import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { scoreCandidateAgainst } from './score'
import { requirementHash } from './cache'

// Integration: picks any existing candidate, scores once (LLM), then again
// (cache hit). Requires candidates to exist. Cleans up the analyses row.
const REQUIREMENT = `__test__ requirement ${Date.now()}`

test('scoreCandidateAgainst returns a 0..100 score and caches on the second call', async () => {
  const db = getServerClient()
  const { data: c } = await db.from('candidates').select('id').limit(1).single()
  const candidateId = (c as any).id

  const first = await scoreCandidateAgainst(candidateId, REQUIREMENT)
  expect(first.cached).toBe(false)
  expect(first.score).toBeGreaterThanOrEqual(0)
  expect(first.score).toBeLessThanOrEqual(100)

  const second = await scoreCandidateAgainst(candidateId, REQUIREMENT)
  expect(second.cached).toBe(true)
  expect(second.score).toBe(first.score)

  await db
    .from('analyses')
    .delete()
    .eq('candidate_id', candidateId)
    .eq('requirement_hash', requirementHash(REQUIREMENT))
}, 30000)
