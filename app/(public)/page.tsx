import Link from 'next/link'
import { PRIMARY_CTA } from '@/lib/public/cta'

export const metadata = {
  title: 'Skouth — ค้นหาคนไทยที่จบจากต่างประเทศ',
  description: 'ค้นหาและประเมินผู้สมัครด้วยภาษาธรรมชาติและ AI',
}

const PAINS = [
  'คนเก่งที่จบจากต่างประเทศกระจายอยู่หลายแพลตฟอร์ม ไม่มีที่รวม',
  'การค้นด้วยคีย์เวิร์ดพลาดคนที่ใช่ เพราะแต่ละคนเขียนโปรไฟล์ด้วยคำคนละแบบ',
  'อ่านโปรไฟล์ทีละคนเพื่อคัดกรองไม่ไหว เมื่อผู้สมัครมีหลักร้อย',
]

const FEATURES = [
  {
    title: 'ค้นหาด้วยภาษาธรรมชาติ',
    body: 'พิมพ์สิ่งที่ต้องการเป็นประโยคภาษาไทย ระบบแปลงเป็นเงื่อนไขแล้วจัดอันดับด้วยความหมาย ไม่ใช่การจับคำตรงตัว',
  },
  {
    title: 'คะแนนพร้อมเหตุผล',
    body: 'ให้คะแนนความเหมาะสม 0–100 พร้อมคำอธิบายเป็นภาษาไทยว่าทำไมถึงได้คะแนนเท่านั้น',
  },
  {
    title: 'จับคู่กับตำแหน่งงาน',
    body: 'สร้างตำแหน่งงานแล้วให้ระบบเรียงผู้สมัครที่เหมาะที่สุดให้ โดยไม่ต้องค้นหาใหม่ทีละครั้ง',
  },
  {
    title: 'อัปเดตข้อมูลอัตโนมัติ',
    body: 'ดึงโปรไฟล์ใหม่ทุกคืน คัดกรองอัตโนมัติ และให้คนตรวจอนุมัติก่อนเข้าฐานข้อมูลจริง',
  },
]

export default function LandingPage() {
  return (
    <main>
      <section className="pub-hero">
        <h1>หาคนไทยที่จบจากต่างประเทศ ด้วยประโยคเดียว</h1>
        <p>พิมพ์สิ่งที่ต้องการเป็นภาษาไทย ระบบเข้าใจและจัดอันดับผู้สมัครให้</p>

        {/* ภาพนิ่ง ไม่ใช่ input ที่กดได้ — กดแล้วต้องล็อกอินอยู่ดี
            แถบนี้อธิบายผลิตภัณฑ์ได้ในบรรทัดเดียวโดยไม่ต้องบรรยาย */}
        <div className="pub-fakebar" aria-hidden="true">
          <span className="faint">ค้นหา</span>
          <span>หา Data Scientist จบปริญญาโทจากอเมริกา ประสบการณ์ 5 ปีขึ้นไป</span>
        </div>

        <Link href={PRIMARY_CTA.href} className="btn btn-primary">{PRIMARY_CTA.label}</Link>
      </section>

      <section className="pub-section">
        <h2>ทำไมการหาคนกลุ่มนี้ถึงยาก</h2>
        <div className="pub-grid">
          {PAINS.map((p) => (
            <div key={p} className="pub-card"><p>{p}</p></div>
          ))}
        </div>
      </section>

      <section className="pub-section" id="features">
        <h2>ระบบทำอะไรได้บ้าง</h2>
        <div className="pub-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="pub-card">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pub-section">
        <h2>ออกแบบมาให้เคารพ PDPA</h2>
        <div className="pub-note">
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75 }}>
            เมื่อเจ้าของข้อมูลขอให้ลบ ระบบบันทึกไว้ถาวรและไม่นำเข้าคนนั้นอีก แม้รอบเก็บข้อมูล
            ครั้งถัดไปจะเจอโปรไฟล์เดิม · ทุกการเพิ่ม แก้ไข และลบถูกบันทึกว่าใครทำเมื่อไร ·
            ข้อมูลที่ผู้ใช้อัปโหลดเองเพื่อประเมินตัวเองเก็บแยกคนละตาราง เข้าไม่ถึงการค้นหาของผู้สรรหา
          </p>
        </div>
      </section>

      <footer className="pub-footer">
        Skouth · ระบบสรรหาและประเมินผู้สมัคร
        <br />
        <Link href="/terms">ข้อกำหนดการใช้งาน</Link> ·{' '}
        <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link> ·{' '}
        <Link href="/help">คู่มือการใช้งาน</Link>
      </footer>
    </main>
  )
}
