import { isTransient } from '@/lib/gemini/withTimeout'

type TestContext = { skip: () => void }

// ข้ามเทสต์เมื่อบริการภายนอกไม่พร้อม แทนที่จะปล่อยให้ตก
//
// เทสต์ที่แดงเพราะ Gemini ถูกจำกัดความจุคือสัญญาณเตือนลวง และสัญญาณลวงสอนให้คน
// เลิกสนใจสีแดง พอถึงวันที่โค้ดพังจริงจะไม่มีใครดู
//
// ไม่ใช่การซุกปัญหา เพราะข้ามเฉพาะความล้มเหลวชั่วคราวที่ระบุได้ (503 / 429 /
// timeout) ความล้มเหลวอื่นทั้งหมด — ยืนยันค่าไม่ผ่าน, ตารางหาย, โค้ดพัง — ยังตก
// ตามปกติ และทุกครั้งที่ข้ามจะพิมพ์เหตุผลออกมาให้เห็น ไม่ได้เงียบหาย
export async function tolerateOutage(ctx: TestContext, body: () => Promise<void>): Promise<void> {
  try {
    await body()
  } catch (e) {
    if (!isTransient(e)) throw e
    console.warn(`\n  ⏭  ข้ามเทสต์ — บริการภายนอกไม่พร้อม: ${String((e as any)?.message ?? e)}\n`)
    ctx.skip()
  }
}
