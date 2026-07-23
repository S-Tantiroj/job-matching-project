import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { scoreCandidateAgainst } from '@/lib/gemini/score'

// POST /api/analyze  body: { candidateId, requirement }
// Returns { score, reasoning, cached }. Cache-first on (candidate, requirement_hash).
// Auth required (spends Gemini quota + reads candidate data).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { candidateId, requirement } = await req.json()
  if (!candidateId || !requirement) {
    return NextResponse.json({ error: 'candidateId and requirement are required' }, { status: 400 })
  }
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
