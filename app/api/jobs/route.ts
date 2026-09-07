import { NextRequest, NextResponse } from 'next/server'
import { getSession, hasRole } from '@/lib/auth/session'
import { upsertJob } from '@/lib/jobs/upsert'
import type { JobInput } from '@/lib/jobs/normalize'

// POST /api/jobs  body: JobInput. Auth required. Creates (or upserts) a job.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // **เปลี่ยนพฤติกรรมของของเดิม** — เดิมมีแค่ getSession() ใครที่ล็อกอินก็สร้างงานได้
  // ตอนนี้กั้นเท่ากับ PATCH/DELETE ที่ /api/jobs/[id]
  if (!hasRole(session.role, 'data_manager')) {
    return NextResponse.json({ error: 'คุณไม่มีสิทธิ์เพิ่มงาน' }, { status: 403 })
  }

  const body = (await req.json()) as Partial<JobInput>
  if (!body.title || !body.description) {
    return NextResponse.json({ error: 'title and description are required' }, { status: 400 })
  }

  const result = await upsertJob(body as JobInput)
  return NextResponse.json(result)
}
