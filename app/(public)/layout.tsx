import Link from 'next/link'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// nav เบาสำหรับหน้าที่คนยังไม่ล็อกอินก็เข้าได้
//
// ปุ่มขวาสลับตาม session เพราะเจ้าของระบบต้องดูหน้าแนะนำของตัวเองได้โดยไม่ต้อง
// ออกจากระบบ — พฤติกรรมเดิมของ app/page.tsx คือ redirect ไป /dashboard ทันที
// ซึ่งทำให้ดูหน้าแรกไม่ได้เลย
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <div>
      <nav className="pub-nav">
        <Link href="/" className="pub-nav-brand">Skouth</Link>
        <Link href="/#features" className="pub-nav-link">ฟีเจอร์</Link>
        <Link href="/help" className="pub-nav-link">คู่มือ</Link>
        <div className="pub-nav-right">
          {session ? (
            <Link href="/dashboard" className="btn btn-primary">ไปที่ Dashboard</Link>
          ) : (
            <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
          )}
        </div>
      </nav>
      <div className="pub-wrap">{children}</div>
    </div>
  )
}
