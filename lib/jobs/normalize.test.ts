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

test('buildJobRequirementText includes role, skills, and min experience', () => {
  const t = buildJobRequirementText(job)
  expect(t).toContain('Data Scientist')
  expect(t).toContain('Python')
  expect(t).toContain('3')
})
