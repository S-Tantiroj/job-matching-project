import Link from 'next/link'
import { getSession, hasRole } from '@/lib/auth/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const isAdmin = !!session && hasRole(session.role, 'admin')
  const isDataManager = !!session && hasRole(session.role, 'data_manager')

  return (
    <div>
      <nav className="nav">
        <Link href="/dashboard" className="nav-brand">Skouth</Link>
        <Link href="/dashboard" className="nav-link">Dashboard</Link>
        <Link href="/search" className="nav-link">Search</Link>
        <Link href="/jobs" className="nav-link">Job</Link>
        <Link href="/shortlists" className="nav-link">Shortlist</Link>
        {isDataManager && <Link href="/candidates" className="nav-link">ข้อมูล</Link>}
        {isDataManager && <Link href="/import" className="nav-link">Import</Link>}
        {isAdmin && <Link href="/admin/users" className="nav-link">Admin</Link>}
        <div className="nav-right">
          <Link href="/settings" className="nav-link">Setting</Link>
        </div>
      </nav>
      <div className="container">{children}</div>
    </div>
  )
}
