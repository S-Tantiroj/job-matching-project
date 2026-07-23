import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const db = getServerClient()

  const { count } = await db.from('candidates').select('id', { count: 'exact', head: true })
  const { data: recent } = await db
    .from('candidates')
    .select('id, full_name, headline, source, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <main>
      <h1>Dashboard</h1>
      <div style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
        <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, minWidth: 160 }}>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{count ?? 0}</div>
          <div style={{ color: '#888' }}>ผู้สมัครทั้งหมด</div>
        </div>
      </div>

      <h2>ผู้สมัครล่าสุด</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(recent ?? []).map((c: any) => (
          <li key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f2f2f2' }}>
            <Link href={`/candidates/${c.id}`} style={{ fontWeight: 600 }}>
              {c.full_name}
            </Link>
            <span style={{ color: '#888', marginLeft: 8 }}>{c.headline}</span>
            <span style={{ fontSize: 12, color: '#bbb', marginLeft: 8 }}>[{c.source}]</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
