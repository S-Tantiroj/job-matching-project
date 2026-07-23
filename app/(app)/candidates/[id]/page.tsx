import { getServerClient } from '@/lib/supabase/server'
import Timeline from '@/components/Timeline'
import AnalyzePanel from '@/components/AnalyzePanel'
import AddToShortlist from '@/components/AddToShortlist'

export const dynamic = 'force-dynamic'

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()

  const { data: c } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', id)
    .single()

  if (!c) return <main><p>ไม่พบผู้สมัคร</p></main>

  const skills: string[] = (c as any).candidate_skills?.map((x: any) => x.skills?.name).filter(Boolean) ?? []

  return (
    <main>
      <h1>{(c as any).full_name}</h1>
      <p style={{ color: '#666' }}>{(c as any).headline}</p>
      {(c as any).location && <p style={{ color: '#888' }}>{(c as any).location}</p>}
      {(c as any).summary && <p>{(c as any).summary}</p>}

      {skills.length > 0 && (
        <div style={{ margin: '12px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {skills.map((s) => (
            <span
              key={s}
              style={{ background: '#eef2ff', color: '#3730a3', padding: '2px 10px', borderRadius: 999, fontSize: 13 }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <h2>ไทม์ไลน์</h2>
      <Timeline edu={(c as any).education} exp={(c as any).experience} />

      <AnalyzePanel candidateId={id} />
      <AddToShortlist candidateId={id} />
    </main>
  )
}
