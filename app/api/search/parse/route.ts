import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { extractSearchIntent } from '@/lib/search/extractFilters'

// POST /api/search/parse  body: { query }
// Auth required. Calls the LLM once to turn NL into { semanticQuery, filters }.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { query } = await req.json()
  if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 })

  return NextResponse.json(await extractSearchIntent(query))
}
