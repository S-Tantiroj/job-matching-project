import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertCandidate } from './upsert'

// Integration: scraped candidate dedups on linkedin_url even if the name changes.
const URL = `__test__li_${Date.now()}`

test('scraped candidate dedups on linkedin_url', async () => {
  const base = {
    full_name: '__test__ LinkedIn Person',
    source: 'scraper' as const,
    linkedin_url: URL,
    professional_email: 'a@example.com',
    experience: [{ title: 'Data Scientist', company: 'Agoda', start_date: '2019-01-01', end_date: '2023-01-01' }],
  }

  const a = await upsertCandidate(base, null)
  expect(a.updated).toBe(false)

  const b = await upsertCandidate({ ...base, full_name: '__test__ Renamed' }, null)
  expect(b.updated).toBe(true)
  expect(b.id).toBe(a.id)

  await getServerClient().from('candidates').delete().eq('id', a.id)
}, 30000)
