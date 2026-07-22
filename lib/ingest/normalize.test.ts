import { buildEmbedText } from './normalize'

test('buildEmbedText concatenates key fields', () => {
  const t = buildEmbedText({
    full_name: 'A',
    headline: 'Data Scientist',
    source: 'csv',
    skills: ['Python', 'SQL'],
    education: [{ institution: 'MIT', country: 'USA' }],
  })
  expect(t).toContain('Data Scientist')
  expect(t).toContain('Python')
  expect(t).toContain('MIT')
})
