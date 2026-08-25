// ชั้นเชื่อม PhantomBuster — แยกเป็นไฟล์เดียวโดยตั้งใจ
//
// ขณะเขียน ยังไม่มีบัญชี PhantomBuster จึงยังไม่ได้ยืนยันรูปร่าง endpoint และ response
// กับ API จริง เมื่อพบว่าจริงๆ มันคืนอะไร ให้แก้เฉพาะไฟล์นี้ — ผู้เรียกทั้งหมดเห็นแค่
// "ฟังก์ชันที่คืน CSV เป็นข้อความ" จึงไม่กระทบส่วนอื่น
//
// สิ่งที่ต้องตรวจกับเอกสารของผู้ให้บริการก่อนใช้จริง:
//   1. path และ query ของ endpoint ที่ดึงผลลัพธ์ล่าสุดของ agent
//   2. ชื่อ header ของ API key
//   3. ผลลัพธ์เป็น CSV ตรงๆ หรือเป็น JSON ที่มี URL ให้ไปดาวน์โหลดต่อ

const BASE = 'https://api.phantombuster.com/api/v2'

export async function fetchLatestCsv(agentId: string): Promise<string> {
  const key = process.env.PHANTOMBUSTER_API_KEY
  if (!key) throw new Error('PHANTOMBUSTER_API_KEY is not set')

  const res = await fetch(`${BASE}/agents/fetch-output?id=${encodeURIComponent(agentId)}`, {
    headers: { 'X-Phantombuster-Key': key },
  })
  if (!res.ok) {
    throw new Error(`phantombuster responded ${res.status}`)
  }

  const body = await res.json()

  // ถ้าผลลัพธ์ถูกส่งเป็นลิงก์ไปยังไฟล์ ให้ดาวน์โหลดต่อ
  const url: string | undefined = body?.resultUrl ?? body?.data?.resultUrl
  if (url) {
    const file = await fetch(url)
    if (!file.ok) throw new Error(`phantombuster result download responded ${file.status}`)
    return await file.text()
  }

  const inline: string | undefined = body?.csv ?? body?.data?.csv
  if (typeof inline === 'string' && inline.trim()) return inline

  throw new Error('phantombuster returned no usable CSV')
}
