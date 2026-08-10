import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import ImportForm from '@/components/ImportForm'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  return (
    <main>
      <h1>นำเข้าข้อมูล LinkedIn (CSV)</h1>
      <p className="muted">อัปโหลดไฟล์ CSV แล้วกดนำเข้า</p>
      <ImportForm />
    </main>
  )
}
