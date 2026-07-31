import { scoreClass } from './ScoreBadge'

test('scoreClass picks the threshold band', () => {
  expect(scoreClass(90)).toBe('ok')
  expect(scoreClass(75)).toBe('ok')
  expect(scoreClass(60)).toBe('warn')
  expect(scoreClass(50)).toBe('warn')
  expect(scoreClass(40)).toBe('bad')
})
