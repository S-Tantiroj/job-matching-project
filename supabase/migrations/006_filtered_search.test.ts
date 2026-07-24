import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Integration: the new RPC exists and, with all filters null, returns rows
// shaped { id, similarity }. Uses a zero query vector (ranking value irrelevant).
test('match_candidates_filtered exists and returns id+similarity with no filters', async () => {
  const db = getServerClient()
  // Non-zero vector: cosine distance to an all-zero vector is undefined (NaN).
  const { data, error } = await db.rpc('match_candidates_filtered', {
    query_embedding: Array(768).fill(0.1),
    match_count: 3,
  })
  expect(error).toBeNull()
  expect(Array.isArray(data)).toBe(true)
  for (const row of data ?? []) {
    expect(typeof row.id).toBe('string')
    // PostgREST serializes float (double precision) as a numeric string over the
    // API, so assert it is a finite numeric value rather than a JS number type.
    expect(Number.isFinite(Number(row.similarity))).toBe(true)
  }
}, 30000)

test('candidates.years_experience column is selectable', async () => {
  const { error } = await getServerClient().from('candidates').select('years_experience').limit(1)
  expect(error).toBeNull()
}, 30000)
