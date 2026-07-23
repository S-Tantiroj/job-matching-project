import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Integration: proves the jobs table is writable/readable via the service-role
// client after migration 005. Uses a zero vector (embedding value is irrelevant
// here) and cleans up.
test('jobs table round-trips via server client', async () => {
  const db = getServerClient()
  const embedding = Array(768).fill(0)
  const { data, error } = await db
    .from('jobs')
    .insert({ title: `__test__ job ${Date.now()}`, description: 'x', source: 'test', embedding })
    .select('id')
    .single()
  expect(error).toBeNull()
  const id = (data as any).id

  const { data: read } = await db.from('jobs').select('id').eq('id', id).single()
  expect((read as any).id).toBe(id)

  await db.from('jobs').delete().eq('id', id)
}, 30000)
