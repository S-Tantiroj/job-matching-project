import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertJob } from './upsert'
import { matchCandidatesForJob } from './match'
import { tolerateOutage } from '@/test-utils/integration'

// Integration: seeds a temp job, ranks existing candidates, asserts shape and
// score bounds. Requires candidates to already exist in the DB. Cleans up.
test('matchCandidatesForJob returns candidates scored 0..100 descending', async (ctx) => {
  await tolerateOutage(ctx, async () => {
    const { id } = await upsertJob({
      title: '__test__ Data Scientist',
      description: 'Python machine learning, studied abroad',
      source: 'test',
      external_id: `__test__match${Date.now()}`,
    })

    const results = await matchCandidatesForJob(id, 10)
    expect(Array.isArray(results)).toBe(true)
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
      expect(typeof r.full_name).toBe('string')
    }
    const scores = results.map((r) => r.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))

    await getServerClient().from('jobs').delete().eq('id', id)
  })
}, 30000)

test('matchCandidatesForJob returns [] for a non-existent job', async (ctx) => {
  await tolerateOutage(ctx, async () => {
    const results = await matchCandidatesForJob('00000000-0000-0000-0000-000000000000')
    expect(results).toEqual([])
  })
}, 30000)
