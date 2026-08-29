import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Requires the migration to be applied and real Supabase env vars set.
test('candidates table exists and is queryable', async () => {
  const { error } = await getServerClient().from('candidates').select('id').limit(1)
  expect(error).toBeNull()
})

test('match_candidates RPC exists', async () => {
  const zero = new Array(768).fill(0)
  const { error } = await getServerClient().rpc('match_candidates', {
    query_embedding: zero,
    match_count: 1,
  })
  expect(error).toBeNull()
})
