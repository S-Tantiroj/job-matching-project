import Link from 'next/link'
import { IMPORT_TABS, type ImportTabKey } from '@/lib/import/tabs'

// แถบสลับระหว่างสามเส้นทางของการนำเข้าข้อมูล
//
// **เป็น server component โดยตั้งใจ** — แต่ละหน้ารู้ตัวเองอยู่แล้วจึงส่ง `current`
// มาตรงๆ ไม่ต้องพึ่ง `usePathname` และไม่ต้องลาก client boundary ลงมาทั้งแถบ
//
// **แถบนี้ไฮไลต์หน้าปัจจุบัน ต่างจาก sidebar ที่ตัดสินใจไม่ทำ** — sidebar มีสิบรายการ
// ครอบทั้งระบบ คนรู้ว่าตัวเองอยู่ไหนจากเนื้อหาหน้า แต่แท็บสามอันที่หน้าตาคล้ายกัน
// และสลับไปมาระหว่างงานเดียวกัน ถ้าไม่บอกว่าอยู่อันไหนจะงงกว่าไม่มีแถบเลย
export default function ImportTabs({ current }: { current: ImportTabKey }) {
  return (
    <nav className="row" style={{ flexWrap: 'wrap', margin: '12px 0 20px' }} aria-label="เส้นทางการนำเข้าข้อมูล">
      {IMPORT_TABS.map((t) => {
        const active = t.key === current
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`btn${active ? ' btn-primary' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
