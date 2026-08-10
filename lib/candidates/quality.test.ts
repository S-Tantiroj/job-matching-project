import { missingFields, buildIssuesOrFilter, MISSING_LABELS } from './quality'

const complete = {
  headline: 'Data Scientist',
  summary: 'Experienced analyst',
  years_experience: 5,
  has_embedding: true,
}

test('a complete row has no missing fields', () => {
  expect(missingFields(complete)).toEqual([])
})

test('missingFields reports each absent field', () => {
  expect(missingFields({ ...complete, headline: null })).toEqual(['headline'])
  expect(missingFields({ ...complete, summary: null })).toEqual(['summary'])
  expect(missingFields({ ...complete, years_experience: null })).toEqual(['years_experience'])
  expect(missingFields({ ...complete, has_embedding: false })).toEqual(['embedding'])
})

test('empty strings count as missing', () => {
  expect(missingFields({ ...complete, headline: '' })).toEqual(['headline'])
})

test('years_experience of 0 is present, not missing', () => {
  expect(missingFields({ ...complete, years_experience: 0 })).toEqual([])
})

test('missingFields reports several at once in a stable order', () => {
  expect(missingFields({ headline: null, summary: null, years_experience: null, has_embedding: false }))
    .toEqual(['headline', 'summary', 'years_experience', 'embedding'])
})

test('every missing field has a Thai label', () => {
  for (const f of ['headline', 'summary', 'years_experience', 'embedding'] as const) {
    expect(MISSING_LABELS[f]).toBeTruthy()
  }
})

test('buildIssuesOrFilter omits the name clause when there are no duplicates', () => {
  expect(buildIssuesOrFilter([])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null'
  )
})

test('buildIssuesOrFilter appends quoted duplicate names', () => {
  expect(buildIssuesOrFilter(['Somchai Jaidee'])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null,full_name.in.("Somchai Jaidee")'
  )
})

test('buildIssuesOrFilter quotes names containing commas', () => {
  expect(buildIssuesOrFilter(['Lee, Somchai', 'Nara Suk'])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null,full_name.in.("Lee, Somchai","Nara Suk")'
  )
})

test('buildIssuesOrFilter escapes double quotes inside a name', () => {
  expect(buildIssuesOrFilter(['Som "Ta" Jai'])).toBe(
    'headline.is.null,summary.is.null,years_experience.is.null,embedding.is.null,full_name.in.("Som \\"Ta\\" Jai")'
  )
})
