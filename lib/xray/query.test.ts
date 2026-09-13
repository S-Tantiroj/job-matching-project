import { buildXrayQuery, xraySearchUrl, XRAY_SITE } from './query'

// ---------------------------------------------------------------------------
// ไวยากรณ์ของ Google — ข้อที่ผิดแล้วผลลัพธ์ "ดูเหมือนใช้ได้"
// ---------------------------------------------------------------------------

test('quotes a multi-word job title so Google treats it as one phrase', () => {
  // ไม่ใส่อัญประกาศ Google จะแยกเป็นสองคำอิสระแล้วผลลัพธ์บาน
  const q = buildXrayQuery({ jobTitle: 'Financial Analyst' })
  expect(q).toBe('site:th.linkedin.com/in "Financial Analyst"')
})

test('wraps two or more institutions in parentheses joined by OR', () => {
  const q = buildXrayQuery({ institutions: ['Chulalongkorn', 'Thammasat'] })
  expect(q).toContain('("Chulalongkorn" OR "Thammasat")')
})

test('a single institution needs no parentheses', () => {
  const q = buildXrayQuery({ institutions: ['Chulalongkorn'] })
  expect(q).toContain('"Chulalongkorn"')
  expect(q).not.toContain('(')
  expect(q).not.toContain(' OR ')
})

test('an empty group disappears completely, leaving no stray parentheses', () => {
  const q = buildXrayQuery({ jobTitle: 'Data Scientist', institutions: [], skills: [] })
  expect(q).not.toContain('(')
  expect(q).not.toContain(')')
  expect(q).not.toContain('OR')
})

test('strips quote characters the user pasted in', () => {
  // คนคัดลอกจาก LinkedIn หรือ Word มักติดอัญประกาศมาด้วย ทั้งตรงและโค้ง
  const q = buildXrayQuery({ jobTitle: '"Data Scientist"' })
  expect(q).toContain('"Data Scientist"')
  expect(q).not.toContain('""')
})

test('strips curly quotes too', () => {
  const q = buildXrayQuery({ jobTitle: '“Data Scientist”' })
  expect(q).toContain('"Data Scientist"')
  expect(q).not.toContain('“')
  expect(q).not.toContain('”')
})

test('keeps apostrophes — only double quotes break a phrase', () => {
  const q = buildXrayQuery({ institutions: ["King's College London"] })
  expect(q).toContain('"King\'s College London"')
})

test('treats a whitespace-only value as empty', () => {
  expect(buildXrayQuery({ jobTitle: '   ' })).toBe('')
  expect(buildXrayQuery({ institutions: ['  ', ''] })).toBe('')
})

// ---------------------------------------------------------------------------
// ข้อสำคัญที่สุด: ว่างต้องเป็นว่าง ไม่ใช่คำค้นที่ดูเหมือนสำเร็จ
// ---------------------------------------------------------------------------

test('returns an empty string when nothing is filled in, NOT a bare site: query', () => {
  // `site:th.linkedin.com/in` เปล่าๆ คืนผลลัพธ์เป็นล้านและดูเหมือนทำงานสำเร็จ
  // ความผิดพลาดชนิดเดียวกับ width: NaN% และ "ไม่พบผลลัพธ์" ตอนระบบค้นหาพัง
  expect(buildXrayQuery({})).toBe('')
  expect(buildXrayQuery({ scope: 'global' })).toBe('')
  expect(buildXrayQuery({ jobTitle: '', institutions: [], skills: [], location: '' })).toBe('')
})

test('xraySearchUrl returns an empty string for an empty query', () => {
  // กันไม่ให้เปิดหน้า Google เปล่าๆ ซึ่งผู้ใช้จะอ่านว่า "ไม่มีใครตรงเลย"
  expect(xraySearchUrl('')).toBe('')
  expect(xraySearchUrl('   ')).toBe('')
})

// ---------------------------------------------------------------------------
// ขอบเขตโดเมน
// ---------------------------------------------------------------------------

test('defaults to the Thailand subdomain', () => {
  // ตอน www.linkedin.com หลุดดัชนี Google ทั้งก้อน (มี.ค. 2026)
  // ซับโดเมนรายประเทศไม่โดนด้วย — th. จึงทนกว่าและตรงกลุ่มเป้าหมายอยู่แล้ว
  expect(buildXrayQuery({ jobTitle: 'Analyst' })).toContain('site:th.linkedin.com/in')
})

test('scope global drops the country subdomain', () => {
  const q = buildXrayQuery({ jobTitle: 'Analyst', scope: 'global' })
  expect(q).toContain('site:linkedin.com/in')
  expect(q).not.toContain('th.linkedin.com')
})

test('the site scope always comes first', () => {
  const q = buildXrayQuery({ jobTitle: 'Analyst', institutions: ['MIT'] })
  expect(q.startsWith('site:')).toBe(true)
})

// ---------------------------------------------------------------------------
// เทสต์ที่ hardcode ค่าจริง — ลูปข้างบนจับ "โดเมนผิด" ไม่ได้
// (หลักการใน CLAUDE.md: ค่าคงที่ที่สะท้อนของนอกรีโปต้องมีเทสต์ที่ตรึงค่าไว้)
// ---------------------------------------------------------------------------

test('XRAY_SITE holds the exact domains, so a typo cannot pass silently', () => {
  expect(XRAY_SITE).toEqual({
    th: 'site:th.linkedin.com/in',
    global: 'site:linkedin.com/in',
  })
})

test('builds the exact expected string for a full input', () => {
  const q = buildXrayQuery({
    jobTitle: 'Financial Analyst',
    institutions: ['Chulalongkorn', 'Thammasat'],
    skills: ['Python', 'SQL'],
    location: 'Bangkok',
    scope: 'th',
  })
  expect(q).toBe(
    'site:th.linkedin.com/in "Financial Analyst" ("Chulalongkorn" OR "Thammasat") "Python" "SQL" "Bangkok"'
  )
})

test('encodes the whole query into the search URL', () => {
  const url = xraySearchUrl('site:th.linkedin.com/in "C++" (a OR b)')
  expect(url.startsWith('https://www.google.com/search?q=')).toBe(true)
  // + ต้องถูก encode ไม่งั้น Google อ่านเป็นช่องว่าง แล้ว C++ กลายเป็น C
  expect(url).toContain('C%2B%2B')
  expect(url).toContain('%22')
  expect(url).not.toContain(' ')
})
