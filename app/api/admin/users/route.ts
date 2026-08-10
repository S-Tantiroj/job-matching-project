import { NextRequest, NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'
import { getSession, hasRole } from '@/lib/auth/session'

// POST /api/admin/users  body: { userId, role: 'admin' | 'data_manager' | 'member' }
// Admin-only. Changes another user's role using the service-role client
// (bypasses RLS) — safe because access is gated on the caller's admin role.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'admin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { userId, role } = await req.json()
  const ROLES = ['admin', 'data_manager', 'member']
  if (!userId || !ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'userId and role (admin|data_manager|member) required' },
      { status: 400 }
    )
  }

  const { error } = await getServerClient().from('profiles').update({ role }).eq('id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
