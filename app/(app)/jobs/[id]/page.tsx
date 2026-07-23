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

  if (!j) return <main><p>ไม่พบงานนี้</p></main>

  const skills: string[] = (j as any).required_skills ?? []

  return (
    <main>
      <h1>{(j as any).title}</h1>
      {(j as any).company && <p style={{ color: '#666' }}>{(j as any).company}</p>}
      {(j as any).location && <p style={{ color: '#888' }}>{(j as any).location}</p>}
      {(j as any).min_experience_years != null && (
        <p style={{ color: '#888' }}>ประสบการณ์ขั้นต่ำ {(j as any).min_experience_years} ปี</p>
      )}
      {skills.length > 0 && (
        <div style={{ margin: '12px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {skills.map((s) => (
            <span key={s} style={{ background: '#eef2ff', color: '#3730a3', padding: '2px 10px', borderRadius: 999, fontSize: 13 }}>
              {s}
            </span>
          ))}
        </div>
      )}
      {(j as any).description && <p>{(j as any).description}</p>}

      <h2>ผู้สมัครที่เข้าเกณฑ์</h2>
      <JobMatches jobId={id} />
    </main>
  )
}
