import { NextRequest, NextResponse } from 'next/server'
import { searchCandidates } from '@/lib/search/query'

// POST /api/search  body: { query, filters?: { foreignEduOnly?, skill? } }
// Returns scored candidates sorted by match score (descending).
export async function POST(req: NextRequest) {
  const { query, filters } = await req.json()
  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }
  return NextResponse.json(await searchCandidates(query, filters ?? {}))
}
