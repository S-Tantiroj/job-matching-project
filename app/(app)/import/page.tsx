import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { IMPORT_TABS } from '@/lib/import/tabs'

export const dynamic = 'force-dynamic'

// หน้ารวมของการนำเข้าข้อมูล — อธิบายสามเส้นทางแล้วส่งต่อ
//
// **คิวรอตรวจกับรายชื่อระงับอยู่ที่นี่ ไม่ใช่ในหน้าย่อย** เพราะทั้งสองใช้ร่วมกัน
// ทุกเส้นทาง — คนที่ถูกระงับต้องถูกข้ามไม่ว่าข้อมูลจะเข้ามาทางไหน
// (`upsertCandidate` เช็ครายชื่อระงับเองก่อน embed จึงครอบทุกเส้นทางจริง)
export default async function ImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const db = getServerClient()
  const { count: pendingCount } = await db
    .from('pending_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <main>
      <h1>นำเข้าข้อมูล</h1>
      <p className="faint">เลือกเส้นทางที่ตรงกับสิ่งที่คุณมีอยู่ตอนนี้</p>

      <div className="stack" style={{ gap: 12, margin: '16px 0 24px' }}>
        {IMPORT_TABS.map((t) => (
          <Link key={t.key} href={t.href} className="card" style={{ display: 'block' }}>
            <strong>{t.label}</strong>
            <p className="faint" style={{ fontSize: 13, margin: '4px 0 0' }}>{t.blurb}</p>
          </Link>
        ))}
      </div>

      <div className="section-header"><h2>ใช้ร่วมกันทุกเส้นทาง</h2></div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Link href="/import/pending" className="btn">
          คิวรอตรวจ ({pendingCount ?? 0})
        </Link>
        <Link href="/import/suppressed" className="btn">รายชื่อระงับ</Link>
      </div>
      <p className="faint" style={{ fontSize: 13 }}>
        คนที่อยู่ในรายชื่อระงับจะถูกข้ามไม่ว่าข้อมูลจะเข้ามาทางเส้นทางไหน
      </p>
    </main>
  )
}
