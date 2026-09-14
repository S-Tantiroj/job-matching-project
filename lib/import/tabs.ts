// สามเส้นทางของการนำเข้าข้อมูล — แหล่งเดียวของรายการแท็บบนหน้า /import
//
// **ไม่เอาเข้า `NAV_ITEMS`** โดยตั้งใจ — หน้าย่อยพวกนี้ไม่ควรอยู่ใน sidebar
// เพราะจะทำให้เมนูหลักรกด้วยรายการที่ใช้เฉพาะตอนกำลังนำเข้าข้อมูล
// `pageTitle` ใน navItems.ts เทียบด้วย `startsWith(href + '/')` อยู่แล้ว
// ทุกหน้าย่อยจึงขึ้นชื่อ "Import" บนแถบบนเองโดยไม่ต้องลงทะเบียนอะไรเพิ่ม
//
// และ `matcher` ใน middleware.ts มี `/import/:path*` อยู่แล้ว การเพิ่มหน้าย่อย
// จึงถูกกันการเข้าถึงโดยอัตโนมัติ — **ตราบใดที่ href ยังขึ้นต้นด้วย `/import/`**
// ซึ่งมีเทสต์ดักไว้ เพราะพิมพ์ผิดตัวเดียวหน้านั้นจะเปิดได้โดยไม่ล็อกอินแบบเงียบๆ

export type ImportTabKey = 'manual' | 'xray' | 'auto'

export type ImportTab = {
  key: ImportTabKey
  href: string
  label: string
  /** คำอธิบายหนึ่งบรรทัด ใช้บนการ์ดของหน้ารวม */
  blurb: string
}

export const IMPORT_TABS: ImportTab[] = [
  {
    key: 'manual',
    href: '/import/manual',
    label: 'อัปโหลดเอง',
    blurb: 'มีไฟล์ CSV อยู่แล้ว วางไฟล์แล้วนำเข้าได้ทันที',
  },
  {
    key: 'xray',
    href: '/import/xray',
    label: 'ค้นหาเพิ่มเติม',
    blurb: 'หาโปรไฟล์สาธารณะด้วย Google แล้วกรอกลงเทมเพลตเอง',
  },
  {
    key: 'auto',
    href: '/import/auto',
    label: 'ดึงอัตโนมัติ',
    blurb: 'สถานะการดึงข้อมูลตามตารางเวลา และประวัติการรัน',
  },
]
