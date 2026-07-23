import { buildTimeline } from './Timeline'

test('buildTimeline merges edu+exp sorted by year desc', () => {
  const items = buildTimeline(
    [{ institution: 'Oxford', degree: 'MSc', country: 'UK', start_year: 2015 }],
    [{ company: 'X', title: 'Dev', start_date: '2020-01-01', end_date: null }]
  )
  expect(items[0].year).toBe(2020)
  expect(items[0].kind).toBe('exp')
  expect(items[1].year).toBe(2015)
  expect(items[1].kind).toBe('edu')
})

test('buildTimeline handles empty input', () => {
  expect(buildTimeline()).toEqual([])
})
