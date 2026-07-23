import { NextResponse } from 'next/server'
import { matchCandidatesForJob } from '@/lib/jobs/match'

// GET /api/jobs/[id]/match → JobMatch[] (vector-ranked candidates).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(await matchCandidatesForJob(id))
}
