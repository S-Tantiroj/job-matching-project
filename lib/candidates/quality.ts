// ตรวจคุณภาพข้อมูลผู้สมัคร คำนวณสดจากแถวที่ query มา ไม่มีคอลัมน์เก็บสถานะ

export type MissingField = 'headline' | 'summary' | 'years_experience' | 'embedding'

export type QualityRow = {
  headline?: string | null
  summary?: string | null
  years_experience?: number | null
  has_embedding: boolean
}

export const MISSING_LABELS: Record<MissingField, string> = {
  headline: 'ตำแหน่งย่อ',
  summary: 'สรุปโปรไฟล์',
  years_experience: 'ปีประสบการณ์',
  embedding: 'เวกเตอร์ค้นหา',
}

// embedding ที่หายไปคือกรณีร้ายแรงที่สุด — RPC ค้นหาทั้งสองตัวมี
// `where c.embedding is not null` ผู้สมัครที่ไม่มี embedding จึงไม่เคยโผล่ในผลค้นหาเลย
export function missingFields(row: QualityRow): MissingField[] {
  const missing: MissingField[] = []
  if (!row.headline) missing.push('headline')
  if (!row.summary) missing.push('summary')
  if (row.years_experience == null) missing.push('years_experience')
  if (!row.has_embedding) missing.push('embedding')
  return missing
}

// สร้างสตริงสำหรับ PostgREST .or() ที่รวมทุกเงื่อนไข "มีปัญหา"
// ถ้าไม่มีชื่อซ้ำเลยต้องตัดท่อน full_name.in.() ออกทั้งหมด — วงเล็บว่างทำให้
// PostgREST parse ไม่ผ่านและ query ทั้งก้อนพัง ซึ่งเป็นเคสปกติเมื่อข้อมูลสะอาด
export function buildIssuesOrFilter(duplicateNames: string[]): string {
  const clauses = [
    'headline.is.null',
    'summary.is.null',
    'years_experience.is.null',
    'embedding.is.null',
  ]
  if (duplicateNames.length) {
    // ครอบด้วยเครื่องหมายคำพูดเสมอ มิฉะนั้นจุลภาคในชื่อจะถูกอ่านเป็นตัวคั่นรายการ
    const quoted = duplicateNames.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(',')
    clauses.push(`full_name.in.(${quoted})`)
  }
  return clauses.join(',')
}
