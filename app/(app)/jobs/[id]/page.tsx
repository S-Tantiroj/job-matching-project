import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { getSession, hasRole } from '@/lib/auth/session'
import JobMatches from '@/components/JobMatches'
import DeleteJobButton from '@/components/DeleteJobButton'

export const dynamic = 'force-dynamic'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()
  const { data: j, error } = await db
    .from('jobs')
    .select('title, company, location, min_experience_years, required_skills, description, source')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('job page read failed:', error)
    return (
      <main>
        <p style={{ color: 'var(--bad)' }}>โหลดข้อมูลงานไม่สำเร็จ กรุณาลองใหม่</p>
      </main>
    )
  }
  if (!j) return <main><p className="faint">ไม่พบงานนี้</p></main>

  const session = await getSession()
  // ซ่อนปุ่มจาก member เป็นความสะอาดของหน้าจอ ไม่ใช่ความปลอดภัย
  // ประตูจริงอยู่ที่ PATCH/DELETE /api/jobs/[id]
  const canEdit = !!session && hasRole(session.role, 'data_manager')

  const skills: string[] = (j as any).required_skills ?? []

  return (
    <main>
      <div className="card">
        <h1 style={{ margin: 0 }}>{(j as any).title}</h1>
        {(j as any).company && <p className="muted" style={{ margin: '2px 0' }}>{(j as any).company}</p>}
        {(j as any).location && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{(j as any).location}</p>}
        {(j as any).min_experience_years != null && (
          <p className="faint" style={{ fontSize: 13 }}>ประสบการณ์ขั้นต่ำ {(j as any).min_experience_years} ปี</p>
        )}
        {skills.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
            {skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        )}
        {(j as any).description && <p>{(j as any).description}</p>}
        {canEdit && (
          <div className="row" style={{ marginTop: 14 }}>
            <Link href={`/jobs/${id}/edit`} className="btn">แก้ไข</Link>
            <DeleteJobButton
              jobId={id}
              title={(j as any).title}
              seeded={(j as any).source === 'synthetic'}
            />
          </div>
        )}
      </div>

      <div className="section-header"><h2>ผู้สมัครที่เข้าเกณฑ์</h2></div>
      <JobMatches jobId={id} />
    </main>
  )
}
