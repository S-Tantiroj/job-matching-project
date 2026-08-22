import { getGemini } from './client'
import type { CandidateInput } from '@/lib/ingest/normalize'
import { normalizeAssessment, type Assessment } from '@/lib/self/assessmentShape'

// วิเคราะห์โปรไฟล์เป็นจุดแข็ง จุดอ่อน และสิ่งที่ควรพัฒนา ผลลัพธ์เป็นภาษาไทย
// ตามกติกาว่า reasoning/advice ที่ผู้ใช้อ่านเป็นไทย ขณะที่ข้อมูลใน DB เป็นอังกฤษ
//
// แยกจาก parsePdfProfile เพราะคนละธรรมชาติ — อันนั้นสกัดข้อเท็จจริง อันนี้ตัดสิน
// แยกแล้วปรับ prompt ทีละตัวได้ และประเมินใหม่ได้จาก parsed_data ที่เก็บไว้
// โดยไม่ต้องให้ผู้ใช้อัปโหลด PDF ซ้ำ
export async function assessProfile(profile: CandidateInput): Promise<Assessment> {
  const prompt = `วิเคราะห์โปรไฟล์ผู้สมัครต่อไปนี้ ตอบเป็น JSON เท่านั้น ทุกข้อความเป็นภาษาไทย

{"strengths":["จุดแข็ง"],"weaknesses":["จุดที่ยังขาด"],"development":["สิ่งที่ควรพัฒนาต่อ"],"summary":"ภาพรวมสั้นๆ 1-2 ประโยค"}

เงื่อนไข:
- strengths, weaknesses, development อย่างละ 2-4 ข้อ สั้นและเจาะจง
- อ้างอิงจากข้อมูลในโปรไฟล์เท่านั้น ห้ามสมมติสิ่งที่ไม่ปรากฏ
- ใช้น้ำเสียงให้กำลังใจและสร้างสรรค์ ไม่ตัดสินคุณค่าของบุคคล

โปรไฟล์: ${JSON.stringify(profile)}`

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  })

  const text = (res.text ?? '').replace(/```json|```/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  let parsed: unknown
  try {
    parsed = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text)
  } catch {
    throw new Error('gemini returned unparseable JSON for the assessment')
  }

  const assessment = normalizeAssessment(parsed)
  if (!assessment) throw new Error('gemini returned an empty assessment')
  return assessment
}
