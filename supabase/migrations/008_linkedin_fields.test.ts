import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'

// Integration: the new columns exist and linkedin_url is uniquely constrained.
test('candidates has linkedin columns and a unique linkedin_url', async () => {
  const db = getServerClient()
  const url = `__test__url_${Date.now()}`
  const embedding = Array(768).fill(0)

  const { data: a, error: e1 } = await db
    .from('candidates')
    .insert({
      full_name: '__test__ LI A',
      source: 'scraper',
      embedding,
      linkedin_url: url,
      professional_email: 'a@example.com',
      refreshed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  expect(e1).toBeNull()

  // Duplicate linkedin_url must violate the unique index.
  const { error: e2 } = await db
    .from('candidates')
    .insert({ full_name: '__test__ LI B', source: 'scraper', embedding, linkedin_url: url })
  expect(e2).not.toBeNull()

  await db.from('candidates').delete().eq('id', (a as any).id)
}, 30000)
