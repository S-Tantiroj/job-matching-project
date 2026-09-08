// กราฟแท่งแนวนอน ใช้ร่วมกันทุกกราฟบน Dashboard
//
// **ไม่เพิ่มไลบรารีกราฟโดยตั้งใจ** แท่งแนวนอนคือ div ที่กำหนดความกว้างเป็นเปอร์เซ็นต์
// การใส่ Chart.js หรือ Recharts เข้ามาเพื่อสิ่งนี้จะเพิ่มขนาด bundle ให้ทุกหน้า
// และบังคับให้ Dashboard กลายเป็น client component ทั้งที่ตอนนี้เป็น server component
// ที่อ่านข้อมูลจากฐานได้ตรงๆ โดยไม่ต้องมี API route คั่นกลาง

export type BarDatum = { label: string; value: number }
export type Bar = BarDatum & { pct: number }

/** แท่งที่มีค่ามากกว่าศูนย์ต้องกว้างอย่างน้อยเท่านี้ ไม่งั้นจะบางจนมองไม่เห็น */
export const MIN_VISIBLE_PCT = 2

// แยกการคำนวณออกจากการเรนเดอร์เพื่อทดสอบเป็น unit ได้ — ชุดเทสต์ของโปรเจกต์นี้
// รันบน environment 'node' ไม่มี jsdom จึงเรนเดอร์ React ไม่ได้
export function toBars(items: BarDatum[]): Bar[] {
  // ค่าติดลบไม่ควรเกิดกับการนับ แต่ถ้าเกิดแล้วปล่อยผ่านจะได้แท่งที่ยื่นออกนอกกรอบ
  // หรือ pct ติดลบซึ่งเบราว์เซอร์ตีความเงียบๆ ไม่เหมือนกันทุกตัว
  const safe = items.map((d) => ({ ...d, value: Math.max(0, d.value) }))
  const max = safe.reduce((m, d) => Math.max(m, d.value), 0)

  return safe.map((d) => ({
    ...d,
    // max เป็น 0 ได้จริงเมื่อยังไม่มีข้อมูลเลย — ต้องไม่หารด้วยศูนย์
    pct: max === 0 || d.value === 0 ? 0 : Math.max(MIN_VISIBLE_PCT, (d.value / max) * 100),
  }))
}

export default function BarList({
  items,
  empty = 'ยังไม่มีข้อมูล',
  unit = '',
}: {
  items: BarDatum[]
  empty?: string
  unit?: string
}) {
  const bars = toBars(items)
  if (!bars.length) return <p className="faint">{empty}</p>

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {bars.map((b) => (
        <div key={b.label}>
          <div className="bar-row">
            <span className="bar-label" title={b.label}>{b.label}</span>
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              {b.value.toLocaleString('th-TH')}
              {unit && ` ${unit}`}
            </span>
          </div>
          <div className="bar-track">
            {/* ความกว้างเป็นค่าที่คำนวณต่อแถว จึงเป็น inline style เดียวที่เหลือ
                — ส่วนที่เหลือย้ายไป globals.css ตามกติกาของโปรเจกต์ */}
            <div className="bar-fill" style={{ width: `${b.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
