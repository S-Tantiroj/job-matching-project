// แปลงค่า cosine similarity (0–1) เป็นคะแนน 0–100
//
// นี่เป็นฟังก์ชันเล็กตัวใหม่ ไม่ใช่การ refactor ของเดิม — ห้ามไปแก้ตรรกะคิดคะแนน
// ที่ฝังอยู่ใน lib/jobs/match.ts หรือ lib/search/query.ts เพราะกติกาห้ามแตะ
// search/matching ที่มีอยู่ ยอมให้สูตรเดียวกันอยู่สองที่ในเฟสนี้
export function similarityToScore(similarity: number): number {
  if (!Number.isFinite(similarity)) return 0
  return Math.max(0, Math.min(100, Math.round(similarity * 100)))
}
