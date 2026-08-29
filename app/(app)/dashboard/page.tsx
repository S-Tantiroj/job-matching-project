import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import ActivityList from '@/components/ActivityList'
import { listMyActivity, listRecentlyViewed } from '@/lib/activity/read'

export const dynamic = 'force-dynamic'

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default async function Dashboard() {
  const db = getServerClient()
  const session = await getSession()

  const { count } = await db.from('candidates').select('id', { count: 'exact', head: true })

  // ยอดเปลี่ยนแปลงสุทธิใน 30 วัน = เข้ามาใหม่ − ถูกลบออก
  //
  // ต้องเป็นสุทธิ ไม่ใช่ "จำนวนแถวที่ถูกแตะ" เพราะจำนวนนับติดลบไม่ได้ เครื่องหมาย
  // บวก/ลบจึงไม่มีความหมาย ฝั่งที่ถูกลบอ่านจาก activity_log ได้เพราะแถวใน
  // candidates หายไปแล้ว — ไม่มีที่อื่นให้นับ
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count: added } = await db
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)

  const { data: removals } = await db
    .from('activity_log')
    .select('count')
    .in('action', ['delete', 'suppress'])
    .gte('created_at', since)
  const removed = (removals ?? []).reduce((n, r: any) => n + (r.count ?? 1), 0)

  const net = (added ?? 0) - removed

  const { count: jobCount } = await db.from('jobs').select('id', { count: 'exact', head: true })

  const { data: shortlists } = session
    ? await db
        .from('shortlists')
        .select('id, name, shortlist_candidates(count)')
        .eq('owner_id', session.userId)
        .order('created_at', { ascending: false })
    : { data: [] }

  const myActivity = session ? await listMyActivity(session.userId, 12) : []
  const viewed = session ? await listRecentlyViewed(session.userId, 6) : []

  return (
    <main>
      <h1>Dashboard</h1>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">ผู้สมัครทั้งหมด</div>
          <div className="metric-value">{count ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">เปลี่ยนแปลงใน 30 วัน</div>
          <div
            className={`metric-value ${net > 0 ? 'metric-value--up' : net < 0 ? 'metric-value--down' : ''}`}
          >
            {/* ใช้ − (U+2212) ไม่ใช่ hyphen เพราะความสูงและความกว้างเท่ากับ + พอดี
                ทำให้ตัวเลขสองแบบไม่กระตุกเมื่อสลับเครื่องหมาย */}
            {net > 0 ? '+' : net < 0 ? '−' : ''}
            {Math.abs(net)}
          </div>
          <div className="metric-note">
            เข้ามา {added ?? 0} · ลบออก {removed}
          </div>
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

      {viewed.length > 0 && (
        <>
          <div className="section-header">
            <h2>เพิ่งดูล่าสุด</h2>
          </div>
          <div className="list">
            {viewed.map((c) => (
              <Link key={c.id} href={`/candidates/${c.id}`} className="list-row" style={{ color: 'inherit' }}>
                <span className="avatar">{initials(c.full_name)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{c.full_name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{c.headline ?? '—'}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="section-header">
        <h2>กิจกรรมของคุณ</h2>
      </div>
      <ActivityList
        rows={myActivity}
        empty="ยังไม่มีกิจกรรมของคุณ — ลองค้นหาผู้สมัครแล้วเพิ่มเข้า shortlist ดู"
      />
    </main>
  )
}
