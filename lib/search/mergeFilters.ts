import type { ChipFilters } from './extractFilters'

// รวมตัวกรองที่ AI สกัดได้ เข้ากับตัวกรองที่ผู้ใช้ตั้งไว้เอง โดยไม่เขียนทับของผู้ใช้
//
// เดิมหน้าค้นหาแสดง FilterChips หลังจาก AI ตอบกลับแล้วเท่านั้น จึงไม่มีทางที่ผู้ใช้
// จะตั้งตัวกรองไว้ก่อน — `setFilters(intent.filters)` เขียนทับได้อย่างปลอดภัย
// ตอนนี้ตัวกรองแสดงตั้งแต่เปิดหน้า ผู้ใช้ตั้งค่าไว้ก่อนพิมพ์ได้ การเขียนทับตรงๆ
// จะทำให้สิ่งที่เขาเพิ่งตั้งหายไปตอนกดค้นหา ซึ่งเป็นการทิ้งงานของผู้ใช้เงียบๆ
//
// **แต่การ "รวม" เฉยๆ ก็ผิด** — ค้นหา "data scientist Python" ได้ชิป Python
// แล้วค้นใหม่ว่า "graphic designer" ชิป Python จะติดค้างอยู่และกรองผลลัพธ์ทิ้ง
// โดยผู้ใช้ไม่รู้ตัวว่ามันมาจากคำค้นหาที่เลิกใช้ไปแล้ว
//
// จึงต้องจำว่าชิปไหน "เป็นของ AI" (`AiOwned`) รอบถัดไปถอดเฉพาะของ AI ออกก่อน
// แล้วค่อยใส่ชุดใหม่เข้าไป ของที่ผู้ใช้พิมพ์เองอยู่ครบเสมอ

export type AiOwned = {
  skills: string[]
  fieldOrDegree: string[]
  // minYears เป็นค่าเดี่ยว จำได้แค่ว่าค่าที่ถืออยู่ตอนนี้มาจาก AI หรือผู้ใช้
  minYears: boolean
}

export const NO_AI_FILTERS: AiOwned = { skills: [], fieldOrDegree: [], minYears: false }

// เทียบแบบไม่สนตัวพิมพ์และช่องว่างหัวท้าย — AI คืน "Python" ส่วนผู้ใช้พิมพ์ "python"
// ถ้าเทียบตรงๆ จะได้ชิปซ้ำสองอันที่ดูเหมือนกันแต่ลบทีละอัน
const norm = (s: string) => s.trim().toLowerCase()

function without(list: string[], remove: string[]): string[] {
  const drop = new Set(remove.map(norm))
  return list.filter((x) => !drop.has(norm(x)))
}

// ต่อท้ายเฉพาะค่าที่ยังไม่มี แล้วบอกกลับว่าค่าไหนถูกเพิ่มจริง
// (ค่าที่ซ้ำกับของผู้ใช้ **ไม่นับเป็นของ AI** ไม่งั้นรอบหน้าจะถอดของผู้ใช้ทิ้งไปด้วย)
function addNew(base: string[], incoming: string[]): { merged: string[]; added: string[] } {
  const seen = new Set(base.map(norm))
  const added: string[] = []
  for (const v of incoming) {
    if (!v?.trim()) continue
    const k = norm(v)
    if (seen.has(k)) continue
    seen.add(k)
    added.push(v)
  }
  return { merged: [...base, ...added], added }
}

const orUndefined = (a: string[]) => (a.length ? a : undefined)

// เรียกเมื่อ AI สกัดตัวกรองชุดใหม่มา
export function mergeAiFilters(
  current: ChipFilters,
  ai: AiOwned,
  incoming: ChipFilters
): { filters: ChipFilters; ai: AiOwned } {
  const userSkills = without(current.skills ?? [], ai.skills)
  const userFields = without(current.fieldOrDegree ?? [], ai.fieldOrDegree)

  const s = addNew(userSkills, incoming.skills ?? [])
  const f = addNew(userFields, incoming.fieldOrDegree ?? [])

  // ผู้ใช้ตั้งจำนวนปีไว้เองหรือเปล่า — ถ้าใช่ AI ห้ามแตะ
  const userSetYears = current.minYears != null && !ai.minYears
  const minYears = userSetYears ? current.minYears : incoming.minYears ?? undefined

  return {
    filters: {
      skills: orUndefined(s.merged),
      fieldOrDegree: orUndefined(f.merged),
      minYears,
    },
    ai: {
      skills: s.added,
      fieldOrDegree: f.added,
      minYears: !userSetYears && incoming.minYears != null,
    },
  }
}

// เรียกหลังผู้ใช้แก้ชิปเอง — ของที่ถูกลบต้องหลุดจากบัญชีของ AI ด้วย
// ไม่งั้นรอบค้นหาถัดไปจะพยายามถอดค่าที่ไม่มีอยู่แล้ว และที่แย่กว่าคือ ค่าที่ผู้ใช้
// พิมพ์กลับเข้ามาเองจะถูกนับเป็นของ AI แล้วโดนถอดทิ้งทั้งที่เป็นของผู้ใช้
export function reconcileAfterUserEdit(
  prev: ChipFilters,
  next: ChipFilters,
  ai: AiOwned
): AiOwned {
  const keep = (owned: string[], list?: string[]) => {
    const present = new Set((list ?? []).map(norm))
    return owned.filter((x) => present.has(norm(x)))
  }
  return {
    skills: keep(ai.skills, next.skills),
    fieldOrDegree: keep(ai.fieldOrDegree, next.fieldOrDegree),
    // แตะช่องจำนวนปีเมื่อไร ค่านั้นกลายเป็นของผู้ใช้ทันที
    minYears: ai.minYears && next.minYears === prev.minYears,
  }
}
