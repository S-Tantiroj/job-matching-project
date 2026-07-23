import { getServerClient } from '@/lib/supabase/server'
import { analyzeCandidate } from './analyze'
import { requirementHash } from './cache'

// Cache-first deep score of a candidate against a free-text requirement. Shared
// by /api/analyze (search) and /api/jobs/[id]/analyze (job matching) so both
// reuse the same analyses cache keyed by (candidate_id, requirement_hash).
export async function scoreCandidateAgainst(
  candidateId: string,
  requirement: string
): Promise<{ score: number; reasoning: string; cached: boolean }> {
  const db = getServerClient()
  const hash = requirementHash(requirement)

  const { data: cached } = await db
    .from('analyses')
    .select('score,reasoning')
    .eq('candidate_id', candidateId)
    .eq('requirement_hash', hash)
    .maybeSingle()
  if (cached) {
    return { score: (cached as any).score, reasoning: (cached as any).reasoning, cached: true }
  }

  const { data: c } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', candidateId)
    .single()
  if (!c) throw new Error('candidate not found')

  const profile = {
    full_name: (c as any).full_name,
    headline: (c as any).headline,
    summary: (c as any).summary,
    source: (c as any).source,
    education: (c as any).education,
    experience: (c as any).experience,
    skills: (c as any).candidate_skills?.map((x: any) => x.skills.name),
  }

  const result = await analyzeCandidate(profile as any, requirement)
  await db.from('analyses').insert({
    candidate_id: candidateId,
    requirement_text: requirement,
    requirement_hash: hash,
    score: result.score,
    reasoning: result.reasoning,
  })
  return { ...result, cached: false }
}
