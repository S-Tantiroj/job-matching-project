import { NextRequest, NextResponse } from 'next/server'
import { scoreCandidateAgainst } from '@/lib/gemini/score'

// POST /api/analyze  body: { candidateId, requirement }
// Returns { score, reasoning, cached }. Cache-first on (candidate, requirement_hash).
export async function POST(req: NextRequest) {
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
