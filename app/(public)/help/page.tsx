import UserGuide from '@/components/help/UserGuide'
import { CONTACT_EMAIL } from '@/lib/help/contact'

export const metadata = {
  title: 'คู่มือการใช้งาน — Skouth',
  description: 'คู่มือการใช้งานระบบ Skouth',
}

// หน้านี้แสดงเฉพาะคู่มือผู้ใช้
//
// ตารางทดสอบการยอมรับ (UAT) ถูกเอาออกโดยตั้งใจ — เป็นเอกสารภายในสำหรับการส่งมอบงาน
// ไม่ใช่สิ่งที่ผู้ใช้หรือผู้สนใจควรเห็น เนื้อหายังอยู่ที่ docs/uat/skouth-uat.md
//
// ปุ่มดาวน์โหลด PDF ก็ถูกเอาออกด้วย เพราะไฟล์เดิมมีตาราง UAT อยู่ข้างใน และ
// **ไฟล์ใน public/ ถูกเสิร์ฟสาธารณะเสมอแม้ไม่มีลิงก์ชี้ไป** การซ่อนแค่ปุ่ม
// จึงไม่ได้ซ่อนไฟล์ ต้องเอาไฟล์ออกจาก public/ ด้วย
//
// หน้านี้จึงเป็นคู่มือฉบับเดียว ไม่มีไฟล์ให้ดาวน์โหลด — ผู้ใช้ที่อยากได้ไฟล์
// สั่งพิมพ์เป็น PDF จากเบราว์เซอร์ได้ (@media print ใน globals.css จัดหน้าให้)
// ข้อดีคือไม่มีเนื้อหาสองชุดที่จะค่อยๆ ไม่ตรงกันเมื่อระบบเปลี่ยน
export default function HelpPage() {
  return (
    <main>
      <section className="pub-hero" style={{ padding: '48px 0 16px' }}>
        <h1 style={{ fontSize: 28 }}>คู่มือการใช้งาน</h1>
        <p style={{ marginBottom: 12 }}>วิธีใช้งานแต่ละหน้าในระบบ Skouth</p>
        <p className="guide-print-hint">
          ต้องการเก็บไว้อ่านออฟไลน์? กด <kbd>Ctrl</kbd>+<kbd>P</kbd> (macOS ใช้{' '}
          <kbd>⌘</kbd>+<kbd>P</kbd>) แล้วเลือก “บันทึกเป็น PDF”
        </p>
      </section>

      <section className="pub-section" style={{ paddingTop: 24 }}>
        <UserGuide />
      </section>

      <section className="pub-section" id="contact">
        <h2>ติดต่อเรา</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 0 }}>
          สนใจใช้งานกับทีมของคุณ หรือมีคำถามเกี่ยวกับข้อมูลส่วนบุคคล ติดต่อได้ที่
        </p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="btn">{CONTACT_EMAIL}</a>
      </section>

      <footer className="pub-footer">
        Skouth · ระบบสรรหาและประเมินผู้สมัคร
        <br />
        <a href="/terms">ข้อกำหนดการใช้งาน</a> · <a href="/privacy">นโยบายความเป็นส่วนตัว</a>
      </footer>
    </main>
  )
}
