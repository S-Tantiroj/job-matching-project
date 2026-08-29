import type { JobInput } from '@/lib/jobs/normalize'

export type Criterion = {
  id: string
  label: string
  /** ชื่อสั้นสำหรับแสดงผล — ข้อความเต็มยาวเกินกว่าจะอ่านซ้ำทุกคน */
  short: string
  /** ข้อบังคับ — ไม่ผ่านข้อนี้แล้วคะแนนเป็น 0 ทันที ไม่ว่าข้ออื่นจะผ่านกี่ข้อ */
  must?: boolean
}

export type Rubric = {
  jobId: string
  title: string
  criteria: Criterion[]
}

export type Checks = Record<string, boolean>

// สร้างเกณฑ์ตรวจจากฟิลด์ของงาน โดยไม่เรียกโมเดลใดๆ
//
// ข้อความทุกข้อจงใจถามถึง "ความสามารถจริง" ไม่ใช่ "มีคำนี้อยู่ในข้อมูลไหม"
// ถ้าเกณฑ์กลายเป็นการจับคู่คำ เฉลยจะเป็นแค่การเขียนสูตรจัดอันดับใหม่ด้วยคำพูด
// แล้วทุกสูตรจะได้คะแนนดีด้วยเหตุผลที่ผิด คนอ่านโปรไฟล์เต็มอนุมานได้ว่า
// Data Scientist ที่ Agoda ย่อมเขียน Python เป็น ซึ่ง embedding ทำไม่ได้ —
// ช่องว่างตรงนั้นคือสิ่งที่การวัดนี้ต้องการจับ
// สถานที่ที่ไม่ได้ระบุที่ตั้งจริง — ไม่มีอะไรให้ตรวจ จึงไม่สร้างเกณฑ์ข้อนี้
const PLACELESS = ['remote', 'anywhere', 'worldwide', 'global', 'hybrid', 'ไม่ระบุ']

export function buildRubric(jobId: string, j: JobInput): Rubric {
  // ทุกข้อต้องตอบได้จากสิ่งที่อยู่ในโปรไฟล์ตรงหน้า ไม่ใช่จากการเดาเจตนาหรืออนาคต
  // ของผู้สมัคร ข้อที่ตอบไม่ได้จะถูกเดา และการเดาคือ noise ที่กลบผลการวัด
  const criteria: Criterion[] = [
    {
      id: 'role',
      short: 'บทบาทตรงกัน',
      label: `เคยดำรงตำแหน่งที่ทำงานประเภทเดียวกับ "${j.title}" — ดูจากชื่อตำแหน่งใน headline หรือประวัติการทำงาน`,
      must: true,
    },
  ]

  if (j.required_skills?.length) {
    const n = j.required_skills.length
    const need = Math.ceil(n / 2)
    criteria.push({
      id: 'skills',
      short: `ทักษะถึง ${need} ใน ${n}`,
      label: `เคยทำงานที่ต้องใช้อย่างน้อย ${need} ใน ${n} อย่างนี้: ${j.required_skills.join(' / ')} — ดูจากงานที่เคยทำ ไม่ใช่แค่มีคำนั้นอยู่ในรายการทักษะ`,
    })
  }
  if (j.min_experience_years != null) {
    criteria.push({
      id: 'experience',
      short: `ประสบการณ์ ${j.min_experience_years} ปีขึ้นไป`,
      label: `ประวัติการทำงานที่ปรากฏรวมแล้วตั้งแต่ ${j.min_experience_years} ปีขึ้นไป`,
    })
  }
  // category เป็นคำจัดหมวดภายในระบบ (Data / Engineering / Product) ไม่ใช่ชื่อ
  // อุตสาหกรรม เกณฑ์ที่สร้างจากมันจึงกำกวมและซ้ำกับข้อ role อยู่แล้ว — ตัดออก
  if (j.location && !PLACELESS.includes(j.location.trim().toLowerCase())) {
    criteria.push({
      id: 'location',
      short: `อยู่ใน ${j.location}`,
      label: `ที่อยู่ที่ระบุในโปรไฟล์ หรือบริษัทที่เคยทำงาน อยู่ใน ${j.location}`,
    })
  }

  return { jobId, title: j.title, criteria }
}

// เกณฑ์ที่ไม่ใช่ข้อบังคับ ต้องผ่านสัดส่วนเท่านี้ขึ้นไปจึงได้ 2
//
// 0.6 ไม่ใช่ 0.7 เพราะเกณฑ์เสริมมักมี 2-3 ข้อ ที่ 0.7 กรณี 3 ข้อจะต้องผ่านครบทั้งสาม
// ทำให้คนที่ตกเฉพาะข้อสถานที่ — ข้อที่สำคัญน้อยที่สุด — ตกจาก "เหมาะมาก" ไปทันที
// ที่ 0.6 กลายเป็น 2 ใน 3 ซึ่งตรงกับความหมายของคำว่าเหมาะมากกว่า
export const STRONG_RATIO = 0.6

// แปลงการติ๊กเป็นคะแนน 0/1/2
//
// เก็บ "ติ๊กข้อไหนบ้าง" แทนการเก็บคะแนนสำเร็จรูป ทำให้เปลี่ยนน้ำหนักภายหลังแล้ว
// คำนวณใหม่ได้ทั้งชุดโดยไม่ต้องกลับไปติดป้ายใหม่
export function gradeFromChecks(rubric: Rubric, checks: Checks): number {
  const musts = rubric.criteria.filter((c) => c.must)
  if (musts.some((c) => !checks[c.id])) return 0

  const others = rubric.criteria.filter((c) => !c.must)
  if (!others.length) return 2

  const passed = others.filter((c) => checks[c.id]).length
  return passed / others.length >= STRONG_RATIO ? 2 : 1
}

/** จำนวนข้อที่ติ๊กผ่าน / ทั้งหมด — ใช้แสดงผลเท่านั้น ไม่ใช่คะแนน */
export function checkCount(rubric: Rubric, checks: Checks): { passed: number; total: number } {
  return {
    passed: rubric.criteria.filter((c) => checks[c.id]).length,
    total: rubric.criteria.length,
  }
}
