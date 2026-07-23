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
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: 8 }}>ผู้ใช้</th>
            <th style={{ padding: 8 }}>สิทธิ์</th>
          </tr>
        </thead>
        <tbody>
          {(users ?? []).map((u: any) => (
            <tr key={u.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
              <td style={{ padding: 8 }}>{u.display_name ?? u.id}</td>
              <td style={{ padding: 8 }}>
                <RoleSelect userId={u.id} role={u.role} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
