import { isExistingUser, hasAuthError } from './signupFlow'

test('isExistingUser is true when identities is an empty array', () => {
  // รูปแบบที่ Supabase ส่งกลับเมื่ออีเมลนั้นมีบัญชีอยู่แล้ว
  expect(isExistingUser({ identities: [] })).toBe(true)
})

test('isExistingUser is false for a genuinely new signup', () => {
  // ผู้ใช้ใหม่จะมี identity อย่างน้อยหนึ่งรายการ
  expect(isExistingUser({ identities: [{ provider: 'email' }] })).toBe(false)
})

test('isExistingUser is false when there is no user at all', () => {
  expect(isExistingUser(null)).toBe(false)
  expect(isExistingUser(undefined)).toBe(false)
})

test('isExistingUser is false when identities is missing or not an array', () => {
  // ถ้า Supabase เลิกส่งฟิลด์นี้ ต้องไม่บล็อกคนที่สมัครถูกต้อง
  // ยอมให้อีเมลซ้ำหลุดผ่านดีกว่าปฏิเสธผู้ใช้ใหม่ทุกคน
  expect(isExistingUser({})).toBe(false)
  expect(isExistingUser({ identities: null })).toBe(false)
})

test('hasAuthError finds an error in the query string', () => {
  expect(hasAuthError('?error=access_denied&error_code=otp_expired', '')).toBe(true)
})

test('hasAuthError finds an error in the URL fragment', () => {
  expect(hasAuthError('', '#error=access_denied&error_description=Email+link+is+invalid')).toBe(true)
})

test('hasAuthError works whether or not the ? and # prefixes are present', () => {
  expect(hasAuthError('error=access_denied', '')).toBe(true)
  expect(hasAuthError('', 'error=access_denied')).toBe(true)
})

test('hasAuthError is false on a successful confirmation', () => {
  // เส้นทางปกติ: ไม่มี error กลับมา
  expect(hasAuthError('', '')).toBe(false)
  expect(hasAuthError('?code=abc123', '')).toBe(false)
  expect(hasAuthError('', '#access_token=abc&refresh_token=def')).toBe(false)
})

test('hasAuthError does not match a parameter that merely contains the word error', () => {
  expect(hasAuthError('?error_description=something', '')).toBe(false)
})
