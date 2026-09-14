import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import ImportForm from '@/components/ImportForm'
import ImportTabs from '@/components/import/ImportTabs'
import XraySearchCard from '@/components/XraySearchCard'
import CsvTemplateButton from '@/components/CsvTemplateButton'

export const dynamic = 'force-dynamic'

// ค้นหาเพิ่มเติม — สามขั้นต่อเนื่องในหน้าเดียว
//
// **ช่องอัปโหลดอยู่ที่นี่ด้วย ทั้งที่ /import/manual ก็มี** เป็นการซ้ำที่ตั้งใจ:
// ทั้งสามขั้นเป็นงานเดียวที่ทำต่อกันในรอบเดียว การบังคับให้เปลี่ยนหน้าตอนขั้นสุดท้าย
// คือการตัดงานที่กำลังทำอยู่ออกเป็นสองท่อน ทั้งสองหน้าเรียก `ImportForm`
// ตัวเดียวกัน จึงไม่ใช่โค้ดซ้ำ เป็นแค่ทางเข้าสองทาง
export default async function XrayImportPage() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'data_manager')) redirect('/dashboard')

  return (
    <main>
      <h1>ค้นหาเพิ่มเติม</h1>
      <ImportTabs current="xray" />

      <div className="section-header"><h2>ขั้นที่ 1 — หาโปรไฟล์ด้วย X-ray search</h2></div>
      <XraySearchCard />

      <div className="section-header"><h2>ขั้นที่ 2 — กรอกข้อมูลลงเทมเพลต</h2></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <CsvTemplateButton className="btn btn-primary" />
      </div>
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        เปิดโปรไฟล์ที่หาเจอทีละคน แล้วกรอกลงไฟล์เทมเพลต แถวที่ขาดประวัติการทำงาน
        หรือการศึกษาจะเข้า <Link href="/import/pending">คิวรอตรวจ</Link>{' '}
        แทนที่จะเข้าฐานผู้สมัครทันที
      </p>
      <p className="faint" style={{ fontSize: 13 }}>
        <strong>สองข้อที่ผลการค้นหาของ Google ให้ไม่ครบ ต้องเปิดโปรไฟล์อ่านเอง</strong>
        {' — '}
        <strong>ช่วงเวลาทำงานและปีที่จบ</strong> (เช่น <code>Jan 2022 - Present</code>,
        {' '}<code>2015 - 2019</code>) ไม่กรอกแล้วระบบจะนับประสบการณ์เป็น 0 ปี
        แล้วคนนั้นจะหลุดตัวกรอง &ldquo;ประสบการณ์ขั้นต่ำ&rdquo; ทุกครั้งโดยไม่มีอะไรเตือน
        {' · '}
        และ<strong>ชื่อสถาบันให้กรอกเป็นภาษาอังกฤษ</strong> (Chulalongkorn University
        ไม่ใช่ จุฬาลงกรณ์มหาวิทยาลัย) เพราะระบบค้นหาเทียบข้อความกับตำแหน่งงานที่เป็น
        ภาษาอังกฤษ กรอกไทยแล้วจะจับคู่งานได้แย่ลงโดยไม่มีอาการ
      </p>

      <div className="section-header"><h2>ขั้นที่ 3 — อัปโหลดไฟล์ CSV</h2></div>
      <ImportForm />
    </main>
  )
}
