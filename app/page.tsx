import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Already signed in → go straight to the app.
  const session = await getSession()
  if (session) redirect('/dashboard')

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ marginBottom: 8 }}>Thai Candidate Sourcing</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        ค้นหาและประเมินผู้สมัครคนไทยที่จบจากต่างประเทศ ด้วยการค้นหาแบบภาษาธรรมชาติและ AI
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Link
          href="/login"
          style={{
            background: '#2563eb',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          เข้าสู่ระบบ
        </Link>
        <Link
          href="/signup"
          style={{
            border: '1px solid #2563eb',
            color: '#2563eb',
            padding: '10px 24px',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          สมัครสมาชิก
        </Link>
      </div>
    </main>
  )
}
