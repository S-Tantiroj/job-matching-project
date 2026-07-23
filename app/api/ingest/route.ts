import { NextRequest, NextResponse } from 'next/server'
import { parseCsv } from '@/lib/ingest/csv'
import { parseResume } from '@/lib/gemini/parse'
import { upsertCandidate } from '@/lib/ingest/upsert'
import type { CandidateInput } from '@/lib/ingest/normalize'

// POST /api/ingest
//   { type: 'csv',    csv: string, mapping: Record<string,string>, userId?: string }
//   { type: 'upload', text: string, userId?: string }
// Returns { imported, updated }. NOTE: userId is temporary — Task 10 replaces it
// with the authenticated session.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const userId: string | null = body.userId ?? null

  let inputs: CandidateInput[] = []
  if (body.type === 'csv') {
    inputs = parseCsv(body.csv, body.mapping)
  } else if (body.type === 'upload') {
    inputs = [await parseResume(body.text)]
  } else {
    return NextResponse.json({ error: 'type must be "csv" or "upload"' }, { status: 400 })
  }

  let imported = 0
  let updated = 0
  const errors: string[] = []
  for (const input of inputs) {
    try {
      const r = await upsertCandidate(input, userId)
      r.updated ? updated++ : imported++
    } catch (e: any) {
      errors.push(`${input.full_name}: ${e?.message ?? e}`)
    }
  }

  return NextResponse.json({ imported, updated, errors })
}
