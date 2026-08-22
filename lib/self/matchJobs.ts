import { getServerClient } from '@/lib/supabase/server'
import { similarityToScore } from './score'

export type JobFit = {
  id: string
  title: string
  company: string | null
  location: string | null
  score: number // 0–100 vector similarity ในสเปซ 768 มิติร่วมกับ candidates
}

// จัดอันดับงานที่เหมาะกับโปรไฟล์ ใช้ embedding ที่เก็บไว้แล้ว ไม่ embed ใหม่ ไม่เรียก LLM
// เป็นภาพสะท้อนของ matchCandidatesForJob ใน lib/jobs/match.ts แต่กลับทิศ
//
// ownerId เป็นพารามิเตอร์บังคับ ไม่ใช่ทางเลือก — service-role client bypass RLS
// การกรอง owner_id ที่นี่คือกลไกป้องกันตัวจริง
export async function matchJobsForProfile(
  profileId: string,
  ownerId: string,
  matchCount = 20
): Promise<JobFit[]> {
  const db = getServerClient()

  const { data: profile } = await db
    .from('self_profiles')
    .select('embedding')
    .eq('id', profileId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  const rawEmbedding = (profile as any)?.embedding
  if (!rawEmbedding) return []

  // pgvector อาจคืนค่ามาเป็นสตริง JSON แต่ RPC ต้องการ array
  const embedding = typeof rawEmbedding === 'string' ? JSON.parse(rawEmbedding) : rawEmbedding

  const { data: matches, error } = await db.rpc('match_jobs', {
    query_embedding: embedding,
    match_count: matchCount,
  })
  if (error) {
    console.error('match_jobs RPC failed:', error)
    return []
  }

  const sims = new Map<string, number>(
    (matches ?? []).map((m: any) => [m.id, Number(m.similarity)])
  )
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows } = await db
    .from('jobs')
    .select('id, title, company, location')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  return (ids.map((id) => byId.get(id)).filter(Boolean) as any[])
    .map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company ?? null,
      location: j.location ?? null,
      score: similarityToScore(sims.get(j.id) ?? 0),
    }))
    .sort((a, b) => b.score - a.score)
}
