// รูปร่างของบทวิเคราะห์ที่ Gemini คืนมา ทุกข้อความเป็นภาษาไทย
export type Assessment = {
  strengths: string[]
  weaknesses: string[]
  development: string[]
  summary: string
}

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : []

// ทำให้เป็นมาตรฐานและตรวจว่าใช้ได้จริง คืน null เมื่อไม่มีเนื้อหาเลย
//
// จำเป็นเพราะ JSON.parse สำเร็จไม่ได้แปลว่าได้ของที่ใช้ได้ — โมเดลอาจคืน {} หรือ
// คืนฟิลด์ที่เป็นชนิดผิด ถ้าปล่อยผ่านจะได้แถวในฐานข้อมูลที่หน้าเว็บแสดงเป็นช่องว่าง
// โดยไม่มีใครรู้ว่าพังตรงไหน
export function normalizeAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const a: Assessment = {
    strengths: toStringArray(r.strengths),
    weaknesses: toStringArray(r.weaknesses),
    development: toStringArray(r.development),
    summary: String(r.summary ?? '').trim(),
  }
  if (!a.strengths.length && !a.weaknesses.length && !a.development.length && !a.summary) {
    return null
  }
  return a
}
