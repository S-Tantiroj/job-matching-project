import Link from 'next/link'
import { APP_NAME, versionLabel } from '@/lib/version'

// ท้ายหน้าของกลุ่ม (public) — เดิมข้อความชุดนี้ถูกคัดลอกไว้ในสี่หน้า
// (`/`, `/help`, `/terms`, `/privacy`) แก้ที่หนึ่งแล้วอีกสามที่ไม่ตาม
//
// **บรรทัดเวอร์ชันอยู่นอก `<footer>` โดยตั้งใจ** — `@media print` ใน globals.css
// ซ่อน `.pub-footer` ทั้งก้อน เพราะลิงก์นำทางเป็นขยะบนกระดาษ แต่**เลขเวอร์ชัน
// คือสิ่งที่ควรอยู่บนคู่มือฉบับพิมพ์มากที่สุด** — คนที่ถือกระดาษอยู่ต้องรู้ว่า
// มันตรงกับระบบเวอร์ชันไหน ถ้าวางไว้ข้างในจะถูกซ่อนไปด้วยเพราะ `display: none`
// ของแม่กินลูกทั้งหมด
export default function PublicFooter() {
  return (
    <>
      <footer className="pub-footer">
        {APP_NAME} · ระบบสรรหาและประเมินผู้สมัคร
        <br />
        <Link href="/terms">ข้อกำหนดการใช้งาน</Link> ·{' '}
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link> ·{' '}
        <Link href="/help">คู่มือการใช้งาน</Link>
      </footer>
      <p className="pub-version">{versionLabel()}</p>
    </>
  )
}
