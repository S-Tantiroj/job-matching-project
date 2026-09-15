import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseResults, summarize } from '../lib/uat/results'

// สรุปความคืบหน้า UAT จาก docs/uat/results.md
//
//   npx tsx scripts/uat-progress.ts
//
// ไม่แตะฐานข้อมูล ไม่เรียก Gemini ไม่ต่อเน็ต รันซ้ำได้ฟรี
// **ไม่เขียนอะไรทั้งนั้น** — ไฟล์ผลเป็นของคนกรอก ไม่ใช่ของสคริปต์

const file = resolve(process.cwd(), 'docs/uat/results.md')
const p = summarize(parseResults(readFileSync(file, 'utf8')))

const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
const filled = Math.round((p.done / Math.max(p.total, 1)) * 30)

console.log('')
console.log(`[${'█'.repeat(filled)}${'·'.repeat(30 - filled)}] ${pct}%`)
console.log('')
console.log(`ทำแล้ว ${p.done} จาก ${p.total} เคส   ผ่าน ${p.pass}   ไม่ผ่าน ${p.fail}   เหลือ ${p.todo}`)

if (p.failed.length) {
  console.log('')
  console.log('เคสที่ไม่ผ่าน:')
  for (const r of p.failed) console.log(`  ${r.code}  ${r.note || '(ไม่ได้เขียนหมายเหตุ)'}`)
}

console.log('')
console.log(p.next ? `เคสถัดไป: ${p.next}` : 'ทำครบทุกเคสแล้ว')
console.log('')
