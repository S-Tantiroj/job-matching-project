import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default async function Dashboard() {
  const db = getServerClient()
  const session = await getSession()

  const { count } = await db.from('candidates').select('id', { count: 'exact', head: true })
  const { count: scraped } = await db
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'scraper')
  const { count: jobCount } = await db.from('jobs').select('id', { count: 'exact', head: true })

  const { data: recent } = await db
    .from('candidates')
    .select('id, full_name, headline, source')
    .order('created_at', { ascending: false })
    .limit(8)

  const { data: shortlists } = session
    ? await db
        .from('shortlists')
        .select('id, name, shortlist_candidates(count)')
        .eq('owner_id', session.userId)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <main>
      <h1>Dashboard</h1>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">ผู้สมัครทั้งหมด</div>
          <div className="metric-value">{count ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">จาก LinkedIn</div>
          <div className="metric-value">{scraped ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">งานที่เปิด</div>
          <div className="metric-value">{jobCount ?? 0}</div>
        </div>
      </div>

      <div className="section-header">
        <h2>Shortlist ของคุณ</h2>
        <Link href="/shortlists">+ สร้างใหม่</Link>
      </div>
      {(shortlists ?? []).length === 0 ? (
        <p className="faint">ยังไม่มี shortlist</p>
      ) : (
        <div className="card-grid">
          {(shortlists ?? []).map((sl: any) => (
            <Link key={sl.id} href={`/shortlists#${sl.id}`} className="shortlist-card" style={{ color: 'inherit' }}>
              <div className="row">
                <span className="shortlist-icon">★</span>
                <span style={{ fontWeight: 500 }}>{sl.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {sl.shortlist_candidates?.[0]?.count ?? 0} ผู้สมัคร
                </span>
                <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>เปิด →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="section-header">
        <h2>ผู้สมัครล่าสุด</h2>
      </div>
      <div className="list">
        {(recent ?? []).map((c: any) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="list-row" style={{ color: 'inherit' }}>
            <span className="avatar">{initials(c.full_name)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{c.full_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{c.headline}</div>
            </div>
            <span className={`tag ${c.source === 'scraper' ? 'tag-accent' : ''}`}>
              {c.source === 'scraper' ? 'linkedin' : c.source}
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
