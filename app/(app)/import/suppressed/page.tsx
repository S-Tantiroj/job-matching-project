import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import SuppressedList, { type SuppressedRow } from '@/components/SuppressedList'

export const dynamic = 'force-dynamic'

export default async function SuppressedPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const { data, error } = await getServerClient()
    .from('suppressed_profiles')
    .select('id, linkedin_url, full_name, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) console.error('suppressed query failed:', error.message)

  const rows: SuppressedRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    linkedin_url: r.linkedin_url,
    full_name: r.full_name ?? null,
    reason: r.reason ?? null,
    created_at: r.created_at ?? '',
  }))

  return (
    <main>
      <h1>รายชื่อระงับ</h1>
      <p className="muted">
        ผู้ที่ขอให้ลบข้อมูล ระบบจะไม่นำเข้าคนเหล่านี้อีกไม่ว่าจะมาจากช่องทางใด
      </p>
      <Link href="/import">← กลับไปหน้านำเข้าข้อมูล</Link>
      <div style={{ marginTop: 12 }}>
        <SuppressedList rows={rows} />
      </div>
    </main>
  )
}
