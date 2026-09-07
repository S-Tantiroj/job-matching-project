import type { ChipFilters } from './extractFilters'

// สรุปตัวกรองที่ใช้อยู่เป็นข้อความสั้นๆ สำหรับหัวการ์ดตอนที่แผงถูกพับเก็บ
//
// **นี่ไม่ใช่ของประดับ** — ตัวกรองที่ทำงานอยู่แต่มองไม่เห็นคือสาเหตุที่ผู้ใช้จะเจอ
// ผลลัพธ์น้อยผิดปกติแล้วหาไม่เจอว่าทำไม (เป็นปัญหาเดียวกับที่ชิปของ AI สะสมข้าม
// คำค้นหา ดู lib/search/mergeFilters.ts) พับแผงได้ก็ต่อเมื่อหัวการ์ดยังบอกได้ว่า
// อะไรกำลังกรองอยู่

export function countActiveFilters(f: ChipFilters): number {
  return (
    (f.skills?.length ?? 0) +
    (f.fieldOrDegree?.length ?? 0) +
    (f.minYears != null ? 1 : 0)
  )
}

export function describeFilters(f: ChipFilters): string {
  const parts: string[] = []
  // เรียงตามลำดับเดียวกับที่แสดงใน FilterChips และ CoverageStrip
  if (f.skills?.length) parts.push(`สกิล: ${f.skills.join(', ')}`)
  if (f.fieldOrDegree?.length) parts.push(`สาขา/ปริญญา: ${f.fieldOrDegree.join(', ')}`)
  if (f.minYears != null) parts.push(`ประสบการณ์ ${f.minYears} ปีขึ้นไป`)
  return parts.join(' · ')
}
