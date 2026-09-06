// เขียนส่วนที่ 1 ของ docs/uat/skouth-uat.md ใหม่จาก lib/help/guide.ts
//
//   npx tsx scripts/sync-guide-doc.ts
//
// รันหลังแก้เนื้อหาคู่มือ แล้ว `npm test` จะเขียว — lib/help/guide.test.ts
// เทียบไฟล์บนดิสก์กับ renderGuideMarkdown() แบบตัวต่อตัว
//
// สคริปต์แตะเฉพาะช่วงระหว่างหัวข้อ "## ส่วนที่ 1" กับ "## ส่วนที่ 2" เท่านั้น
// ตาราง UAT ในส่วนที่ 2 เขียนด้วยมือและต้องไม่ถูกทับ
import { readFileSync, writeFileSync } from 'node:fs'
import { renderGuideMarkdown } from '../lib/help/guide'

const DOC = 'docs/uat/skouth-uat.md'
const START = '## ส่วนที่ 1 — คู่มือการใช้งาน'
const END = '## ส่วนที่ 2'

const src = readFileSync(DOC, 'utf8')
const startAt = src.indexOf(START)
const endAt = src.indexOf(END)

// ถ้าหาหัวข้อไม่เจอ ให้ตายดังๆ ดีกว่าเขียนทับผิดที่แล้วกลืนตาราง UAT ไปทั้งชุด
if (startAt === -1 || endAt === -1 || endAt < startAt) {
  throw new Error(`หาขอบเขตส่วนที่ 1 ใน ${DOC} ไม่เจอ — ตรวจว่าหัวข้อยังเขียนเหมือนเดิมไหม`)
}

const before = src.slice(0, startAt)
const after = src.slice(endAt)
const body = `${START}\n\n${renderGuideMarkdown()}\n\n---\n\n`

const next = before + body + after
if (next === src) {
  console.log('ตรงกันอยู่แล้ว ไม่มีอะไรต้องแก้')
} else {
  writeFileSync(DOC, next, 'utf8')
  console.log(`เขียน ${DOC} ใหม่แล้ว`)
}
