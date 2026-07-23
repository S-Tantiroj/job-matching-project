export type Role = 'admin' | 'member'

// Pure role-gate check. admin passes any gate; member passes only the member gate.
export function hasRole(userRole: Role, required: Role): boolean {
  return userRole === 'admin' || userRole === required
}

// Reads the current authenticated user + role from request cookies.
// Uses a cookie-aware server client (NOT the service-role client, which has no
// user context). Returns null when not signed in.
// next/headers is imported dynamically so this module stays importable in plain
// Node (e.g. unit tests that only use hasRole).
export async function getSession(): Promise<{ userId: string; role: Role } | null> {
  const { cookies } = await import('next/headers')
  const { createServerClient } = await import('@supabase/ssr')

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return { userId: user.id, role: ((p as any)?.role ?? 'member') as Role }
}
