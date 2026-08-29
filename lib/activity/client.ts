import type { Action } from './log'

// เรียกจาก client component เท่านั้น — ยิงแล้วลืม
//
// การบันทึกไม่ควรทำให้สิ่งที่ผู้ใช้เพิ่งทำสำเร็จดูเหมือนล้มเหลว จึงไม่ await ผลลัพธ์
// และกลืน error ทุกชนิด รวมถึงตอนออฟไลน์
export function track(action: Action, summary: string, entityId?: string): void {
  void fetch('/api/activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, summary, entityId }),
  }).catch(() => {})
}
