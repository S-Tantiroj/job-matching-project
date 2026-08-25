import type { CandidateInput } from './normalize'

export type MissingField = 'headline' | 'experience' | 'linkedin_url' | 'education'

// ตัดสินว่าแถวนี้ครบพอจะเข้า candidates เลย หรือควรเข้าคิวให้คนตรวจก่อน
// array ว่าง = ครบ
//
// เกณฑ์ทั้งสี่มาจากผลที่เกิดจริงถ้าปล่อยข้อมูลไม่ครบเข้าไป:
//   headline ว่าง      -> ข้อความสำหรับ embed น้อยเกินไป ค้นหาเจอยาก
//   experience ว่าง    -> computeYearsExperience ได้ 0 หลุดจากตัวกรองประสบการณ์ทุกครั้ง
//   linkedin_url ว่าง  -> ไม่มี dedup key ตาม migration 008 จะตกไป dedup ด้วยชื่อซึ่งชนกันได้
//   education ว่าง     -> ยืนยันเงื่อนไข "จบจากต่างประเทศ" ไม่ได้ ซึ่งเป็นแกนของแพลตฟอร์ม
//
// full_name ไม่ต้องเช็ค — parseLinkedInCsv ทิ้งแถวที่ไม่มีชื่อไปแล้ว (linkedin.ts:30)
export function classifyRow(input: CandidateInput): MissingField[] {
  const missing: MissingField[] = []
  if (!input.headline?.trim()) missing.push('headline')
  if (!input.experience?.length) missing.push('experience')
  if (!input.linkedin_url?.trim()) missing.push('linkedin_url')
  if (!input.education?.length) missing.push('education')
  return missing
}
