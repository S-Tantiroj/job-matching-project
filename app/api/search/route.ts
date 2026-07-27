import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { searchCandidates } from '@/lib/search/query'

// POST /api/search  body: { semanticQuery, filters }
// Auth required. No LLM — vector + SQL only. This is what chip edits call.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { semanticQuery, filters } = await req.json()
  if (!semanticQuery) {
    return NextResponse.json({ error: 'semanticQuery is required' }, { status: 400 })
  }
  return NextResponse.json(await searchCandidates(semanticQuery, filters ?? {}))
}
