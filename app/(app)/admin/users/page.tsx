import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import RoleSelect from '@/components/RoleSelect'

export const dynamic = 'force-dynamic'

export default async function AdminUsers() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'admin')) redirect('/dashboard')

  const { data: users } = await getServerClient()
    .from('profiles')
    .select('id, display_name, role, created_at')
    .order('created_at')

  return (
    <main>
      <h1>จัดการผู้ใช้</h1>
      <div className="list">
        {(users ?? []).map((u: any) => (
          <div key={u.id} className="list-row">
            <span style={{ flex: 1, fontWeight: 500 }}>{u.display_name ?? u.id}</span>
            <RoleSelect userId={u.id} role={u.role} />
          </div>
        ))}
      </div>
    </main>
  )
}
