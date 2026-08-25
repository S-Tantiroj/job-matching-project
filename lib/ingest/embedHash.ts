import { createHash } from 'crypto'
import { buildEmbedText, type CandidateInput } from './normalize'

// Hash ของข้อความที่จะถูกส่งไป embed จริง ใช้ตัดสินว่าแถวนี้เปลี่ยนพอที่จะต้อง
// เรียก Gemini ใหม่ไหม
//
// ทำไมต้องมี: upsertCandidate เรียก embedText เป็นบรรทัดแรกสุด ก่อนจะเช็คว่าแถวนั้น
// มีอยู่แล้วหรือยัง การรันทุกคืนกับ search เดิมจึง re-embed ทุกคนทุกครั้ง ทั้งที่คนใหม่
// จริงมีไม่กี่คน — เผาโควตาจนฟีเจอร์ใช้ไม่ได้
//
// normalize ช่องว่างก่อน hash เพราะ CSV export ซ้ำมักมีช่องว่างต่างกันโดยเนื้อหาเหมือนเดิม
// ไม่ lowercase เพราะการเปลี่ยนตัวพิมพ์เป็นการเปลี่ยนเนื้อหาจริงที่ควร re-embed
export function embedHash(input: CandidateInput): string {
  const text = buildEmbedText(input).replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(text).digest('hex')
}
