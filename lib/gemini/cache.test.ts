import { requirementHash } from './cache'

test('requirementHash is stable and normalizes whitespace/case', () => {
  expect(requirementHash('Python  Dev')).toBe(requirementHash('python dev'))
})

test('requirementHash differs for different requirements', () => {
  expect(requirementHash('Python dev')).not.toBe(requirementHash('Go dev'))
})
