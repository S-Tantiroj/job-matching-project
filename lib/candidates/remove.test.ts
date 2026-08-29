import { isReimportable } from './remove'

test('scraper rows with a linkedin_url come back after a plain delete', () => {
  expect(isReimportable({ source: 'scraper', linkedin_url: 'https://linkedin.com/in/a' })).toBe(true)
})

test('a scraper row with no linkedin_url cannot be re-found, so it stays deleted', () => {
  // ตัวสคริปต์ dedup ด้วย linkedin_url — ไม่มี url ก็ไม่มีทางจับคู่กลับมาที่คนเดิม
  expect(isReimportable({ source: 'scraper', linkedin_url: null })).toBe(false)
  expect(isReimportable({ source: 'scraper', linkedin_url: '   ' })).toBe(false)
})

test('rows from every other source stay deleted', () => {
  // synthetic / csv / upload ไม่มีสคริปต์คืนไหนไปดึงกลับมา
  for (const source of ['synthetic', 'csv', 'upload']) {
    expect(isReimportable({ source, linkedin_url: 'https://linkedin.com/in/a' })).toBe(false)
  }
})
