import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import ImportForm from '@/components/ImportForm'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  success: 'status-pill--ok',
  partial: 'status-pill--warn',
  failed: 'status-pill--bad',
  running: 'status-pill--warn',
}

export default async function ImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const db = getServerClient()

  const { data: runs, error: runsError } = await db
    .from('ingest_runs')
    .select('id, trigger, source, status, imported, updated, pending, skipped_unchanged, skipped_suppressed, started_at')
    .order('started_at', { ascending: false })
    .limit(20)
  if (runsError) console.error('ingest_runs query failed:', runsError.message)

  const { count: pendingCount } = await db
    .from('pending_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <main>
      <h1>นำเข้าข้อมูล</h1>

      <div className="row" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
        <Link href="/import/pending" className="btn">
          คิวรอตรวจ ({pendingCount ?? 0})
        </Link>
        <Link href="/import/suppressed" className="btn">รายชื่อระงับ</Link>
      </div>

      <div className="section-header"><h2>นำเข้าด้วยตนเอง (CSV)</h2></div>
      <ImportForm />

      <div className="section-header"><h2>ประวัติการนำเข้า</h2></div>
      {(runs ?? []).length === 0 ? (
        <p className="faint">ยังไม่มีประวัติ</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ที่มา</th>
                <th>เพิ่ม</th>
                <th>อัปเดต</th>
                <th>เข้าคิว</th>
                <th>ข้าม (ไม่เปลี่ยน)</th>
                <th>ข้าม (ถูกระงับ)</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td className="muted">{String(r.started_at ?? '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="muted">{r.source} · {r.trigger}</td>
                  <td>{r.imported}</td>
                  <td>{r.updated}</td>
                  <td>{r.pending}</td>
                  <td className="muted">{r.skipped_unchanged}</td>
                  <td className="muted">{r.skipped_suppressed}</td>
                  <td>
                    <span className={`status-pill ${STATUS_CLASS[r.status] ?? ''}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
