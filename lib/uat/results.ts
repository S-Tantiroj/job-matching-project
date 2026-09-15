// อ่านไฟล์บันทึกผล UAT (docs/uat/results.md)
//
// **ทำไมต้องมีไฟล์นี้แยกจากตาราง UAT** — ตาราง `☐ ผ่าน ☐ ไม่ผ่าน` ใน `.md`
// ติ๊กไม่ได้ (มันเป็นตัวอักษร ไม่ใช่ช่องกด) และการกรอกในไฟล์ `.doc` ที่เปิดใน Word
// **จะถูก `scripts/uat-to-doc.ts` เขียนทับหายทั้งหมด** เพราะสคริปต์นั้นสร้างไฟล์ใหม่
// ทุกครั้งที่รัน · ไฟล์นี้จึงเป็นที่เดียวที่ผลอยู่ได้อย่างปลอดภัย และไม่มีสคริปต์ไหนเขียนมัน

export type Status = 'pass' | 'fail' | 'todo'

export type ResultRow = {
  code: string
  status: Status
  note: string
  line: number
}

export type Progress = {
  total: number
  pass: number
  fail: number
  todo: number
  done: number
  /** รหัสเคสถัดไปที่ยังไม่ได้ทำ — null เมื่อทำครบแล้ว */
  next: string | null
  failed: ResultRow[]
}

const CODE = /^([A-Z]{2}-\d\d)\b/

/**
 * แปลงไฟล์ผลเป็นรายการ
 *
 * **คำที่สะกดไม่ตรงต้องเป็น error ไม่ใช่ "ยังไม่ทำ"** — ถ้ากลืนคำแปลกๆ เป็นค่าว่าง
 * เคสที่ทดสอบไปแล้วจะหายจากยอดเงียบๆ แล้วคนจะทำซ้ำหรือคิดว่ายังเหลือทั้งที่ทำแล้ว
 * ชนิดเดียวกับ "ไม่พบผลลัพธ์" ที่ขึ้นตอนระบบค้นหาพัง
 */
export function parseResults(text: string): ResultRow[] {
  const rows: ResultRow[] = []
  const problems: string[] = []

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const s = raw.trim()
    if (!s || s.startsWith('#') || s.startsWith('>') || s.startsWith('<!--')) return

    const m = CODE.exec(s)
    if (!m) {
      problems.push(`บรรทัด ${line}: ไม่ได้ขึ้นต้นด้วยรหัสเคส — "${s}"`)
      return
    }

    const code = m[1]
    const rest = s.slice(code.length).trim()

    if (rest === '') {
      rows.push({ code, status: 'todo', note: '', line })
      return
    }

    // คำแรกคือสถานะ ที่เหลือคือหมายเหตุ
    const [word, ...restWords] = rest.split(/\s+/)
    const note = restWords.join(' ').replace(/^[—–-]\s*/, '')

    // **ต้องตรงทั้งคำ ไม่ใช่ขึ้นต้นด้วย** — "ผ่านบางส่วน" ไม่ใช่คำตอบที่ตารางนี้รับได้
    // ต้องตัดสินให้ชัดว่าผ่านหรือไม่ผ่าน แล้วเขียนรายละเอียดในหมายเหตุ
    if (word === 'ผ่าน') rows.push({ code, status: 'pass', note, line })
    else if (word === 'ไม่ผ่าน') rows.push({ code, status: 'fail', note, line })
    else problems.push(`บรรทัด ${line}: ${code} เขียนว่า "${word}" — ต้องเป็น "ผ่าน" หรือ "ไม่ผ่าน" เท่านั้น`)
  })

  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.code)) problems.push(`บรรทัด ${r.line}: ${r.code} ซ้ำ`)
    seen.add(r.code)
  }

  if (problems.length) throw new Error(`ไฟล์ผลมีปัญหา:\n- ${problems.join('\n- ')}`)
  return rows
}

export function summarize(rows: ResultRow[]): Progress {
  const pass = rows.filter((r) => r.status === 'pass').length
  const failed = rows.filter((r) => r.status === 'fail')
  const todo = rows.filter((r) => r.status === 'todo')

  return {
    total: rows.length,
    pass,
    fail: failed.length,
    todo: todo.length,
    done: pass + failed.length,
    next: todo[0]?.code ?? null,
    failed,
  }
}

/** รหัสเคสที่อยู่ในเอกสาร UAT (รูปแบบ `| XX-00 |` ที่ต้นบรรทัด) */
export function codesInUatDoc(md: string): string[] {
  return (md.match(/^\| ([A-Z]{2}-\d\d) \|/gm) ?? []).map((m) => m.slice(2, 7))
}
