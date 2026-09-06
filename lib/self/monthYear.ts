// แปลงระหว่างวันที่ ISO ที่เก็บในฐาน กับช่อง "เดือน/ปี" ที่ผู้ใช้กรอก
//
// ทำไมเหลือแค่เดือนกับปี: `<input type="date">` ให้เบราว์เซอร์เป็นคนเลือกรูปแบบ
// ตาม locale ของเครื่อง เครื่องที่ตั้งเป็นอังกฤษ-อเมริกันจึงขึ้น MM/DD/YYYY
// ซึ่งคนไทยอ่านสลับกับ DD/MM/YYYY ได้ง่ายมาก และเราบังคับรูปแบบไม่ได้เลย
// การใช้ dropdown เดือนกับปีตัดปัญหานั้นทิ้งทั้งหมด
//
// อีกเหตุผลที่ตรงกว่า: เรซูเม่แทบไม่เคยระบุ "วัน" ที่เริ่มงาน เดือนกับปีคือความ
// ละเอียดที่เป็นจริง และ `computeYearsExperience` ก็คิดเป็นช่วงเวลาอยู่แล้ว
//
// **ค่าที่เก็บยังเป็น ISO YYYY-MM-DD เหมือนเดิม** ไม่มี migration ของใหม่ลงวันที่ 01
// เสมอ ส่วนแถวเก่าที่มีวันจริง (เช่น 2025-04-15) ยังผ่านตัวตรวจได้ตามปกติ

export const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export type MonthYear = { month: number; year: number } | null

// อ่านเดือน/ปีจากค่า ISO โดยไม่ผ่าน new Date() — ตัดปัญหาโซนเวลาที่ทำให้
// "2025-01-01" กลายเป็นเดือนธันวาคมของปีก่อนหน้าในเครื่องที่ offset ติดลบ
export function toMonthYear(iso: string | undefined | null): MonthYear {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  if (month < 1 || month > 12) return null
  return { month, year }
}

// ประกอบกลับเป็น ISO โดยใช้วันที่ 1 เสมอ คืน undefined เมื่อยังเลือกไม่ครบ
// เพื่อให้ค่าไม่ครบกลายเป็น "ไม่ได้กรอก" ไม่ใช่วันที่ที่เดาเอาเอง
export function fromMonthYear(
  month: number | undefined,
  year: number | undefined
): string | undefined {
  if (!month || !year) return undefined
  if (month < 1 || month > 12) return undefined
  if (year < 1900 || year > 2100) return undefined
  return `${year}-${String(month).padStart(2, '0')}-01`
}

// ช่วงปีที่ให้เลือก — ล่วงหน้าหนึ่งปีเพราะบางคนระบุวันจบการศึกษาที่ยังไม่ถึง
export function yearOptions(now: number = new Date().getFullYear()): number[] {
  const years: number[] = []
  for (let y = now + 1; y >= 1960; y--) years.push(y)
  return years
}
