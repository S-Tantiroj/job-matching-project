// อ่านการตั้งค่า PhantomBuster แล้วบอกว่าอยู่ในสภาวะไหนใน "สาม" สภาวะ
//
// **ทำไมต้องสามสภาวะ ไม่ใช่สอง**
//
// เดิมสคริปต์ sync มีแค่ "มีค่า" กับ "โยน error" ผลคือสภาวะที่คาดไว้อยู่แล้ว —
// ยังไม่ได้สมัครบริการ จึงยังไม่ได้ตั้ง secret — ถูกรายงานเป็น
// `unexpected: PHANTOMBUSTER_AGENT_ID is not set` แล้ว GitHub Actions ขึ้นกากบาทแดง
// ทุกคืน ซึ่งผิดสองชั้น: คำว่า "unexpected" ส่งคนไปหาบั๊กในโค้ดที่ไม่มีอยู่ และ
// **กากบาทแดงที่แก้ไม่ได้สอนให้คนเลิกสนใจกากบาทแดง** วันที่มันแดงเพราะเรื่องจริง
// จะไม่มีใครทันสังเกต (หลักการเดียวกับ tolerateOutage ในชุดเทสต์ integration)
//
// **แต่การให้ "ไม่มีค่า" ผ่านเงียบๆ เสมอก็ผิด** — วันที่ใครลบ secret ทิ้งโดยไม่ตั้งใจ
// หลังจากที่ระบบเคยทำงานได้แล้ว ความเงียบคือการซ่อนปัญหาจริง
//
// ทางออกคือแยก "ยังไม่ได้ตั้งค่าเลย" (ตั้งใจ) ออกจาก "ตั้งค่าไม่ครบ" (ผิดพลาด)
// ค่าที่ขาดไปบางส่วนแปลว่ามีคนตั้งใจตั้งแล้วทำพลาด ซึ่งต้องดังเสมอ

export const PHANTOMBUSTER_VARS = ['PHANTOMBUSTER_API_KEY', 'PHANTOMBUSTER_AGENT_ID'] as const

export type PhantombusterConfig =
  /** ครบพร้อมใช้ */
  | { kind: 'ok'; apiKey: string; agentId: string }
  /** ยังไม่ได้ตั้งค่าเลยสักตัว — เป็นสภาวะที่ยอมรับได้ ไม่ใช่ความล้มเหลว */
  | { kind: 'not-configured'; missing: string[] }
  /** ตั้งมาบางตัว ขาดบางตัว — มีคนตั้งใจตั้งแล้วพลาด ต้องดัง */
  | { kind: 'incomplete'; missing: string[]; present: string[] }

/**
 * รับ env มาเป็นพารามิเตอร์ ไม่อ่าน `process.env` เอง เพื่อให้ทดสอบได้โดยไม่ต้อง
 * ไปยุ่งกับ environment จริงของกระบวนการที่กำลังรันเทสต์อยู่
 *
 * **ค่าที่เป็นช่องว่างล้วนนับว่าไม่มี** — GitHub Actions แทน `${{ secrets.X }}`
 * ที่ไม่มีอยู่ด้วยสตริงว่าง ไม่ใช่ปล่อยให้ตัวแปรหายไป การเช็คแค่ `undefined`
 * จึงมองไม่เห็นกรณีที่พบบ่อยที่สุด
 */
export function readPhantombusterConfig(
  env: Record<string, string | undefined>
): PhantombusterConfig {
  const value = (name: string) => (env[name] ?? '').trim()

  const missing = PHANTOMBUSTER_VARS.filter((n) => !value(n))
  const present = PHANTOMBUSTER_VARS.filter((n) => !!value(n))

  if (!missing.length) {
    return {
      kind: 'ok',
      apiKey: value('PHANTOMBUSTER_API_KEY'),
      agentId: value('PHANTOMBUSTER_AGENT_ID'),
    }
  }

  if (!present.length) return { kind: 'not-configured', missing: [...missing] }

  return { kind: 'incomplete', missing: [...missing], present: [...present] }
}

/** ข้อความอธิบายสภาวะ สำหรับพิมพ์ลง log ของ CI */
export function describePhantombusterConfig(c: PhantombusterConfig): string {
  switch (c.kind) {
    case 'ok':
      return 'phantombuster config ok'
    case 'not-configured':
      return [
        'ข้ามรอบนี้ — ยังไม่ได้ตั้งค่า PhantomBuster',
        `ยังไม่มี: ${c.missing.join(', ')}`,
        'เมื่อมีบัญชีแล้ว ตั้งค่าที่ Settings → Secrets and variables → Actions',
        'แล้วเปิดตาราง cron ใน .github/workflows/sync-candidates.yml กลับมา',
      ].join('\n')
    case 'incomplete':
      return [
        'ตั้งค่า PhantomBuster ไม่ครบ',
        `ตั้งแล้ว: ${c.present.join(', ')}`,
        `ยังขาด: ${c.missing.join(', ')}`,
      ].join('\n')
  }
}
