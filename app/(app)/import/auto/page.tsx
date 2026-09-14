import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import ImportTabs from '@/components/import/ImportTabs'
import {
  readPhantombusterConfig,
  PHANTOMBUSTER_VARS,
} from '@/lib/ingest/phantombusterConfig'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  success: 'status-pill--ok',
  partial: 'status-pill--warn',
  failed: 'status-pill--bad',
  running: 'status-pill--warn',
}

// การดึงข้อมูลอัตโนมัติ — สถานะและประวัติ
//
// **หน้านี้ไม่ใช่ที่จองไว้สำหรับฟีเจอร์ในอนาคต** ฟีเจอร์มีอยู่จริงในโค้ดแล้ว
// (`scripts/sync-phantombuster.ts` + `.github/workflows/sync-candidates.yml`)
// แค่ยังไม่ได้ตั้ง secret และตาราง cron ถูกปิดไว้ — หน้าที่บอกว่า "ปิดอยู่ เปิดยังไง"
// ต่างจากหน้าที่บอกว่า "ยังไม่มี" อย่างสิ้นเชิง
//
// **ตาราง `ingest_runs` ย้ายมาจาก /import เพราะมันอยู่ผิดหน้ามาตั้งแต่ต้น** —
// `app/api/ingest/route.ts` เขียนลง `activity_log` ไม่ใช่ `ingest_runs`
// ตารางนี้จึงมีแต่แถวที่สคริปต์อัตโนมัติสร้าง ไม่เคยมีแถวจากการอัปโหลดด้วยมือเลย
export default async function AutoImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const db = getServerClient()
  const { data: runs, error: runsError } = await db
    .from('ingest_runs')
    .select('id, trigger, source, status, imported, updated, pending, skipped_unchanged, skipped_suppressed, started_at')
    .order('started_at', { ascending: false })
    .limit(20)
  if (runsError) console.error('ingest_runs query failed:', runsError.message)

  // อ่านจาก env ของเซิร์ฟเวอร์ — ค่าเหล่านี้ไม่ใช่ NEXT_PUBLIC_ จึงไม่รั่วไปฝั่งเบราว์เซอร์
  // และหน้านี้แสดงแค่ "ตั้งแล้วหรือยัง" ไม่เคยแสดงตัวค่า
  const config = readPhantombusterConfig(process.env)

  return (
    <main>
      <h1>ดึงอัตโนมัติ</h1>
      <ImportTabs current="auto" />

      <div className="section-header"><h2>สถานะ</h2></div>
      {config.kind === 'ok' && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <span className="status-pill status-pill--ok">ตั้งค่าครบแล้ว</span>
          </p>
          <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
            ถ้ายังไม่มีประวัติการรันด้านล่าง ให้ตรวจว่าตาราง <code>schedule:</code> ใน{' '}
            <code>.github/workflows/sync-candidates.yml</code> ถูกเปิดคอมเมนต์ออกแล้ว
            — การตั้ง secret อย่างเดียวไม่ทำให้มันเริ่มทำงานเอง
          </p>
        </div>
      )}

      {config.kind === 'not-configured' && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <span className="status-pill status-pill--warn">ยังไม่ได้ตั้งค่า</span>
          </p>
          <p className="faint" style={{ fontSize: 13 }}>
            เส้นทางนี้ยังไม่ทำงาน ซึ่งเป็นสภาวะปกติจนกว่าจะมีบัญชีบริการดึงข้อมูล
            ระหว่างนี้ใช้เส้นทางอัปโหลดเองหรือค้นหาเพิ่มเติมได้ตามปกติ
          </p>
          <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
            เปิดใช้งานต้องทำ <strong>สองอย่าง</strong> — ตั้งค่า{' '}
            {PHANTOMBUSTER_VARS.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}{' '}
            ที่ Settings → Secrets and variables → Actions <strong>และ</strong>
            เปิดคอมเมนต์ตาราง <code>schedule:</code> ใน{' '}
            <code>.github/workflows/sync-candidates.yml</code>
          </p>
        </div>
      )}

      {config.kind === 'incomplete' && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <span className="status-pill status-pill--bad">ตั้งค่าไม่ครบ</span>
          </p>
          <p className="faint" style={{ fontSize: 13, marginBottom: 0 }}>
            ตั้งแล้ว {config.present.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
            {' '}แต่ยังขาด {config.missing.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
            {' — '}สภาวะนี้แปลว่ามีคนตั้งใจตั้งค่าแล้วทำไม่ครบ หรือมีค่าถูกลบไปหนึ่งตัว
            ควรแก้ให้ครบหรือลบออกทั้งหมด
          </p>
        </div>
      )}

      <div className="section-header"><h2>ประวัติการรัน</h2></div>
      {runsError ? (
        <p style={{ color: 'var(--bad)' }}>อ่านประวัติการรันไม่สำเร็จ ลองรีเฟรชอีกครั้ง</p>
      ) : (runs ?? []).length === 0 ? (
        <p className="faint">
          ยังไม่เคยรัน — ตารางนี้บันทึกเฉพาะการดึงอัตโนมัติ การอัปโหลดด้วยมือไม่ปรากฏที่นี่
        </p>
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
