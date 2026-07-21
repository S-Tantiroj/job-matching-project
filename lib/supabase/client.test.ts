import { getBrowserClient } from './client'

test('getBrowserClient returns a client with auth', () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  const c = getBrowserClient()
  expect(c.auth).toBeDefined()
})
