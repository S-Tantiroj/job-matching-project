import { hasRole } from './session'

test('admin passes both admin and member gates', () => {
  expect(hasRole('admin', 'admin')).toBe(true)
  expect(hasRole('admin', 'member')).toBe(true)
})

test('member passes member gate but not admin gate', () => {
  expect(hasRole('member', 'member')).toBe(true)
  expect(hasRole('member', 'admin')).toBe(false)
})

test('data_manager passes member and data_manager gates but not admin', () => {
  expect(hasRole('data_manager', 'member')).toBe(true)
  expect(hasRole('data_manager', 'data_manager')).toBe(true)
  expect(hasRole('data_manager', 'admin')).toBe(false)
})

test('admin passes the data_manager gate', () => {
  expect(hasRole('admin', 'data_manager')).toBe(true)
})

test('member does not pass the data_manager gate', () => {
  expect(hasRole('member', 'data_manager')).toBe(false)
})
