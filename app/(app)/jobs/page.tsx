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

      <h2>งานทั้งหมด</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(jobs ?? []).map((j: any) => (
          <li key={j.id} style={{ padding: '8px 0', borderBottom: '1px solid #f2f2f2' }}>
            <Link href={`/jobs/${j.id}`} style={{ fontWeight: 600 }}>
              {j.title}
            </Link>
            {j.company && <span style={{ color: '#888', marginLeft: 8 }}>{j.company}</span>}
          </li>
        ))}
      </ul>
      {(jobs ?? []).length === 0 && <p style={{ color: '#888' }}>ยังไม่มีงาน เพิ่มงานด้านบนได้เลย</p>}
    </main>
  )
}
