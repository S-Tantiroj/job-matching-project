import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { codesInUatDoc, parseResults, summarize } from './results'

describe('parseResults', () => {
  test('อ่านสถานะและหมายเหตุ', () => {
    const rows = parseResults(['AU-01 ผ่าน', 'AU-02 ไม่ผ่าน ปุ่มไม่ขึ้น', 'AU-03'].join('\n'))
    expect(rows).toEqual([
      { code: 'AU-01', status: 'pass', note: '', line: 1 },
      { code: 'AU-02', status: 'fail', note: 'ปุ่มไม่ขึ้น', line: 2 },
      { code: 'AU-03', status: 'todo', note: '', line: 3 },
    ])
  })

  test('ข้ามหัวเรื่อง คำอธิบาย และคอมเมนต์', () => {
    const rows = parseResults(
      ['# หัวเรื่อง', '> วิธีกรอก', '<!-- กลุ่ม -->', '', 'AU-01 ผ่าน'].join('\n'),
    )
    expect(rows.map((r) => r.code)).toEqual(['AU-01'])
  })

  test('"ไม่ผ่าน" ไม่ถูกอ่านเป็น "ผ่าน"', () => {
    // สองคำนี้ต่างกันแค่คำนำหน้า และเป็นคู่ที่สลับกันแล้วเสียหายที่สุดในไฟล์นี้
    expect(parseResults('AU-01 ไม่ผ่าน')[0].status).toBe('fail')
  })

  test('คำที่ไม่ใช่สองคำนี้ต้อง error พร้อมเลขบรรทัด', () => {
    // **ห้ามกลืนเป็น todo** — เคสที่ทดสอบไปแล้วจะหายจากยอดเงียบๆ
    expect(() => parseResults('AU-01 ผ่าน\nAU-02 pass')).toThrow(/บรรทัด 2/)
    expect(() => parseResults('AU-01 ผ่านบางส่วน')).toThrow(/ผ่านบางส่วน/)
  })

  test('บรรทัดที่ไม่ขึ้นต้นด้วยรหัสเคสต้อง error', () => {
    expect(() => parseResults('ทำถึง AU-05 แล้ว')).toThrow(/บรรทัด 1/)
  })

  test('รหัสซ้ำต้อง error', () => {
    // ผลสองค่าของเคสเดียวกันที่ขัดกันเอง โดยไม่มีอะไรบอกว่าอันไหนคือของจริง
    expect(() => parseResults('AU-01 ผ่าน\nAU-01 ไม่ผ่าน')).toThrow(/ซ้ำ/)
  })

  test('ตัดขีดนำหน้าหมายเหตุออก', () => {
    expect(parseResults('AU-01 ไม่ผ่าน — ปุ่มหาย')[0].note).toBe('ปุ่มหาย')
  })
})

describe('summarize', () => {
  const rows = parseResults(
    ['AU-01 ผ่าน', 'AU-02 ไม่ผ่าน พัง', 'AU-03', 'AU-04'].join('\n'),
  )

  test('นับครบและชี้เคสถัดไปที่ยังไม่ได้ทำ', () => {
    const p = summarize(rows)
    expect(p).toMatchObject({ total: 4, pass: 1, fail: 1, todo: 2, done: 2, next: 'AU-03' })
    expect(p.failed.map((r) => r.code)).toEqual(['AU-02'])
  })

  test('ทำครบแล้ว next เป็น null', () => {
    expect(summarize(parseResults('AU-01 ผ่าน')).next).toBeNull()
  })
})

describe('ไฟล์จริง', () => {
  const dir = resolve(process.cwd(), 'docs/uat')
  const read = (f: string) => readFileSync(resolve(dir, f), 'utf8')

  // **อ่านไฟล์ใน test() ไม่ใช่นอกมัน** — วางไว้ระดับโมดูลแล้ว results.md ที่เสีย
  // บรรทัดเดียวจะทำให้ทั้งไฟล์ collect ไม่ผ่าน แล้ว**เทสต์ของ parser เองไม่ได้รันเลย**
  // ทั้งที่ parser ไม่ได้ผิดอะไร (เกิดขึ้นจริง 15 ก.ย. — รายงานขึ้น "no tests")
  // เทสต์ที่ตายเพราะข้อมูลของคนอื่นคือเทสต์ที่พิสูจน์อะไรไม่ได้ในวันที่ต้องการมันที่สุด
  const rows = () => parseResults(read('results.md'))
  const docCodes = () => [
    ...codesInUatDoc(read('skouth-uat.md')),
    ...codesInUatDoc(read('skouth-uat-technical.md')),
  ]

  test('results.md อ่านได้โดยไม่ error', () => {
    expect(rows().length).toBeGreaterThan(0)
  })

  // **เทสต์สองข้อนี้คือเหตุผลที่ไฟล์ผลไม่หลุดจากตาราง UAT**
  // เพิ่มเคสในตารางแล้วลืมเพิ่มที่นี่ = เคสนั้นไม่มีที่ให้บันทึกผล และหายจากยอด
  // ลบเคสออกจากตารางแล้วลืมลบที่นี่ = ยอดรวมบอกว่าเหลืองานที่ไม่มีอยู่จริง
  test('ทุกเคสในเอกสารมีที่บันทึกผล', () => {
    const r = rows()
    const missing = docCodes().filter((c) => !r.some((x) => x.code === c))
    expect(missing).toEqual([])
  })

  test('ไม่มีรหัสใน results.md ที่ไม่มีในเอกสาร', () => {
    const codes = docCodes()
    const extra = rows().map((r) => r.code).filter((c) => !codes.includes(c))
    expect(extra).toEqual([])
  })
})
