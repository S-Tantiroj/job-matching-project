import { getServerClient } from '@/lib/supabase/server'
import { getSession, hasRole } from '@/lib/auth/session'
import JobForm from '@/components/JobForm'

export const dynamic = 'force-dynamic'

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  // ประตูจริงอยู่ที่ PATCH /api/jobs/[id] — อันนี้กันไม่ให้หน้าเปิดมาเปล่าๆ
  if (!session || !hasRole(session.role, 'data_manager')) {
    return <main><p className="faint">คุณไม่มีสิทธิ์แก้ไขงาน</p></main>
  }

  const db = getServerClient()
  const { data: job, error } = await db
    .from('jobs')
    .select(
      'id, title, company, description, required_skills, min_experience_years, location, category, source'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('edit job page read failed:', error)
    return (
      <main>
        <p style={{ color: 'var(--bad)' }}>โหลดข้อมูลงานไม่สำเร็จ กรุณาลองใหม่</p>
      </main>
    )
  }
  if (!job) return <main><p className="faint">ไม่พบงานนี้</p></main>

  // นับคะแนนที่ cache ไว้เพื่อบอกผู้ใช้ว่าการแก้จะทำให้ต้องคำนวณใหม่กี่รายการ
  const { count, error: countError } = await db
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', id)
  if (countError) console.error('cached score count failed:', countError)

  return (
    <main>
      <h1>แก้ไขงาน</h1>
      <JobForm job={job as any} cachedScoreCount={count ?? 0} />
    </main>
  )
}
