import { GUIDE_SECTIONS } from '@/lib/help/guide'

// คู่มือบนเว็บ — เนื้อหาอยู่ที่ lib/help/guide.ts ไม่ได้อยู่ในไฟล์นี้
//
// นี่คือคู่มือฉบับเดียวที่ผู้ใช้มี ไม่มีไฟล์ PDF ให้ดาวน์โหลดแล้ว ผู้ที่อยากได้ไฟล์
// สั่งพิมพ์เป็น PDF จากเบราว์เซอร์ได้ — @media print ใน globals.css ซ่อนสารบัญ
// กับแถบนำทาง และกัน section ไม่ให้ถูกตัดคร่อมหน้า
export default function UserGuide() {
  return (
    <div className="guide-layout">
      <nav className="guide-toc" aria-label="สารบัญคู่มือ">
        <div className="guide-toc-title">สารบัญ</div>
        {GUIDE_SECTIONS.map((s, i) => (
          <a key={s.id} href={`#${s.id}`}>
            <span className="guide-num">{i + 1}</span>
            {s.title}
          </a>
        ))}
      </nav>

      <div>
        {GUIDE_SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className="guide-block">
            <h3>
              <span className="guide-num">{i + 1}.</span>
              {s.title}
            </h3>
            <ol>
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  )
}
