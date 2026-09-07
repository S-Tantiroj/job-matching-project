import {
  buildJobEmbedText,
  buildJobRequirementText,
  embedTextChanged,
  requirementTextChanged,
} from './normalize'

const job = {
  title: 'Data Scientist',
  company: 'Acme',
  description: 'Build ML models',
  required_skills: ['Python', 'SQL'],
  min_experience_years: 3,
  location: 'Bangkok',
}

test('buildJobEmbedText includes title, skills, and description', () => {
  const t = buildJobEmbedText(job)
  expect(t).toContain('Data Scientist')
  expect(t).toContain('Python')
  expect(t).toContain('Build ML models')
})

test('buildJobEmbedText keeps every field after the mirror reorder', () => {
  const t = buildJobEmbedText({ ...job, category: 'Technology' })
  for (const v of ['Data Scientist', 'Acme', 'Technology', 'Bangkok', 'Python', 'SQL', 'Build ML models', '3+ years'])
    expect(t).toContain(v)
})

test('buildJobEmbedText ends with a title+company line mirroring candidate experience', () => {
  // The candidate side emits `${title} ${company}` per role. A scraped profile
  // may have nothing else, so the job needs the same shape to match against.
  const lines = buildJobEmbedText(job).split('\n')
  expect(lines).toContain('Data Scientist Acme')
})

test('buildJobEmbedText omits the company from the mirror line when absent', () => {
  const lines = buildJobEmbedText({ title: 'Data Scientist', description: 'x' }).split('\n')
  expect(lines).toContain('Data Scientist')
  expect(lines.some((l) => l.endsWith(' '))).toBe(false)
})

test('buildJobRequirementText includes role, skills, and min experience', () => {
  const t = buildJobRequirementText(job)
  expect(t).toContain('Data Scientist')
  expect(t).toContain('Python')
  expect(t).toContain('3')
})

// ---------------------------------------------------------------------------
// การแก้งานกระทบอะไรบ้าง
// ---------------------------------------------------------------------------

const BASE = {
  title: 'Data Scientist',
  company: 'Acme',
  description: 'Build models',
  required_skills: ['Python', 'SQL'],
  min_experience_years: 3,
  location: 'Bangkok',
  category: 'Technology',
}

test('ไม่แก้อะไรเลย ทั้งสองตัวคืน false', () => {
  expect(embedTextChanged(BASE, { ...BASE })).toBe(false)
  expect(requirementTextChanged(BASE, { ...BASE })).toBe(false)
})

test('แก้ category กระทบ embedding แต่ไม่กระทบ cache คะแนน', () => {
  // **นี่คือเทสต์ที่สำคัญที่สุดในไฟล์นี้** — category อยู่ใน buildJobEmbedText
  // แต่ไม่อยู่ใน buildJobRequirementText ถ้าใครยุบสองฟังก์ชันเป็นตัวเดียว
  // (เพราะดูเผินๆ เหมือนทำงานซ้ำกัน) เทสต์นี้จะแดง
  const after = { ...BASE, category: 'Finance' }
  expect(embedTextChanged(BASE, after)).toBe(true)
  expect(requirementTextChanged(BASE, after)).toBe(false)
})

test('แก้ description กระทบทั้งสองอย่าง', () => {
  const after = { ...BASE, description: 'Build better models' }
  expect(embedTextChanged(BASE, after)).toBe(true)
  expect(requirementTextChanged(BASE, after)).toBe(true)
})

test('แก้ source อย่างเดียวไม่กระทบอะไรเลย', () => {
  // source ไม่ได้อยู่ในข้อความทั้งสองแบบ — ไม่ควรทำให้เสียเงินค่า embedding
  const after = { ...BASE, source: 'manual' }
  expect(embedTextChanged(BASE, after)).toBe(false)
  expect(requirementTextChanged(BASE, after)).toBe(false)
})

test('แก้แล้วเปลี่ยนกลับเป็นค่าเดิม ถือว่าไม่เปลี่ยน', () => {
  const after = { ...BASE, title: 'Data Scientist' }
  expect(embedTextChanged(BASE, after)).toBe(false)
  expect(requirementTextChanged(BASE, after)).toBe(false)
})

test('แก้ location กระทบทั้งสองอย่าง', () => {
  // location อยู่ในทั้งสองข้อความ — ยืนยันว่าไม่ได้มีแค่ category ที่ต่างกัน
  const after = { ...BASE, location: 'Chiang Mai' }
  expect(embedTextChanged(BASE, after)).toBe(true)
  expect(requirementTextChanged(BASE, after)).toBe(true)
})
