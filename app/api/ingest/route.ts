import { NextRequest, NextResponse } from 'next/server'
import { parseCsv } from '@/lib/ingest/csv'
import { parseLinkedInCsv } from '@/lib/ingest/linkedin'
import { parseResume } from '@/lib/gemini/parse'
import { upsertCandidate } from '@/lib/ingest/upsert'
import { getSession } from '@/lib/auth/session'
import type { CandidateInput } from '@/lib/ingest/normalize'

// POST /api/ingest
//   { type: 'csv',      csv: string, mapping: Record<string,string> }
//   { type: 'linkedin', csv: string }
//   { type: 'upload',   text: string }
// Returns { imported, updated, errors }. Requires an authenticated session.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const userId = session.userId

  const body = await req.json()
  let inputs: CandidateInput[] = []
  if (body.type === 'csv') {
    inputs = parseCsv(body.csv, body.mapping)
  } else if (body.type === 'linkedin') {
    inputs = parseLinkedInCsv(body.csv)
  } else if (body.type === 'upload') {
    inputs = [await parseResume(body.text)]
  } else {
    return NextResponse.json({ error: 'type must be "csv", "linkedin", or "upload"' }, { status: 400 })
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
