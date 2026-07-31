import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getSession()
  if (session) redirect('/dashboard')

  return (
    <main className="auth-wrap" style={{ textAlign: 'center' }}>
      <h1 style={{ marginBottom: 8 }}>Skouth</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        ค้นหาและประเมินผู้สมัครคนไทยด้วยการค้นหาแบบภาษาธรรมชาติและ AI
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
        <Link href="/signup" className="btn">สมัครสมาชิก</Link>
      </div>
    </main>
  )
}
