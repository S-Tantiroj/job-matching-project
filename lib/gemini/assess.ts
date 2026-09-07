import { getGemini } from './client'
import { withTimeout, GEMINI_TIMEOUT_MS } from './withTimeout'
import { computeYearsExperience } from '@/lib/ingest/normalize'
import type { ProfileDraft } from '@/lib/self/profileDraft'
import { normalizeAssessment, type Assessment } from '@/lib/self/assessmentShape'
import { MODEL_TEXT } from './models'

// วิเคราะห์โปรไฟล์เป็นจุดแข็ง จุดอ่อน และสิ่งที่ควรพัฒนา ผลลัพธ์เป็นภาษาไทย
// ตามกติกาว่า reasoning/advice ที่ผู้ใช้อ่านเป็นไทย ขณะที่ข้อมูลใน DB เป็นอังกฤษ
//
// แยกจาก parsePdfProfile เพราะคนละธรรมชาติ — อันนั้นสกัดข้อเท็จจริง อันนี้ตัดสิน
// แยกแล้วปรับ prompt ทีละตัวได้ และประเมินใหม่ได้จาก parsed_data ที่เก็บไว้
// โดยไม่ต้องให้ผู้ใช้อัปโหลด PDF ซ้ำ

// แยกการประกอบ prompt ออกมาเพื่อทดสอบเป็น unit ได้โดยไม่แตะเครือข่าย
//
// yearsExperience มาจาก computeYearsExperience ซึ่ง**ข้าม**รายการที่ไม่มี
// start_date ไปเงียบๆ — ทั้งการกรอกเอง (ช่องวันที่ไม่บังคับ) และการอัปโหลด
// (coerceForReview ทิ้งวันที่ผิดรูปโดยไม่บอกผู้ใช้) ทำให้เกิดโปรไฟล์ที่มี
// ประสบการณ์จริงแต่ไม่มี start_date ที่ใช้ได้เลยสักรายการ ถ้าเป็น 0 เสมอในกรณีนี้
// แล้วบอกโมเดลว่า "คำนวณแล้ว ใช้เลขนี้" โมเดลจะฟันธงว่าไม่มีประสบการณ์ทั้งที่ไม่จริง
// จึงต้องแยกว่ามีรายการที่นับได้จริงอย่างน้อยหนึ่งรายการหรือไม่ ไม่ใช่ดูแค่ค่า 0
export function buildAssessPrompt(profile: ProfileDraft, yearsExperience: number): string {
  const hasUsableDates = (profile.experience ?? []).some((e) => !!e.start_date)
  const experienceLine = hasUsableDates
    ? `รวมประสบการณ์ทำงานประมาณ ${yearsExperience} ปี (คำนวณจากวันที่ในโปรไฟล์แล้ว ใช้ตัวเลขนี้ ไม่ต้องคำนวณเอง)`
    : 'ไม่ทราบจำนวนปีประสบการณ์ทำงานที่แน่ชัด (โปรไฟล์ไม่มีวันที่เริ่มงานที่ใช้คำนวณได้) ห้ามสมมติว่าไม่มีประสบการณ์หรือคำนวณจำนวนปีเอง'

  return `วิเคราะห์โปรไฟล์ผู้สมัครต่อไปนี้ ตอบเป็น JSON เท่านั้น ทุกข้อความเป็นภาษาไทย

{"strengths":["จุดแข็ง"],"weaknesses":["จุดที่ยังขาด"],"development":["สิ่งที่ควรพัฒนาต่อ"],"summary":"ภาพรวมสั้นๆ 1-2 ประโยค"}

เงื่อนไข:
- strengths, weaknesses, development อย่างละ 2-4 ข้อ สั้นและเจาะจง
- อ้างอิงจากข้อมูลในโปรไฟล์เท่านั้น ห้ามสมมติสิ่งที่ไม่ปรากฏ
- ใช้น้ำเสียงให้กำลังใจและสร้างสรรค์ ไม่ตัดสินคุณค่าของบุคคล
- ถ้ามีผลการเรียน (gpa) ให้พูดถึงได้ แต่อย่าเทียบข้ามสเกลที่ต่างกัน

${experienceLine}

โปรไฟล์: ${JSON.stringify(profile)}`
}

export async function assessProfile(profile: ProfileDraft): Promise<Assessment> {
  const years = computeYearsExperience(profile.experience ?? [])

  const res = await withTimeout(
    getGemini().models.generateContent({
      model: MODEL_TEXT,
      contents: buildAssessPrompt(profile, years),
      config: { responseMimeType: 'application/json' },
    }),
    GEMINI_TIMEOUT_MS
  )

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
