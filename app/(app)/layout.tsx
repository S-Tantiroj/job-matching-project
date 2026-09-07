import AppShell from '@/components/nav/AppShell'
import { getSession, hasRole } from '@/lib/auth/session'

// ยังเป็น server component — getSession() ต้องอ่าน cookie ฝั่งเซิร์ฟเวอร์
// ส่งเข้า AppShell แค่ boolean สองตัวซึ่ง serialize ข้าม boundary ได้
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  return (
    <AppShell
      isAdmin={!!session && hasRole(session.role, 'admin')}
      isDataManager={!!session && hasRole(session.role, 'data_manager')}
    >
      {children}
    </AppShell>
  )
}
