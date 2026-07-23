import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { matchCandidatesForJob } from '@/lib/jobs/match'

// GET /api/jobs/[id]/match → JobMatch[] (vector-ranked candidates). Auth required.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  return NextResponse.json(await matchCandidatesForJob(id))
}
