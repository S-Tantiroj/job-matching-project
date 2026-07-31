import { getServerClient } from '@/lib/supabase/server'
import JobMatches from '@/components/JobMatches'

export const dynamic = 'force-dynamic'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()
  const { data: j } = await db
    .from('jobs')
    .select('title, company, location, min_experience_years, required_skills, description')
    .eq('id', id)
    .single()

  if (!j) return <main><p className="faint">ไม่พบงานนี้</p></main>

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
      </div>

      <div className="section-header"><h2>ผู้สมัครที่เข้าเกณฑ์</h2></div>
      <JobMatches jobId={id} />
    </main>
  )
}
