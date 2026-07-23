import Link from 'next/link'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
      <nav style={{ display: 'flex', gap: 16, paddingBottom: 16, borderBottom: '1px solid #eee' }}>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/search">ค้นหา</Link>
        <Link href="/jobs">งาน</Link>
        <Link href="/shortlists">Shortlist</Link>
        <Link href="/admin/users">Admin</Link>
        <Link href="/settings" style={{ marginLeft: 'auto' }}>
          ตั้งค่า
        </Link>
      </nav>
      <div style={{ paddingTop: 20 }}>{children}</div>
    </div>
  )
}
