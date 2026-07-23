import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { scoreCandidateAgainst } from '@/lib/gemini/score'
import { buildJobRequirementText } from '@/lib/jobs/normalize'

// POST /api/jobs/[id]/analyze  body: { candidateId }
// Deep LLM fit score of a candidate against this job (Thai reasoning), cached.
// Auth required (spends Gemini quota + reads candidate data).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const { candidateId } = await req.json()
  if (!candidateId) {
    return NextResponse.json({ error: 'candidateId is required' }, { status: 400 })
  }

  const db = getServerClient()
  const { data: job } = await db
    .from('jobs')
    .select('title, company, description, required_skills, min_experience_years, location, category')
    .eq('id', id)
    .single()
  if (!job) return NextResponse.json({ error: 'job not found' }, { status: 404 })

  const requirement = buildJobRequirementText(job as any)
  try {
    const result = await scoreCandidateAgainst(candidateId, requirement)
    return NextResponse.json(result)
  } catch (e: any) {
    if (e?.message === 'candidate not found') {
      return NextResponse.json({ error: 'candidate not found' }, { status: 404 })
    }
    throw e
  }
}
