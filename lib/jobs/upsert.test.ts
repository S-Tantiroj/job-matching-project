import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertJob } from './upsert'

// Integration: requires Supabase env + Gemini key (embeds on insert). Uses a
// unique external_id so the second call dedups on (source, external_id).
const EXT = `__test__${Date.now()}`

test('upsertJob inserts, then updates the same job on duplicate source+external_id', async () => {
  const base = {
    title: '__test__ Data Scientist',
    description: 'Build ML models',
    source: 'test',
    external_id: EXT,
  }

  const a = await upsertJob(base)
  expect(a.updated).toBe(false)

  const b = await upsertJob({ ...base, company: 'Acme' })
  expect(b.updated).toBe(true)
  expect(b.id).toBe(a.id)

  await getServerClient().from('jobs').delete().eq('id', a.id)
}, 30000)

test('upsertJob inserts a new row (updated: false) when no external_id is given', async () => {
  const r = await upsertJob({
    title: `__test__ no-ext ${Date.now()}`,
    description: 'Build ML models',
    source: 'test',
  })
  expect(r.updated).toBe(false)
  expect(typeof r.id).toBe('string')

  await getServerClient().from('jobs').delete().eq('id', r.id)
}, 30000)
