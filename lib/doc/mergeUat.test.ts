import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { countUatCases, mergeUatDocs } from './mergeUat'

const USER_MD = resolve(process.cwd(), 'docs/uat/skouth-uat.md')
const TECH_MD = resolve(process.cwd(), 'docs/uat/skouth-uat-technical.md')
const PREP_MD = resolve(process.cwd(), 'docs/uat/skouth-uat-dev-prep.md')

describe('countUatCases', () => {
  test('นับเฉพาะแถวที่ขึ้นต้นด้วยรหัสเคส', () => {
    const md = [
      '| รหัส | ส่วน |',
      '|---|---|',
      '| AU-01 | เข้าสู่ระบบ |',
      '| AU-02 | เข้าสู่ระบบ |',
      '| ไม่ใช่เคส | อะไรสักอย่าง |',
    ].join('\n')
    expect(countUatCases(md)).toBe(2)
  })

  test('ข้อความที่พูดถึงรหัสเคสกลางบรรทัดไม่ถูกนับ', () => {
    // "ดูเพิ่มที่ AD-02" ในย่อหน้าอธิบาย ไม่ใช่แถวในตาราง
    expect(countUatCases('ทำ ST-11 ให้เสร็จก่อน แล้วค่อยทำ | ST-12 | ต่อ')).toBe(0)
  })

  test('เอกสารว่างได้ศูนย์ ไม่ใช่ error', () => {
    expect(countUatCases('')).toBe(0)
  })
})

describe('mergeUatDocs', () => {
  const user = '| AU-01 | ก |\n| AU-02 | ข |'
  const tech = '| AD-02 | ค |'

  test('เคสจากทั้งสองฉบับอยู่ครบในผลลัพธ์', () => {
    const out = mergeUatDocs(user, tech)
    expect(out).toContain('| AU-01 |')
    expect(out).toContain('| AU-02 |')
    expect(out).toContain('| AD-02 |')
    expect(countUatCases(out)).toBe(3)
  })

  test('ยอดรวมคำนวณจากเนื้อหาจริง ไม่ใช่ตัวเลขที่เขียนไว้', () => {
    // เพิ่มเคสหนึ่งข้อแล้วยอดต้องขยับเอง — นี่คือสิ่งที่ตัวเลข hardcode ทำไม่ได้
    expect(mergeUatDocs(user, tech)).toContain('**รวม: 3**')
    expect(mergeUatDocs(`${user}\n| AU-03 | ง |`, tech)).toContain('**รวม: 4**')
  })

  test('งานเตรียมอยู่ก่อนเคสแรก ไม่ใช่ท้ายเล่ม', () => {
    // วางท้ายเล่มเท่ากับไม่ได้เขียน — กว่าจะอ่านถึงก็ทดสอบไปหมดแล้ว
    const out = mergeUatDocs(user, tech, '# งานเตรียม\n\nรัน seed ก่อน')
    expect(out.indexOf('# งานเตรียม')).toBeLessThan(out.indexOf('| AU-01 |'))
  })

  test('ไม่ส่งงานเตรียมมาก็ไม่มีเส้นคั่นเปล่าค้างอยู่', () => {
    // ช่องว่างที่เว้นไว้รอเนื้อหาที่ไม่มา ทำให้เอกสารดูเหมือนมีส่วนที่หายไป
    const out = mergeUatDocs('# หัวเรื่องผู้ใช้\n\n| AU-01 | ก |', tech)
    expect(out.split('# หัวเรื่องผู้ใช้')[0]).not.toContain('---')
  })

  test('เตือนว่าห้ามแก้ไฟล์ที่สร้างอัตโนมัติ และบอกว่าต้องไปแก้ที่ไหน', () => {
    const out = mergeUatDocs(user, tech)
    expect(out).toContain('ห้ามแก้ด้วยมือ')
    expect(out).toContain('docs/uat/skouth-uat.md')
    expect(out).toContain('docs/uat/skouth-uat-technical.md')
  })
})

describe('ไฟล์ต้นทางจริงสองไฟล์', () => {
  const userMd = readFileSync(USER_MD, 'utf8')
  const techMd = readFileSync(TECH_MD, 'utf8')
  const prepMd = readFileSync(PREP_MD, 'utf8')

  test('ไฟล์งานเตรียมไม่มีเคส จึงไม่ทำให้ยอดรวมเพี้ยน', () => {
    expect(countUatCases(prepMd)).toBe(0)
  })

  test('ฉบับผู้พัฒนาจริงได้ครบทั้ง 3 ส่วน', () => {
    const dev = mergeUatDocs(userMd, techMd, prepMd)
    expect(countUatCases(dev)).toBe(countUatCases(userMd) + countUatCases(techMd))
    expect(dev).toContain('งานเตรียมก่อนส่งเอกสารให้ผู้ทดสอบ')
    expect(dev).toContain('ส่วนเพิ่มเติมสำหรับผู้พัฒนา')
  })

  test('ไม่มีรหัสเคสซ้ำกันระหว่างสองไฟล์', () => {
    // **นี่คือเทสต์ที่สำคัญที่สุดในไฟล์นี้** — ถ้าวันไหนมีคนคัดลอกเคสจากฉบับผู้ใช้
    // ไปไว้ในฉบับผู้พัฒนาด้วย ฉบับรวมจะมีแถวนั้นสองครั้งพร้อมช่องกรอกผลสองช่อง
    // ที่ขัดกันเองได้ และไม่มีอะไรบอกว่าช่องไหนคือของจริง
    const codes = (md: string) =>
      (md.match(/^\| ([A-Z]{2}-\d\d) \|/gm) ?? []).map((m) => m.slice(2, 7))
    const overlap = codes(userMd).filter((c) => codes(techMd).includes(c))
    expect(overlap).toEqual([])
  })

  test('รหัสเคสไม่ซ้ำกันเองภายในแต่ละไฟล์', () => {
    for (const md of [userMd, techMd]) {
      const codes = (md.match(/^\| ([A-Z]{2}-\d\d) \|/gm) ?? []).map((m) => m.slice(2, 7))
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  test('ฉบับรวมได้ครบทุกเคสของทั้งสองไฟล์', () => {
    expect(countUatCases(mergeUatDocs(userMd, techMd))).toBe(
      countUatCases(userMd) + countUatCases(techMd),
    )
  })

  // ฉบับผู้ใช้เป็นเอกสารกระดาษที่ผู้ทดสอบใช้เช็คว่าทำครบหรือยัง ตัวเลขจึงต้องอ่านได้
  // ในตัวมันเอง — แต่ตัวเลขที่พิมพ์ไว้จะค้างเมื่อมีการเพิ่มหรือลบเคส เทสต์นี้คือสิ่งที่
  // ทำให้มันค้างไม่ได้ (หลักเดียวกับ JOB_TEXT_LIMITS ที่ hardcode คู่กับลูป)
  test('ตัวเลขสรุปในฉบับผู้ใช้ตรงกับจำนวนเคสจริง', () => {
    const user = countUatCases(userMd)
    const tech = countUatCases(techMd)
    expect(userMd).toContain(`จำนวนเคสทั้งหมด: ${user}   ผ่าน:`)
    expect(userMd).toContain(`อีก ${tech} เคสที่ต้องใช้เครื่องมือของผู้พัฒนา`)
    expect(userMd).toContain(`รวมทั้งระบบ ${user + tech} เคส`)
  })
})
