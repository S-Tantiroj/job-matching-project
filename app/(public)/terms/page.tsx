import TermsOfUse from '@/components/legal/TermsOfUse'

export const metadata = {
  title: 'ข้อกำหนดการใช้งาน — Skouth',
  description: 'กติกาการใช้งานระบบ Skouth สิ่งที่ห้ามทำ และข้อจำกัดความรับผิด',
}

export default function TermsPage() {
  return (
    <main>
      <section className="pub-hero" style={{ padding: '48px 0 16px' }}>
        <h1 style={{ fontSize: 28 }}>ข้อกำหนดการใช้งาน</h1>
        <p style={{ marginBottom: 0 }}>กติกาสำหรับผู้ที่ใช้งานระบบ Skouth</p>
      </section>

      <section className="pub-section" style={{ borderTop: 'none', paddingTop: 8 }}>
        <TermsOfUse />
      </section>

      <footer className="pub-footer">
        <a href="/privacy">นโยบายความเป็นส่วนตัว</a> · <a href="/help">คู่มือการใช้งาน</a>
      </footer>
    </main>
  )
}
