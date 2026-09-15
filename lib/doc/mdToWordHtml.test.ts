import { inlineMd, mdToHtmlBody, wrapWordHtml } from './mdToWordHtml'

// ---------------------------------------------------------------------------
// การ escape คือข้อที่พังแล้วเงียบที่สุด
//
// ไฟล์ UAT มี `<อีเมลของคุณ>` และ `&amp;` อยู่จริง ถ้าไม่ escape ก่อนแปลง
// Word จะกลืนมันเป็นแท็กแล้วข้อความหายไปทั้งท่อน **โดยไม่มี error อะไรเลย**
// ---------------------------------------------------------------------------

test('escapes angle brackets that exist in the source file', () => {
  expect(inlineMd('<อีเมลของคุณ>')).toBe('&lt;อีเมลของคุณ&gt;')
})

test('escapes ampersands', () => {
  expect(inlineMd('a & b')).toBe('a &amp; b')
})

test('escapes before applying markdown, so code spans keep their brackets', () => {
  expect(inlineMd('`<path.csv>`')).toBe('<code>&lt;path.csv&gt;</code>')
})

test('bold and code together', () => {
  expect(inlineMd('**ห้าม** ใช้ `npx tsc`')).toBe(
    '<strong>ห้าม</strong> ใช้ <code>npx tsc</code>'
  )
})

// ---------------------------------------------------------------------------
// ตาราง — ส่วนที่ทั้งเอกสารมีอยู่เพื่อมัน
// ---------------------------------------------------------------------------

const TABLE = `| รหัส | ผล |
|---|---|
| AU-01 | ☐ ผ่าน ☐ ไม่ผ่าน |
| AU-02 | ☐ ผ่าน ☐ ไม่ผ่าน |`

test('แถวหัวตารางใช้ th ส่วนแถวข้อมูลใช้ td', () => {
  const html = mdToHtmlBody(TABLE)
  expect(html).toContain('<th>รหัส</th>')
  expect(html).toContain('<td>AU-01</td>')
})

test('แปลงครบทุกแถว ไม่ตกแถวสุดท้าย', () => {
  const html = mdToHtmlBody(TABLE)
  expect((html.match(/<tr>/g) ?? []).length).toBe(3) // หัว + สองแถว
})

test('เครื่องหมายช่องติ๊กต้องอยู่ครบ — เป็นสิ่งที่คนกรอกด้วยปากกา', () => {
  expect(mdToHtmlBody(TABLE)).toContain('☐ ผ่าน ☐ ไม่ผ่าน')
})

test('ไม่เข้าใจผิดว่าบรรทัดคั่น |---| เป็นข้อมูล', () => {
  expect(mdToHtmlBody(TABLE)).not.toContain('<td>---</td>')
})

// ---------------------------------------------------------------------------
// โครงสร้างอื่นที่ไฟล์ต้นทางใช้
// ---------------------------------------------------------------------------

test('หัวข้อสามระดับ', () => {
  const html = mdToHtmlBody('# หนึ่ง\n\n## สอง\n\n### สาม')
  expect(html).toContain('<h1>หนึ่ง</h1>')
  expect(html).toContain('<h2>สอง</h2>')
  expect(html).toContain('<h3>สาม</h3>')
})

test('รายการมีลำดับถูกปิดก่อนหัวข้อถัดไป', () => {
  const html = mdToHtmlBody('1. หนึ่ง\n2. สอง\n\n## ถัดไป')
  expect(html).toContain('<ol>')
  expect(html.indexOf('</ol>')).toBeLessThan(html.indexOf('<h2>'))
})

test('บรรทัดที่ย่อหน้าต่อจากข้อเดิมถูกรวมเข้าข้อนั้น ไม่กลายเป็นย่อหน้าใหม่', () => {
  // ไฟล์ต้นทางใช้รูปแบบนี้ในหัวข้อ "สิ่งที่ต้องเตรียมก่อนเริ่ม"
  const html = mdToHtmlBody('1. บัญชีสามใบ\n   admin หนึ่ง')
  expect(html).toContain('<li>บัญชีสามใบ admin หนึ่ง</li>')
  expect(html).not.toContain('<p>admin หนึ่ง</p>')
})

test('blockquote กลายเป็นย่อหน้าหมายเหตุ ไม่หายไป', () => {
  expect(mdToHtmlBody('> เคสที่ต้องใช้สองคน')).toBe('<p class="note">เคสที่ต้องใช้สองคน</p>')
})

test('เส้นคั่น', () => {
  expect(mdToHtmlBody('---')).toBe('<hr />')
})

// ---------------------------------------------------------------------------
// โครงไฟล์
// ---------------------------------------------------------------------------

test('ประกาศ charset utf-8 — ขาดแล้วภาษาไทยเป็นขยะทั้งไฟล์', () => {
  expect(wrapWordHtml('t', '')).toContain('charset="utf-8"')
})

test('ตั้งฟอนต์ไทยเป็นตัวแรก', () => {
  expect(wrapWordHtml('t', '')).toContain('"TH SarabunPSK"')
})

test('มี namespace ของ Word เพื่อให้เปิดเป็นเอกสาร ไม่ใช่หน้าเว็บ', () => {
  expect(wrapWordHtml('t', '')).toContain('urn:schemas-microsoft-com:office:word')
})

test('escape ชื่อเรื่องด้วย', () => {
  expect(wrapWordHtml('a<b>c', '')).toContain('<title>a&lt;b&gt;c</title>')
})
