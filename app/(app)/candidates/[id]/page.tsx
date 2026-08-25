import { getServerClient } from '@/lib/supabase/server'
import { getSession, hasRole } from '@/lib/auth/session'
import Timeline from '@/components/Timeline'
import AnalyzePanel from '@/components/AnalyzePanel'
import AddToShortlist from '@/components/AddToShortlist'
import SuppressButton from '@/components/SuppressButton'

export const dynamic = 'force-dynamic'

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()

  const session = await getSession()
  const canSuppress = !!session && hasRole(session.role, 'data_manager')

  const { data: c } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', id)
    .single()

  if (!c) return <main><p className="faint">ไม่พบผู้สมัคร</p></main>

  const skills: string[] = (c as any).candidate_skills?.map((x: any) => x.skills?.name).filter(Boolean) ?? []

  return (
    <main>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="avatar" style={{ width: 44, height: 44 }}>{initials((c as any).full_name)}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>{(c as any).full_name}</h1>
            <p className="muted" style={{ margin: '2px 0' }}>{(c as any).headline}</p>
            {(c as any).location && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{(c as any).location}</p>}
          </div>
          {(c as any).linkedin_url && (
            <a href={(c as any).linkedin_url} target="_blank" rel="noreferrer" className="btn">LinkedIn ↗</a>
          )}
        </div>
        {(c as any).summary && <p style={{ marginTop: 12 }}>{(c as any).summary}</p>}
        {skills.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
            {skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        )}
      </div>

      <div className="section-header"><h2>ไทม์ไลน์</h2></div>
      <div className="card">
        <Timeline edu={(c as any).education} exp={(c as any).experience} />
      </div>

      <AnalyzePanel candidateId={id} />
      <AddToShortlist candidateId={id} />

      {canSuppress && (
        <>
          <div className="section-header"><h2>จัดการข้อมูล</h2></div>
          <div className="card">
            <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
              ใช้เมื่อเจ้าของข้อมูลขอให้ลบ ระบบจะจำไว้และไม่นำเข้าคนนี้อีก
            </p>
            <SuppressButton candidateId={id} fullName={(c as any).full_name} />
          </div>
        </>
      )}
    </main>
  )
}
