'use client'
import { buildCsvTemplate, CSV_TEMPLATE_FILENAME } from '@/lib/ingest/csvTemplate'

// ปุ่มดาวน์โหลดเทมเพลต CSV
//
// **แยกออกมาเพราะเทมเพลตเป็นของกลาง ไม่ใช่ของเส้นทาง X-ray** — คนที่หาโปรไฟล์
// มาจากที่อื่นก็ต้องใช้คอลัมน์ชุดเดียวกัน ปุ่มจึงอยู่ทั้งบน /import/xray
// และ /import/manual โดยเนื้อไฟล์มาจาก `buildCsvTemplate()` แหล่งเดียว
export default function CsvTemplateButton({ className = 'btn' }: { className?: string }) {
  const download = () => {
    const blob = new Blob([buildCsvTemplate()], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = CSV_TEMPLATE_FILENAME
    a.click()
    URL.revokeObjectURL(href)
  }

  return (
    <button className={className} onClick={download}>
      ดาวน์โหลดเทมเพลต CSV
    </button>
  )
}
