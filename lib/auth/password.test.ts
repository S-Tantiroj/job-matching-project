import { validatePasswordChange } from './password'

test('valid input returns null', () => {
  expect(validatePasswordChange('oldpass', 'newpass', 'newpass')).toBeNull()
})

test('any empty field is rejected', () => {
  expect(validatePasswordChange('', 'newpass', 'newpass')).toBe('กรุณากรอกข้อมูลให้ครบทุกช่อง')
  expect(validatePasswordChange('oldpass', '', 'newpass')).toBe('กรุณากรอกข้อมูลให้ครบทุกช่อง')
  expect(validatePasswordChange('oldpass', 'newpass', '')).toBe('กรุณากรอกข้อมูลให้ครบทุกช่อง')
})

test('a short new password is rejected', () => {
  expect(validatePasswordChange('oldpass', '12345', '12345')).toBe(
    'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร'
  )
})

test('exactly six characters is accepted', () => {
  expect(validatePasswordChange('oldpass', '123456', '123456')).toBeNull()
})

test('a mismatched confirmation is rejected', () => {
  expect(validatePasswordChange('oldpass', 'newpass', 'newpazz')).toBe(
    'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน'
  )
})

test('reusing the current password is rejected', () => {
  expect(validatePasswordChange('samepass', 'samepass', 'samepass')).toBe(
    'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม'
  )
})
