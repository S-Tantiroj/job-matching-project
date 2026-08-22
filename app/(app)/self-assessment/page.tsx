import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { matchJobsForProfile } from '@/lib/self/matchJobs'
import type { Assessment } from '@/lib/self/assessmentShape'
import ScoreBadge from '@/components/ScoreBadge'
import SelfAssessmentUpload from '@/components/SelfAssessmentUpload'
import RoleScorePanel from '@/components/RoleScorePanel'

export const dynamic = 'force-dynamic'

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="faint" style={{ fontSize: 12, marginBottom: 4 }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  )
}

export default async function SelfAssessmentPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const db = getServerClient()
  const { data: profile, error } = await db
    .from('self_profiles')
    .select('id, file_name, parsed_data, assessment, created_at')
    .eq('owner_id', session.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // A query failure (e.g. migration 011 not yet applied) renders the same
  // empty state below by design — no raw error reaches the browser — but we
  // log server-side so it's not indistinguishable from a genuine empty state.
  if (error) console.error('self_profiles query failed:', error)

  if (!profile) {
    return (
      <main>
        <h1>ประเมินตัวเอง</h1>
        <p className="muted">
          อัปโหลด resume เป็นไฟล์ PDF แล้ว AI จะช่วยวิเคราะห์จุดแข็ง จุดอ่อน
          สิ่งที่ควรพัฒนา และงานในระบบที่เหมาะกับคุณ (ไฟล์เป็นภาษาไทยหรืออังกฤษก็ได้)
        </p>
        <p className="faint" style={{ fontSize: 13 }}>
          ข้อมูลนี้เป็นของคุณคนเดียว ผู้ดูแลระบบและผู้ใช้คนอื่นมองไม่เห็น
          และจะไม่ถูกนำไปรวมกับฐานข้อมูลผู้สมัคร
        </p>
        <SelfAssessmentUpload label="อัปโหลดและวิเคราะห์" />
      </main>
    )
  }

  const p = profile as any
  const parsed = p.parsed_data ?? {}
  const assessment: Assessment | null = p.assessment ?? null
  const skills: string[] = Array.isArray(parsed.skills) ? parsed.skills : []
  const jobs = await matchJobsForProfile(p.id, session.userId)

  return (
    <main>
      <h1>ประเมินตัวเอง</h1>

      <div className="card">
        <h2>{parsed.full_name ?? 'โปรไฟล์ของคุณ'}</h2>
        {parsed.headline && <p className="muted" style={{ margin: '2px 0' }}>{parsed.headline}</p>}
        {parsed.location && (
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>{parsed.location}</p>
        )}
        {parsed.summary && <p style={{ marginTop: 10 }}>{parsed.summary}</p>}
        {skills.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
            {skills.map((s, i) => <span key={`${s}-${i}`} className="chip">{s}</span>)}
          </div>
        )}
        {p.file_name && (
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            จากไฟล์: {p.file_name}
          </p>
        )}
      </div>

      {assessment && (
        <>
          <div className="section-header"><h2>บทวิเคราะห์</h2></div>
          <div className="card">
            {assessment.summary && <p style={{ marginTop: 0 }}>{assessment.summary}</p>}
            <Bullets title="จุดแข็ง" items={assessment.strengths} />
            <Bullets title="จุดที่ยังขาด" items={assessment.weaknesses} />
            <Bullets title="สิ่งที่ควรพัฒนา" items={assessment.development} />
          </div>
        </>
      )}

      <div className="section-header"><h2>งานที่เหมาะกับคุณ</h2></div>
      {jobs.length === 0 ? (
        <p className="faint">ยังไม่มีงานในระบบที่เข้าเกณฑ์</p>
      ) : (
        <div className="stack">
          {jobs.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="result-row" style={{ color: 'inherit' }}>
              <ScoreBadge score={j.score} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{j.title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {[j.company, j.location].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span className="faint">›</span>
            </Link>
          ))}
        </div>
      )}

      <div className="section-header"><h2>ประเมินเพิ่มเติม</h2></div>
      <RoleScorePanel profileId={p.id} />

      <div className="section-header"><h2>อัปโหลดใหม่</h2></div>
      <SelfAssessmentUpload label="อัปโหลดไฟล์ใหม่" />
    </main>
  )
}
