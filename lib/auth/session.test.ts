import { hasRole } from './session'

test('admin passes both admin and member gates', () => {
  expect(hasRole('admin', 'admin')).toBe(true)
  expect(hasRole('admin', 'member')).toBe(true)
})

test('member passes member gate but not admin gate', () => {
  expect(hasRole('member', 'member')).toBe(true)
  expect(hasRole('member', 'admin')).toBe(false)
})
