import { readFileSync } from 'node:fs'
import Papa from 'papaparse'
import { parseLinkedInCsv, isKnownColumn } from '../lib/ingest/linkedin'
import { classifyRow } from '../lib/ingest/classify'

// ตรวจว่าไฟล์ CSV จาก PhantomBuster เข้ากันได้กับ parser ของเราไหม
//
//   npx tsx scripts/check-linkedin-csv.ts <path-to.csv>
//
// **ไม่แตะฐานข้อมูล ไม่เรียก Gemini ไม่ต่อเน็ตเลย** จึงรันได้ทุกที่และรันซ้ำได้ฟรี
//
// ============================================================================
// ทำไมต้องมีสคริปต์นี้
// ============================================================================
// PhantomBuster มี phantom หลายตัวและตั้งชื่อคอลัมน์ไม่เหมือนกัน ไฟล์ไม่ได้บอกว่า
// มาจากตัวไหน **ความล้มเหลวที่แพงที่สุดคือคอลัมน์ที่เราไม่รู้จัก** เพราะค่านั้น
// จะหายไปเงียบๆ ไม่มี error ไม่มีคำเตือน ข้อมูลแค่ไม่ถึงฐานข้อมูล
// รายงาน "คอลัมน์ที่ไม่รู้จัก" ข้างล่างคือสิ่งที่จับเคสนั้นได้
//
// เจอจริง 2026-09-13: ทดสอบกับ LinkedIn จริงไม่ได้เพราะบัญชีใหม่เกินไป
// LinkedIn คืนผลเป็น "LinkedIn Member" ที่ไม่มีชื่อและไม่มีลิงก์โปรไฟล์
// สคริปต์นี้จึงเป็นทางเดียวที่พิสูจน์ท่อได้โดยไม่ต้องพึ่งบัญชี LinkedIn

const path = process.argv[2]
if (!path) {
  console.error('ใช้: npx tsx scripts/check-linkedin-csv.ts <path-to.csv>')
  process.exit(1)
}

const text = readFileSync(path, 'utf8')

// ---------------------------------------------------------------------------
// 1. คอลัมน์ในไฟล์ เทียบกับที่ parser รู้จัก
// ---------------------------------------------------------------------------
const { meta } = Papa.parse(text, { header: true, preview: 1 })
const headers = (meta.fields ?? []).filter((h) => h?.trim())
const unknown = headers.filter((h) => !isKnownColumn(h))

console.log(`\nไฟล์: ${path}`)
console.log(`คอลัมน์ทั้งหมด ${headers.length} · parser รู้จัก ${headers.length - unknown.length}`)

if (unknown.length) {
  console.log(`\n⚠ คอลัมน์ที่ parser ไม่รู้จัก ${unknown.length} คอลัมน์ — ค่าเหล่านี้จะหายไปเงียบๆ`)
  for (const h of unknown) console.log(`    ${h}`)
  console.log('  ถ้าคอลัมน์ไหนควรถูกใช้ ให้เพิ่ม alias ใน lib/ingest/linkedin.ts')
} else {
  console.log('✓ ไม่มีคอลัมน์ที่ถูกทิ้งโดยไม่ตั้งใจ')
}

// ---------------------------------------------------------------------------
// 2. แยกวิเคราะห์แล้วจัดประเภททีละแถว
// ---------------------------------------------------------------------------
const rows = parseLinkedInCsv(text)
const totalLines = (Papa.parse(text, { header: true, skipEmptyLines: true }).data as unknown[]).length
const droppedNoName = totalLines - rows.length

console.log(`\nแถวในไฟล์ ${totalLines} · แยกวิเคราะห์ได้ ${rows.length}`)
if (droppedNoName > 0) {
  console.log(
    `  ${droppedNoName} แถวถูกทิ้งเพราะไม่มีชื่อ — ปกติสำหรับแถวที่ scrape ไม่สำเร็จ` +
      ' หรือโปรไฟล์ที่ LinkedIn ปิดบังตัวตน ("LinkedIn Member")'
  )
}

let ready = 0
const queued: { name: string; missing: string[] }[] = []

console.log('\nรายแถว')
for (const r of rows) {
  const missing = classifyRow(r)
  const edu = r.education?.length ?? 0
  const exp = r.experience?.length ?? 0
  const sk = r.skills?.length ?? 0
  const detail = `edu ${edu} · exp ${exp} · skills ${sk}`

  if (missing.length) {
    queued.push({ name: r.full_name, missing })
    console.log(`  คิว  ${r.full_name.padEnd(24)} ${detail}  ขาด: ${missing.join(', ')}`)
  } else {
    ready++
    console.log(`  เข้า ${r.full_name.padEnd(24)} ${detail}`)
  }
}

console.log(`\nสรุป: เข้า candidates ${ready} · เข้าคิวรอตรวจ ${queued.length}`)

// ---------------------------------------------------------------------------
// 3. เกณฑ์ไหนทำให้ตกคิวบ่อยที่สุด
// ---------------------------------------------------------------------------
// ตัวเลขนี้บอกว่าควรแก้อะไรก่อน — ถ้าทุกแถวขาด education เหมือนกันหมด
// แปลว่า phantom ตัวนี้ไม่มีคอลัมน์นั้น ไม่ใช่ว่าคนเหล่านั้นไม่ได้เรียนหนังสือ
if (queued.length) {
  const tally = new Map<string, number>()
  for (const q of queued) for (const m of q.missing) tally.set(m, (tally.get(m) ?? 0) + 1)

  console.log('\nเกณฑ์ที่ทำให้ตกคิว')
  for (const [field, n] of [...tally].sort((a, b) => b[1] - a[1])) {
    const allRows = n === queued.length && queued.length === rows.length
    console.log(`  ${field.padEnd(14)} ${n} แถว${allRows ? '  ← ทุกแถว: phantom นี้น่าจะไม่มีคอลัมน์นี้' : ''}`)
  }
}

// ---------------------------------------------------------------------------
// 4. ตัวอย่างแถวแรกแบบเต็ม ไว้ดูด้วยตาว่าค่าลงถูกช่อง
// ---------------------------------------------------------------------------
// ตัวเลขสรุปบอกว่า "ครบ" ได้ แต่บอกไม่ได้ว่า "ถูก" — ตำแหน่งงานอาจไปลงช่องบริษัท
// แล้วยังนับว่าครบอยู่ดี ต้องมีคนอ่านของจริงอย่างน้อยหนึ่งแถว
if (rows[0]) {
  console.log('\nแถวแรกแบบเต็ม (ตรวจด้วยตาว่าค่าลงถูกช่อง)')
  console.log(JSON.stringify({ ...rows[0], raw: undefined }, null, 2))
}
