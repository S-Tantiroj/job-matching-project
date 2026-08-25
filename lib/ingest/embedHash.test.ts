import { embedHash } from './embedHash'
import type { CandidateInput } from './normalize'

const base: CandidateInput = {
  full_name: 'Somchai Jaidee',
  headline: 'Chief Technology Officer',
  summary: 'Engineering leader',
  source: 'scraper',
  location: 'Bangkok',
  linkedin_url: 'https://linkedin.com/in/somchai',
  skills: ['Python'],
  education: [{ degree: 'MSc', institution: 'MIT', country: 'USA' }],
  experience: [{ title: 'CTO', company: 'Acme' }],
}

test('the same input produces the same hash', () => {
  expect(embedHash(base)).toBe(embedHash({ ...base }))
})

test('a changed headline changes the hash', () => {
  expect(embedHash({ ...base, headline: 'CEO' })).not.toBe(embedHash(base))
})

test('changed child data changes the hash', () => {
  expect(embedHash({ ...base, skills: ['Python', 'Go'] })).not.toBe(embedHash(base))
  expect(embedHash({ ...base, education: [{ degree: 'PhD', institution: 'MIT' }] })).not.toBe(embedHash(base))
  expect(embedHash({ ...base, experience: [{ title: 'CEO', company: 'Acme' }] })).not.toBe(embedHash(base))
})

test('fields outside buildEmbedText do NOT change the hash', () => {
  // ถ้าข้อนี้ไม่ผ่าน ระบบจะ re-embed คนที่แค่ย้ายที่อยู่ — เผาโควตาเปล่า
  expect(embedHash({ ...base, location: 'Chiang Mai' })).toBe(embedHash(base))
  expect(embedHash({ ...base, linkedin_url: 'https://linkedin.com/in/other' })).toBe(embedHash(base))
  expect(embedHash({ ...base, professional_email: 'a@b.co' })).toBe(embedHash(base))
})

test('whitespace-only differences do NOT change the hash', () => {
  // CSV export ซ้ำอาจมีช่องว่างต่างกันโดยเนื้อหาเหมือนเดิม ต้องไม่นับว่าเปลี่ยน
  expect(embedHash({ ...base, headline: '  Chief   Technology  Officer  ' })).toBe(embedHash(base))
})

test('the hash is a 64-character hex string', () => {
  expect(embedHash(base)).toMatch(/^[0-9a-f]{64}$/)
})
