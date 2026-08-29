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

test('buildEmbedText includes industry - the counterpart of jobs.category', () => {
  const base = { full_name: 'A', headline: 'Managing Director', source: 'scraper' as const }
  expect(buildEmbedText({ ...base, industry: 'Oil & Gas' })).toContain('Oil & Gas')
  // absent industry must not leave a blank line that shifts the text
  expect(buildEmbedText(base).split('\n')).toEqual(['A', 'Managing Director'])
})
