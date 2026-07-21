import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client using the service-role key. NEVER import this
// into client components — the service-role key bypasses RLS.
export function getServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
