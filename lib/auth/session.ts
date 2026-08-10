export type Role = 'admin' | 'data_manager' | 'member'

// ลำดับชั้นสิทธิ์: ตัวเลขสูงกว่าผ่านประตูของตัวเลขต่ำกว่าได้ทั้งหมด
const ROLE_RANK: Record<Role, number> = {
  member: 1,
  data_manager: 2,
  admin: 3,
}

// Pure role-gate check. rank 0 สำหรับค่าที่ไม่รู้จัก (ข้อมูลเพี้ยนจาก DB) จะไม่ผ่านประตูใดเลย
export function hasRole(userRole: Role, required: Role): boolean {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[required] ?? 0)
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
