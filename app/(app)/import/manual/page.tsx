import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import ImportForm from '@/components/ImportForm'
import ImportTabs from '@/components/import/ImportTabs'
import CsvTemplateButton from '@/components/CsvTemplateButton'

export const dynamic = 'force-dynamic'

// อัปโหลด CSV ที่มีอยู่แล้ว — ไฟล์ที่ export มาจากที่อื่น หรือที่กรอกเองไว้ก่อนหน้า
// คนที่ยังไม่มีไฟล์ควรไปเส้นทาง "ค้นหาเพิ่มเติม" ซึ่งพาทำตั้งแต่ต้นจนจบในหน้าเดียว
export default async function ManualImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  return (
    <main>
      <h1>อัปโหลดเอง</h1>
      <ImportTabs current="manual" />

      <p className="faint" style={{ fontSize: 13 }}>
        วางไฟล์ CSV ที่มีอยู่แล้ว — ไฟล์ที่ export มาจากบริการอื่น หรือไฟล์ที่กรอกเองไว้
        ยังไม่มีไฟล์? <Link href="/import/xray">ไปเส้นทางค้นหาเพิ่มเติม</Link>{' '}
        ซึ่งพาทำตั้งแต่หาโปรไฟล์จนถึงอัปโหลดในหน้าเดียว
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <CsvTemplateButton />
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        ไม่แน่ใจว่าคอลัมน์ต้องชื่ออะไร ดาวน์โหลดเทมเพลตแล้วดูหัวตารางกับแถวตัวอย่าง
      </p>

      <ImportForm />

      <p className="faint" style={{ fontSize: 13 }}>
        แถวที่ขาดประวัติการทำงานหรือการศึกษาจะเข้า{' '}
        <Link href="/import/pending">คิวรอตรวจ</Link> แทนที่จะเข้าฐานผู้สมัครทันที
      </p>
    </main>
  )
}
