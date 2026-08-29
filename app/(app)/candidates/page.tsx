import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import { parsePage, parseSort, parseAsc, PAGE_SIZE } from '@/lib/candidates/listParams'
import { missingFields, buildIssuesOrFilter } from '@/lib/candidates/quality'
import CandidatesTable, { type CandidateRow } from '@/components/CandidatesTable'
import ActivityList from '@/components/ActivityList'
import { listAllActivity } from '@/lib/activity/read'

export const dynamic = 'force-dynamic'

export default async function CandidatesListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string; q?: string; issues?: string }>
}) {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  const sp = await searchParams
  const page = parsePage(sp.page)
  const sort = parseSort(sp.sort)
  const asc = parseAsc(sp.dir)
  const q = (sp.q ?? '').trim()
  const issues = sp.issues === '1'

  const db = getServerClient()

  // ชื่อที่ซ้ำกันทั้งฐาน — ผลลัพธ์เล็กเพราะคืนเฉพาะชื่อที่ซ้ำ
  const { data: dupRows, error: dupError } = await db.rpc('duplicate_candidate_names')
  if (dupError) console.error('duplicate_candidate_names RPC failed:', dupError)
  const duplicateNames: string[] = (dupRows ?? []).map((r: any) => r.full_name)
  const duplicateSet = new Set(duplicateNames)

  let query = db
    .from('candidates')
    .select(
      'id, full_name, headline, location, summary, linkedin_url, professional_email, source, years_experience, updated_at',
      { count: 'exact' }
    )

  // ตัดอักขระพิเศษของ PostgREST filter (, ( ) ") ออกก่อนใส่ในสตริง .or() มิฉะนั้น
  // ชื่อเช่น "Lee, Somchai" จะทำให้ query พังแบบเงียบๆ
  const qSanitized = q.replace(/[,()"]/g, '')
  if (qSanitized) query = query.or(`full_name.ilike.%${qSanitized}%,headline.ilike.%${qSanitized}%`)
  if (issues) query = query.or(buildIssuesOrFilter(duplicateNames))

  const from = (page - 1) * PAGE_SIZE
  const { data, count, error } = await query
    .order(sort, { ascending: asc })
    .range(from, from + PAGE_SIZE - 1)
  if (error) console.error('candidates query failed:', error)

  const pageRows = (data ?? []) as any[]
  const ids = pageRows.map((r) => r.id)

  // ดึงเฉพาะ id ที่ไม่มี embedding ในหน้านี้ — ไม่ดึงคอลัมน์ vector ออกมาทั้งก้อน
  let noEmbedding = new Set<string>()
  if (ids.length) {
    const { data: nulls } = await db
      .from('candidates')
      .select('id')
      .is('embedding', null)
      .in('id', ids)
    noEmbedding = new Set((nulls ?? []).map((r: any) => r.id))
  }

  const rows: CandidateRow[] = pageRows.map((r) => ({
    id: r.id,
    full_name: r.full_name,
    headline: r.headline,
    location: r.location,
    summary: r.summary,
    linkedin_url: r.linkedin_url,
    professional_email: r.professional_email,
    source: r.source,
    years_experience: r.years_experience,
    updated_at: r.updated_at ?? '',
    missing: missingFields({
      headline: r.headline,
      summary: r.summary,
      years_experience: r.years_experience,
      has_embedding: !noEmbedding.has(r.id),
    }),
    duplicate: duplicateSet.has(r.full_name),
  }))

  const total = count ?? 0
  const activity = await listAllActivity(40)

  return (
    <main>
      <h1>ข้อมูลผู้สมัคร</h1>
      <CandidatesTable
        rows={rows}
        page={page}
        totalPages={Math.ceil(total / PAGE_SIZE)}
        total={total}
        sort={sort}
        asc={asc}
        q={q}
        issues={issues}
      />

      <div className="section-header">
        <h2>บันทึกกิจกรรม</h2>
      </div>
      <p className="faint" style={{ marginTop: 0, fontSize: 13 }}>
        การนำเข้า ลบ ระงับ อนุมัติ และแก้ไขข้อมูลของทุกคนในระบบ — บันทึกนี้อยู่รอด
        แม้ผู้สมัครที่อ้างถึงจะถูกลบไปแล้ว
      </p>
      <ActivityList rows={activity} showActor empty="ยังไม่มีการเปลี่ยนแปลงข้อมูล" />
    </main>
  )
}
