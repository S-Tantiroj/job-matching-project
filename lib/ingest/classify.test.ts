import { classifyRow } from './classify'
import type { CandidateInput } from './normalize'

const complete: CandidateInput = {
  full_name: 'Somchai Jaidee',
  headline: 'Chief Technology Officer',
  source: 'scraper',
  linkedin_url: 'https://linkedin.com/in/somchai',
  education: [{ institution: 'MIT' }],
  experience: [{ title: 'CTO', company: 'Acme' }],
}

test('a complete row has nothing missing', () => {
  expect(classifyRow(complete)).toEqual([])
})

test('each missing field is reported', () => {
  expect(classifyRow({ ...complete, headline: undefined })).toEqual(['headline'])
  expect(classifyRow({ ...complete, experience: undefined })).toEqual(['experience'])
  expect(classifyRow({ ...complete, linkedin_url: undefined })).toEqual(['linkedin_url'])
  expect(classifyRow({ ...complete, education: undefined })).toEqual(['education'])
})

test('an empty array counts as missing, not present', () => {
  expect(classifyRow({ ...complete, experience: [] })).toEqual(['experience'])
  expect(classifyRow({ ...complete, education: [] })).toEqual(['education'])
})

test('a blank or whitespace-only string counts as missing', () => {
  expect(classifyRow({ ...complete, headline: '' })).toEqual(['headline'])
  expect(classifyRow({ ...complete, headline: '   ' })).toEqual(['headline'])
  expect(classifyRow({ ...complete, linkedin_url: '  ' })).toEqual(['linkedin_url'])
})

test('several missing fields come back in a stable order', () => {
  expect(
    classifyRow({ full_name: 'X', source: 'scraper' })
  ).toEqual(['headline', 'experience', 'linkedin_url', 'education'])
})
