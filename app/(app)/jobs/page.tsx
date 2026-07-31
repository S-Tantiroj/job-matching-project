import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import CreateJobForm from '@/components/CreateJobForm'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const db = getServerClient()
  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, company, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <main>
      <h1>งาน</h1>
      <CreateJobForm />

      <div className="section-header"><h2>งานทั้งหมด</h2></div>
      {(jobs ?? []).length === 0 ? (
        <p className="faint">ยังไม่มีงาน เพิ่มงานด้านบนได้เลย</p>
      ) : (
        <div className="list">
          {(jobs ?? []).map((j: any) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="list-row" style={{ color: 'inherit' }}>
              <span style={{ fontWeight: 500 }}>{j.title}</span>
              {j.company && <span className="muted">{j.company}</span>}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
