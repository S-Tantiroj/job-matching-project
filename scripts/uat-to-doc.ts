import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mdToHtmlBody, wrapWordHtml } from '../lib/doc/mdToWordHtml'
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

const SRC = resolve(process.cwd(), 'docs/uat/skouth-uat.md')
const OUT = resolve(process.cwd(), 'docs/uat/skouth-uat.doc')

const md = readFileSync(SRC, 'utf8')
const body = mdToHtmlBody(md)

// ต่อท้ายด้วยเวอร์ชันที่เอกสารนี้อ้างถึง — ตาราง UAT ที่ไม่บอกว่าทดสอบเวอร์ชันไหน
// ตรวจสอบย้อนกลับไม่ได้ (ดู lib/version.ts)
const stamp = `<p class="note">เอกสารนี้สร้างจาก <code>docs/uat/skouth-uat.md</code> · ระบบ ${versionLabel()}</p>`

writeFileSync(OUT, wrapWordHtml('Skouth — แบบทดสอบการยอมรับระบบ', `${body}\n${stamp}`), 'utf8')

const rows = (md.match(/^\| [A-Z]{2}-\d\d \|/gm) ?? []).length
console.log(`เขียนแล้ว: ${OUT}`)
console.log(`จำนวนเคสในตาราง: ${rows}`)
console.log('เปิดด้วย Word → กด Yes ตอนเตือนเรื่องนามสกุล → Save As .docx ถ้าต้องการ')
