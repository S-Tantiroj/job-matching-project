// ตัวแปลงค่าจาก URL สำหรับหน้าตารางผู้สมัคร ทุกตัวเป็นฟังก์ชันบริสุทธิ์
// ค่าจาก URL เชื่อถือไม่ได้ ทุกอย่างต้องผ่าน whitelist ก่อนส่งเข้า query

export const PAGE_SIZE = 25

export type SortColumn =
  | 'full_name'
  | 'years_experience'
  | 'source'
  | 'updated_at'
  | 'created_at'

const SORTABLE: SortColumn[] = [
  'full_name',
  'years_experience',
  'source',
  'updated_at',
  'created_at',
]

const DEFAULT_SORT: SortColumn = 'updated_at'

export function parsePage(v?: string): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

// ห้ามส่งค่าดิบจาก URL เข้า .order() — คืนค่า default ถ้าไม่อยู่ใน whitelist
export function parseSort(v?: string): SortColumn {
  return SORTABLE.includes(v as SortColumn) ? (v as SortColumn) : DEFAULT_SORT
}

export function parseAsc(v?: string): boolean {
  return v === 'asc'
}
