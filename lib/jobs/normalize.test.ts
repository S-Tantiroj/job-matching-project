import { buildJobEmbedText, buildJobRequirementText } from './normalize'

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
