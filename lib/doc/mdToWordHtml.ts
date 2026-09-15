// แปลง Markdown ของเอกสาร UAT เป็น HTML ที่ Microsoft Word เปิดได้
//
// **ทำไมไม่สร้าง .docx จริง** — .docx คือไฟล์ zip ที่ต้องเขียนเป็นไบนารี
// ส่วน Word เปิดไฟล์ HTML ที่ตั้งนามสกุลเป็น .doc ได้มาตั้งแต่ Word 2000
// แล้ว Save As เป็น .docx ต่อได้ ซึ่งเพียงพอกับงานส่งเล่ม
//
// **รองรับเฉพาะไวยากรณ์ที่ `docs/uat/skouth-uat.md` ใช้จริง** ไม่ใช่ Markdown ทั้งภาษา
// การเขียน parser ครบทุกกรณีสำหรับไฟล์เดียวคือการลงทุนที่ไม่ได้ใช้ —
// ถ้าวันหนึ่งไฟล์ต้นทางใช้ไวยากรณ์ใหม่ เพิ่มที่นี่พร้อมเทสต์

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * รูปแบบภายในบรรทัด — **ต้อง escape HTML ก่อนเสมอ**
 *
 * ไฟล์ต้นทางมี `<อีเมลของคุณ>` และ `&amp;` อยู่จริง ถ้าไม่ escape ก่อน
 * Word จะกลืนมันเป็นแท็กแล้วข้อความหายไปทั้งท่อนโดยไม่มีอะไรบอก
 * ลำดับนี้ปลอดภัยเพราะ `**` และ backtick ไม่ใช่อักขระพิเศษของ HTML
 */
export function inlineMd(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

const isTableRow = (l: string) => l.trimStart().startsWith('|')
const isTableDivider = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l)

const cells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** แปลงทั้งเอกสาร — คืนเฉพาะเนื้อ `<body>` ไม่รวมโครงไฟล์ */
export function mdToHtmlBody(md: string): string {
  const lines = md.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  let inList = false

  const closeList = () => {
    if (inList) {
      out.push('</ol>')
      inList = false
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // ตาราง — ต้องตรวจก่อนอย่างอื่น เพราะกินหลายบรรทัด
    if (isTableRow(line) && isTableDivider(lines[i + 1] ?? '')) {
      closeList()
      const head = cells(line)
      i += 2
      const body: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(cells(lines[i]))
        i++
      }
      out.push('<table>')
      out.push(`<tr>${head.map((c) => `<th>${inlineMd(c)}</th>`).join('')}</tr>`)
      for (const row of body) {
        out.push(`<tr>${row.map((c) => `<td>${inlineMd(c)}</td>`).join('')}</tr>`)
      }
      out.push('</table>')
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      closeList()
      const level = heading[1].length
      out.push(`<h${level}>${inlineMd(heading[2])}</h${level}>`)
      i++
      continue
    }

    if (/^---+\s*$/.test(line)) {
      closeList()
      out.push('<hr />')
      i++
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      closeList()
      out.push(`<p class="note">${inlineMd(quote[1])}</p>`)
      i++
      continue
    }

    const item = line.match(/^\s*\d+\.\s+(.*)$/)
    if (item) {
      if (!inList) {
        out.push('<ol>')
        inList = true
      }
      out.push(`<li>${inlineMd(item[1])}</li>`)
      i++
      continue
    }

    if (!line.trim()) {
      closeList()
      i++
      continue
    }

    // บรรทัดที่ขึ้นต้นด้วยช่องว่างคือความต่อเนื่องของ list ข้อก่อนหน้า
    // (ไฟล์ต้นทางใช้รูปแบบนี้ในหัวข้อ "สิ่งที่ต้องเตรียมก่อนเริ่ม")
    if (inList && /^\s+\S/.test(line)) {
      out[out.length - 1] = out[out.length - 1].replace(
        /<\/li>$/,
        ` ${inlineMd(line.trim())}</li>`
      )
      i++
      continue
    }

    closeList()
    out.push(`<p>${inlineMd(line.trim())}</p>`)
    i++
  }

  closeList()
  return out.join('\n')
}

/**
 * ห่อด้วยโครงไฟล์ที่ Word อ่านเข้าใจ
 *
 * ฟอนต์ตั้งเป็น **TH SarabunPSK** ซึ่งเป็นฟอนต์มาตรฐานของเอกสารราชการไทย
 * และเป็นตัวที่ปริญญานิพนธ์ส่วนใหญ่ใช้ ถ้าเครื่องไม่มีจะถอยไป Sarabun แล้ว Tahoma
 */
export function wrapWordHtml(title: string, body: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "TH SarabunPSK", "Sarabun", Tahoma, sans-serif; font-size: 14pt; }
  h1 { font-size: 20pt; }
  h2 { font-size: 17pt; margin-top: 18pt; }
  h3 { font-size: 15pt; margin-top: 14pt; }
  h4 { font-size: 14pt; margin-top: 12pt; }
  table { border-collapse: collapse; width: 100%; font-size: 12pt; }
  th, td { border: 1px solid #666; padding: 4pt 6pt; vertical-align: top; }
  th { background: #eee; }
  code { font-family: Consolas, monospace; font-size: 11pt; }
  p.note { margin-left: 18pt; color: #444; }
  hr { border: none; border-top: 1px solid #999; }
</style>
</head>
<body>
${body}
</body>
</html>
`
}
