// รวมเอกสาร UAT สองฉบับเป็นฉบับผู้พัฒนาที่มีครบทุกเคส
//
// **ห้ามคัดลอกแถวไปไว้สองไฟล์** — ตาราง UAT ถูกแก้แทบทุกวันระหว่างการทดสอบ
// สองสำเนาจะเริ่มไม่ตรงกันภายในไม่กี่วัน แล้วไม่มีใครรู้ว่าฉบับไหนคือของจริง
// (เกิดมาแล้วกับท้ายหน้าของกลุ่ม `(public)` ที่ถูกคัดลอกไว้สี่ที่)
//
// ต้นทางจึงมีสามไฟล์ที่ **ไม่มีแถวซ้ำกันเลย**:
//   docs/uat/skouth-uat-dev-prep.md   — งานเตรียมของผู้พัฒนา (ไม่มีเคส)
//   docs/uat/skouth-uat.md            — เคสที่ผู้ใช้ทั่วไปทำได้
//   docs/uat/skouth-uat-technical.md  — เคสที่ต้องใช้เครื่องมือของผู้พัฒนา
// แล้วฉบับรวมถูกสร้างขึ้นใหม่ทุกครั้งที่รันสคริปต์

/** นับเคสจากรูปแบบรหัส เช่น `| AU-01 |` ที่ต้นบรรทัด */
export function countUatCases(md: string): number {
  return (md.match(/^\| [A-Z]{2}-\d\d \|/gm) ?? []).length
}

/**
 * ประกอบฉบับผู้พัฒนา
 *
 * **นับยอดรวมจากเนื้อหาจริง ไม่ใช่เขียนตัวเลขไว้** — ตัวเลขที่พิมพ์ทิ้งไว้จะค้าง
 * ที่ค่าเดิมทุกครั้งที่เพิ่มเคส แล้วเอกสารจะโกหกโดยไม่มีใครสังเกต
 */
export function mergeUatDocs(
  userMd: string,
  technicalMd: string,
  prepMd = '',
): string {
  const userCount = countUatCases(userMd)
  const techCount = countUatCases(technicalMd)

  const banner = [
    '> **ฉบับนี้สร้างอัตโนมัติ ห้ามแก้ด้วยมือ**',
    '> แก้ที่ `docs/uat/skouth-uat.md` (เคสสำหรับผู้ใช้),',
    '> `docs/uat/skouth-uat-technical.md` (เคสของผู้พัฒนา) หรือ',
    '> `docs/uat/skouth-uat-dev-prep.md` (งานเตรียม) แล้วรัน',
    '> `npx tsx scripts/uat-to-doc.ts` ใหม่',
    '',
  ].join('\n')

  // **งานเตรียมอยู่หน้าสุด ไม่ใช่ท้ายเล่ม** — มันคือสิ่งที่ต้องทำก่อนเริ่มทดสอบ
  // วางไว้ท้ายเล่มก็เท่ากับไม่ได้เขียน เพราะกว่าจะอ่านถึงก็ทำไปหมดแล้ว
  const prep = prepMd.trim() ? `${prepMd.trimEnd()}\n\n---\n\n` : ''

  const grandTotal = [
    '',
    '---',
    '',
    '## รวมทั้งสองส่วน',
    '',
    `เคสสำหรับผู้ใช้: ${userCount}   เคสของผู้พัฒนา: ${techCount}   **รวม: ${userCount + techCount}**`,
    '',
    'ผ่านทั้งหมด: ______   ไม่ผ่านทั้งหมด: ______',
    '',
    'ลงชื่อผู้พัฒนา: ______________________',
    '',
  ].join('\n')

  return `${banner}\n${prep}${userMd.trimEnd()}\n\n---\n\n${technicalMd.trimEnd()}\n${grandTotal}`
}
