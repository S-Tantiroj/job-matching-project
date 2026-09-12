// ชั้นเชื่อม PhantomBuster — แยกเป็นไฟล์เดียวโดยตั้งใจ
//
// ============================================================================
// ยืนยันกับเอกสารจริงแล้วเมื่อ 2026-09-12 — ของเดิมเดาผิด 2 ใน 3 ข้อ
// ============================================================================
// ไฟล์นี้เคยเขียนไว้ตอนยังไม่มีบัญชี PhantomBuster โดยเดารูปร่าง endpoint เอา
// พอได้บัญชีจริงแล้วตรวจกับเอกสารพบว่า:
//
//   1. endpoint  — เดาว่า `/agents/fetch-output` **ผิด**
//      ตัวนั้นคืน "console output ของ container ล่าสุด" คือ log ของการรัน
//      ไม่ใช่ผลลัพธ์ที่ scrape มา ตัวที่ถูกคือ **`/agents/fetch`**
//   2. header    — เดาว่า `X-Phantombuster-Key` **ถูก**
//   3. รูปแบบผล  — เดาว่าเป็น CSV ตรงๆ หรือ JSON ที่มี `resultUrl` **ผิดทั้งคู่**
//      ของจริงคืน `orgS3Folder` กับ `s3Folder` มาเป็นชิ้นส่วนของที่อยู่ไฟล์
//      **แล้วเราต้องประกอบ URL ของ S3 เอง** API ไม่ส่งไฟล์ให้และไม่ส่งลิงก์เต็มให้
//
// เอกสาร: https://support.phantombuster.com/hc/en-us/articles/23117755693458
//
// **เงื่อนไขที่เอกสารระบุไว้และกระทบเราโดยตรง: phantom ต้องเคยรันอย่างน้อยหนึ่งครั้ง**
// ถ้ายังไม่เคยรัน จะไม่มีโฟลเดอร์ผลลัพธ์ให้ประกอบเป็น URL

const API = 'https://api.phantombuster.com/api/v2'
const S3 = 'https://phantombuster.s3.amazonaws.com'

/**
 * ชื่อไฟล์ผลลัพธ์ตั้งต้นของ phantom ส่วนใหญ่
 *
 * **ตั้งชื่ออื่นได้ในหน้าตั้งค่าของ phantom** ถ้าเปลี่ยนแล้วต้องตั้ง
 * `PHANTOMBUSTER_RESULT_FILE` ให้ตรง ไม่งั้นจะได้ 403/404 จาก S3
 * ซึ่งหน้าตาเหมือนกับ "ยังไม่เคยรัน" ทั้งที่คนละสาเหตุ
 */
const DEFAULT_RESULT_FILE = 'result.csv'

/**
 * ประกอบ URL ดาวน์โหลดจากชิ้นส่วนที่ API ส่งมา
 *
 * แยกเป็นฟังก์ชันบริสุทธิ์เพื่อให้ทดสอบได้โดยไม่ต้องแตะเครือข่าย — ซึ่งเป็นสิ่งที่
 * ทำไม่ได้เลยกับโค้ดชุดเดิมที่ยัดทุกอย่างไว้ในฟังก์ชันเดียวที่เรียก `fetch`
 *
 * `encodeURIComponent` ทุกชิ้นเพราะค่าเหล่านี้มาจากบริการภายนอก เราไม่ได้กำหนดเอง
 */
export function buildResultUrl(
  orgS3Folder: string,
  s3Folder: string,
  fileName: string = DEFAULT_RESULT_FILE
): string {
  const part = (v: string) => encodeURIComponent(v.trim())
  return `${S3}/${part(orgS3Folder)}/${part(s3Folder)}/${part(fileName)}`
}

/** แยกโฟลเดอร์ออกจากคำตอบของ `/agents/fetch` และบอกให้ชัดเมื่อไม่ครบ */
export function readS3Folders(body: any): { orgS3Folder: string; s3Folder: string } {
  const orgS3Folder = String(body?.orgS3Folder ?? '').trim()
  const s3Folder = String(body?.s3Folder ?? '').trim()

  // **สาเหตุที่พบบ่อยที่สุดคือ phantom ยังไม่เคยรัน** ไม่ใช่ agent id ผิด
  // (agent id ผิดจะได้ 404 จากขั้นก่อนหน้า) ข้อความจึงต้องชี้ไปที่สาเหตุที่ถูก
  if (!orgS3Folder || !s3Folder) {
    throw new Error(
      'phantombuster ไม่ได้ส่งตำแหน่งไฟล์ผลลัพธ์มา — phantom ตัวนี้อาจยังไม่เคยรันสำเร็จสักครั้ง'
    )
  }
  return { orgS3Folder, s3Folder }
}

/**
 * ดึง CSV ผลลัพธ์ล่าสุดของ agent
 *
 * **รับ apiKey เป็นพารามิเตอร์ ไม่อ่าน env เอง** — ผู้เรียกตรวจการตั้งค่าไปแล้วด้วย
 * `readPhantombusterConfig` การอ่านซ้ำที่นี่คือด่านที่สองที่ให้ข้อความคนละแบบ
 * กับด่านแรก ซึ่งทำให้ผู้ใช้เห็นข้อความไม่ตรงกันสำหรับปัญหาเดียวกัน
 */
export async function fetchLatestCsv(agentId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${API}/agents/fetch?id=${encodeURIComponent(agentId)}`, {
    headers: { 'X-Phantombuster-Key': apiKey },
  })

  // แยกสาเหตุที่แก้คนละวิธีออกจากกัน แทนที่จะบอกแค่ตัวเลข status
  if (res.status === 401 || res.status === 403) {
    throw new Error('phantombuster ปฏิเสธคีย์ — ตรวจ PHANTOMBUSTER_API_KEY ว่ายังใช้ได้อยู่')
  }
  if (res.status === 404) {
    throw new Error('phantombuster ไม่พบ agent นี้ — ตรวจ PHANTOMBUSTER_AGENT_ID')
  }
  if (res.status === 429) {
    // ให้ตรงกับรูปแบบที่ `isRateLimited` ในสคริปต์ sync มองหา จะได้ลองใหม่เองได้
    throw new Error('phantombuster rate limited {"code":429}')
  }
  if (!res.ok) throw new Error(`phantombuster /agents/fetch ตอบ ${res.status}`)

  const { orgS3Folder, s3Folder } = readS3Folders(await res.json())
  const fileName = (process.env.PHANTOMBUSTER_RESULT_FILE ?? '').trim() || DEFAULT_RESULT_FILE
  const url = buildResultUrl(orgS3Folder, s3Folder, fileName)

  // ไฟล์อยู่บน S3 สาธารณะ ไม่ต้องส่ง API key ไปด้วย
  const file = await fetch(url)
  if (!file.ok) {
    throw new Error(
      `ดาวน์โหลดผลลัพธ์ไม่สำเร็จ (${file.status}) — ` +
        `ถ้า phantom ตั้งชื่อไฟล์ผลลัพธ์เองไว้ ต้องตั้ง PHANTOMBUSTER_RESULT_FILE ให้ตรง ` +
        `(ตอนนี้ใช้ "${fileName}")`
    )
  }

  const text = await file.text()
  if (!text.trim()) throw new Error('ไฟล์ผลลัพธ์จาก phantombuster ว่างเปล่า')
  return text
}
