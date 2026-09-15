import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mdToHtmlBody, wrapWordHtml } from '../lib/doc/mdToWordHtml'
import { mergeUatDocs } from '../lib/doc/mergeUat'
import { versionLabel } from '../lib/version'

// สร้างไฟล์ Word จากเอกสาร UAT
//
//   npx tsx scripts/uat-to-doc.ts
//
// **รันซ้ำได้ทุกครั้งที่กรอกผลเพิ่ม** — นี่คือเหตุผลที่ทำเป็นสคริปต์แทนไฟล์ครั้งเดียว
// ตาราง UAT เปลี่ยนทุกวันระหว่าง 15-18 ก.ย. ไฟล์ที่แปลงไว้ล่วงหน้าจะเก่าทันที
//
// ผลลัพธ์เป็น HTML ที่ตั้งนามสกุล .doc — Word เปิดได้ แต่จะเตือนหนึ่งครั้งว่า
// "รูปแบบไฟล์กับนามสกุลไม่ตรงกัน" ให้กด Yes แล้ว Save As เป็น .docx ถ้าต้องการ
// ไฟล์ Word แท้ **เอกสารที่ได้แก้ต่อใน Word ได้ตามปกติ ตารางกรอกด้วยมือได้**

// สร้างสองฉบับจากไฟล์ต้นทางสองไฟล์
//
//   skouth-uat.doc      ฉบับผู้ใช้   = skouth-uat.md เท่านั้น
//   skouth-uat-dev.doc  ฉบับผู้พัฒนา = dev-prep + skouth-uat.md + technical
//
// **ฉบับผู้พัฒนาต้องมีครบทุกเคส** ผู้พัฒนาต้องเห็นภาพรวมทั้งระบบ ไม่ใช่แค่สี่เคส
// ที่ผู้ใช้ทำไม่ได้ — แต่ **ไม่คัดลอกแถวไปไว้สองไฟล์** เพราะสำเนาจะเริ่มไม่ตรงกัน
// ภายในไม่กี่วันของการทดสอบ ฉบับรวมจึงประกอบขึ้นใหม่ทุกครั้งที่รันสคริปต์นี้

const dir = resolve(process.cwd(), 'docs/uat')
const userMd = readFileSync(resolve(dir, 'skouth-uat.md'), 'utf8')
const techMd = readFileSync(resolve(dir, 'skouth-uat-technical.md'), 'utf8')
const prepMd = readFileSync(resolve(dir, 'skouth-uat-dev-prep.md'), 'utf8')

const DOCS = [
  {
    file: 'skouth-uat.doc',
    title: 'Skouth — แบบทดสอบการยอมรับระบบ',
    md: userMd,
    from: 'docs/uat/skouth-uat.md',
  },
  {
    file: 'skouth-uat-dev.doc',
    title: 'Skouth — แบบทดสอบการยอมรับระบบ (ฉบับผู้พัฒนา · ครบทุกเคส)',
    md: mergeUatDocs(userMd, techMd, prepMd),
    from: 'skouth-uat-dev-prep.md + skouth-uat.md + skouth-uat-technical.md',
  },
]

for (const doc of DOCS) {
  const out = resolve(dir, doc.file)

  // ต่อท้ายด้วยเวอร์ชันที่เอกสารนี้อ้างถึง — ตาราง UAT ที่ไม่บอกว่าทดสอบเวอร์ชันไหน
  // ตรวจสอบย้อนกลับไม่ได้ (ดู lib/version.ts)
  const stamp = `<p class="note">สร้างจาก <code>${doc.from}</code> · ระบบ ${versionLabel()}</p>`

  writeFileSync(out, wrapWordHtml(doc.title, `${mdToHtmlBody(doc.md)}\n${stamp}`), 'utf8')

  const rows = (doc.md.match(/^\| [A-Z]{2}-\d\d \|/gm) ?? []).length
  console.log(`เขียนแล้ว: ${out}  (${rows} เคส)`)
}

console.log('เปิดด้วย Word → กด Yes ตอนเตือนเรื่องนามสกุล → Save As .docx ถ้าต้องการ')
