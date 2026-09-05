import PrivacyPolicy from '@/components/legal/PrivacyPolicy'

export const metadata = {
  title: 'นโยบายความเป็นส่วนตัว — Skouth',
  description: 'ข้อมูลที่ Skouth เก็บ วิธีใช้ และสิทธิของเจ้าของข้อมูล',
}

export default function PrivacyPage() {
  return (
    <main>
      <section className="pub-hero" style={{ padding: '48px 0 16px' }}>
        <h1 style={{ fontSize: 28 }}>นโยบายความเป็นส่วนตัว</h1>
        <p style={{ marginBottom: 0 }}>เราเก็บข้อมูลอะไร ใช้ทำอะไร และท่านมีสิทธิอะไรบ้าง</p>
      </section>

      <section className="pub-section" style={{ borderTop: 'none', paddingTop: 8 }}>
        <PrivacyPolicy />
      </section>

      <footer className="pub-footer">
        <a href="/terms">ข้อกำหนดการใช้งาน</a> · <a href="/help">คู่มือการใช้งาน</a>
      </footer>
    </main>
  )
}
