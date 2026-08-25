import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import PendingReviewTable, { type PendingRow } from '@/components/PendingReviewTable'

export const dynamic = 'force-dynamic'

export default async function PendingPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const { data, error } = await getServerClient()
    .from('pending_candidates')
    .select('id, full_name, headline, linkedin_url, missing, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) console.error('pending query failed:', error.message)

  const rows: PendingRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    headline: r.headline ?? null,
    linkedin_url: r.linkedin_url ?? null,
    missing: r.missing ?? [],
    created_at: r.created_at ?? '',
  }))

  return (
    <main>
      <h1>คิวรอตรวจ</h1>
      <p className="muted">
        ผู้สมัครที่ระบบดึงมาได้แต่ข้อมูลไม่ครบ ตรวจแล้วอนุมัติเข้าระบบหรือปฏิเสธทิ้ง
      </p>
      <Link href="/import">← กลับไปหน้านำเข้าข้อมูล</Link>
      <PendingReviewTable rows={rows} />
    </main>
  )
}
