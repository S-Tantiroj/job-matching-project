import { getServerClient } from '@/lib/supabase/server'
import type { BarDatum } from '@/components/dashboard/BarList'

// สถิติสำหรับกราฟบน Dashboard — อ่านผ่าน RPC ของ migration 020
//
// **คืน `failed` มาด้วยเสมอ ไม่กลืน error ให้กลายเป็นรายการว่าง**
// นี่คือบั๊กเดียวกับที่ `lib/search/query.ts` เคยทำ: RPC พังแล้วอ่านแค่ `data`
// ซึ่งเป็น null แล้วคืน [] ทำให้หน้าค้นหาขึ้น "ไม่พบผลลัพธ์" ทั้งที่ระบบพังสนิท
// กราฟก็เหมือนกัน — "ยังไม่มีทักษะในระบบ" กับ "อ่านสถิติไม่ได้" เป็นคนละเรื่อง
// และเรื่องแรกเป็นคำตอบที่ผู้ใช้เชื่อได้ทันทีโดยไม่สงสัยอะไร

export type StatsResult = { items: BarDatum[]; failed: boolean }

const FAILED: StatsResult = { items: [], failed: true }

/** ป้ายภาษาไทยของค่า enum `cand_source` */
export const SOURCE_LABELS: Record<string, string> = {
  synthetic: 'ข้อมูลจำลอง',
  csv: 'นำเข้าจาก CSV',
  upload: 'อัปโหลด Resume',
  scraper: 'ดึงอัตโนมัติ',
}

/**
 * ค่าที่ไม่รู้จักคืนค่าดิบ ไม่ใช่ "อื่นๆ" หรือสตริงว่าง
 *
 * ถ้าวันหน้ามีคนเพิ่มค่าใน enum `cand_source` แล้วลืมมาเติมป้ายที่นี่ แท่งนั้น
 * ต้องยังแสดงพร้อมชื่อจริงให้เห็นว่ามีอยู่ การยุบเป็น "อื่นๆ" จะทำให้แหล่งข้อมูล
 * ใหม่หายเข้าไปในกองรวมโดยไม่มีใครสังเกต ซึ่งขัดกับเหตุผลที่ทำกราฟนี้ —
 * มันมีไว้ตอบว่าข้อมูลในระบบมาจากไหนบ้าง (หลักฐาน PDPA)
 */
export function sourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? value
}

export async function getTopSkills(limit = 10): Promise<StatsResult> {
  const { data, error } = await getServerClient().rpc('top_skills', { p_limit: limit })
  if (error) {
    console.error('top_skills failed:', error.message)
    return FAILED
  }
  return {
    items: ((data ?? []) as any[]).map((r) => ({ label: r.name, value: Number(r.cnt) })),
    failed: false,
  }
}

export async function getSourceCounts(): Promise<StatsResult> {
  const { data, error } = await getServerClient().rpc('candidate_source_counts')
  if (error) {
    console.error('candidate_source_counts failed:', error.message)
    return FAILED
  }
  return {
    items: ((data ?? []) as any[]).map((r) => ({
      label: sourceLabel(r.source),
      value: Number(r.cnt),
    })),
    failed: false,
  }
}
