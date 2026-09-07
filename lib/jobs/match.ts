import { getServerClient } from '@/lib/supabase/server'

export type JobMatch = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100, vector similarity in the shared 768-dim space
}

// Rank candidates for a job by cosine similarity, reusing the match_candidates
// RPC with the job's stored embedding (no new embedding call, no LLM cost).
export async function matchCandidatesForJob(
  jobId: string,
  matchCount = 20
): Promise<JobMatch[]> {
  const db = getServerClient()

  // **ต้องเช็ค error ทุกครั้ง** — เดิมไม่เช็คเลย RPC พังแล้วหน้า job จะขึ้นว่า
  // "ไม่มีผู้สมัครเข้าเกณฑ์" แทนที่จะบอกว่าพัง อาการเดียวกับที่หน้าค้นหาเคยเป็น
  // เมื่อ 2026-09-07 และใช้เวลาไล่หาสาเหตุนาน
  const { data: job, error: jobError } = await db
    .from('jobs')
    .select('embedding')
    .eq('id', jobId)
    .maybeSingle()
  if (jobError) {
    console.error('matchCandidatesForJob job read failed:', jobError)
    throw new Error('job read failed')
  }
  if (!job || !(job as any).embedding) return []

  // pgvector may come back as a JSON string; match_candidates wants an array.
  const raw = (job as any).embedding
  const embedding = typeof raw === 'string' ? JSON.parse(raw) : raw

  const { data: matches, error: rpcError } = await db.rpc('match_candidates', {
    query_embedding: embedding,
    match_count: matchCount,
  })
  if (rpcError) {
    console.error('match_candidates failed:', rpcError)
    throw new Error('job match rpc failed')
  }
  const sims = new Map<string, number>((matches ?? []).map((m: any) => [m.id, m.similarity]))
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows, error: rowsError } = await db
    .from('candidates')
    .select('id, full_name, headline')
    .in('id', ids)
  if (rowsError) {
    console.error('candidates fetch after job ranking failed:', rowsError)
    throw new Error('job match fetch failed')
  }

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  return (ids.map((id) => byId.get(id)).filter(Boolean) as any[])
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      score: Math.max(0, Math.min(100, Math.round((sims.get(c.id) ?? 0) * 100))),
    }))
    .sort((a, b) => b.score - a.score)
}
