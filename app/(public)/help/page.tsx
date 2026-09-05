import UserGuide from '@/components/help/UserGuide'
import UatTable from '@/components/help/UatTable'
import { UAT_DOC } from '@/lib/help/docMeta'
import { CONTACT_EMAIL } from '@/lib/help/contact'

export const metadata = {
  title: 'คู่มือการใช้งาน — Skouth',
  description: 'คู่มือผู้ใช้และเอกสารทดสอบการยอมรับระบบ Skouth',
}

export default function HelpPage() {
  return (
    <main>
      <section className="pub-hero" style={{ padding: '48px 0 24px' }}>
        <h1 style={{ fontSize: 28 }}>คู่มือการใช้งาน</h1>
        <p style={{ marginBottom: 0 }}>อ่านบนหน้านี้ได้เลย หรือดาวน์โหลดเป็นไฟล์ PDF ไปใช้</p>
      </section>

      <div className="pub-card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h3>เอกสารคู่มือและแบบทดสอบการยอมรับ</h3>
          <p>เวอร์ชัน {UAT_DOC.version} · ปรับปรุง {UAT_DOC.updatedAt}</p>
        </div>
        {/* ไม่ฝัง iframe PDF — บนเบราว์เซอร์มือถือหลายตัวแสดงไม่ได้หรือดาวน์โหลดทับ
            และเนื้อหาซ้ำกับที่อยู่บนหน้านี้อยู่แล้ว */}
        <a href={UAT_DOC.path} download className="btn btn-primary">ดาวน์โหลด PDF</a>
        <a href={UAT_DOC.path} target="_blank" rel="noreferrer" className="btn">เปิดในแท็บใหม่</a>
      </div>

      <UserGuide />
      <UatTable />

      <section className="pub-section" id="contact">
        <h2>ติดต่อเรา</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 0 }}>
          สนใจใช้งานกับทีมของคุณ หรือมีคำถามเกี่ยวกับข้อมูลส่วนบุคคล ติดต่อได้ที่
        </p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="btn">{CONTACT_EMAIL}</a>
      </section>

      <footer className="pub-footer">Skouth · ระบบสรรหาและประเมินผู้สมัคร</footer>
    </main>
  )
}
