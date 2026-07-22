import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { analyzeCandidate } from '@/lib/gemini/analyze'
import { requirementHash } from '@/lib/gemini/cache'

// POST /api/analyze  body: { candidateId, requirement }
// Returns { score, reasoning, cached }. Cache-first on (candidate, requirement_hash).
export async function POST(req: NextRequest) {
  const { candidateId, requirement } = await req.json()
  if (!candidateId || !requirement) {
    return NextResponse.json({ error: 'candidateId and requirement are required' }, { status: 400 })
  }

  const db = getServerClient()
  const hash = requirementHash(requirement)

  const { data: cached } = await db
    .from('analyses')
    .select('score,reasoning')
    .eq('candidate_id', candidateId)
    .eq('requirement_hash', hash)
    .maybeSingle()
  if (cached) return NextResponse.json({ ...cached, cached: true })

  const { data: c } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', candidateId)
    .single()
  if (!c) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })

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
  return NextResponse.json({ ...result, cached: false })
}
