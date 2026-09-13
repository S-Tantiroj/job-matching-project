import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import ImportForm from '@/components/ImportForm'
import XraySearchCard from '@/components/XraySearchCard'

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

      <div className="section-header"><h2>ขั้นที่ 1 — หาโปรไฟล์ด้วย X-ray search</h2></div>
      <XraySearchCard />

      <div className="section-header"><h2>ขั้นที่ 2 — กรอกข้อมูลลงเทมเพลต</h2></div>
      <p className="faint" style={{ fontSize: 13 }}>
        กรอกลงไฟล์เทมเพลตที่ดาวน์โหลดจากขั้นที่ 1 แถวที่ขาดประวัติการทำงานหรือการศึกษา
        จะเข้า <Link href="/import/pending">คิวรอตรวจ</Link> แทนที่จะเข้าฐานผู้สมัครทันที
      </p>
      <p className="faint" style={{ fontSize: 13 }}>
        <strong>สองข้อที่ผลการค้นหาของ Google ให้ไม่ครบ ต้องเปิดโปรไฟล์อ่านเอง</strong>
        {' — '}
        <strong>ช่วงเวลาทำงานและปีที่จบ</strong> (เช่น <code>Jan 2022 - Present</code>,
        {' '}<code>2015 - 2019</code>) ไม่กรอกแล้วระบบจะนับประสบการณ์เป็น 0 ปี
        แล้วคนนั้นจะหลุดตัวกรอง &ldquo;ประสบการณ์ขั้นต่ำ&rdquo; ทุกครั้งโดยไม่มีอะไรเตือน
        {' · '}
        และ<strong>ชื่อสถาบันให้กรอกเป็นภาษาอังกฤษ</strong> (Chulalongkorn University
        ไม่ใช่ จุฬาลงกรณ์มหาวิทยาลัย) เพราะระบบค้นหาเทียบข้อความกับตำแหน่งงานที่เป็น
        ภาษาอังกฤษ กรอกไทยแล้วจะจับคู่งานได้แย่ลงโดยไม่มีอาการ
      </p>

      <div className="section-header"><h2>ขั้นที่ 3 — อัปโหลดไฟล์ CSV</h2></div>
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
