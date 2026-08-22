import { validateUpload, MAX_UPLOAD_BYTES } from './validateUpload'

test('a valid PDF passes', () => {
  expect(validateUpload({ type: 'application/pdf', size: 1000 })).toBeNull()
})

test('missing input is rejected', () => {
  expect(validateUpload(null)).toBe('กรุณาเลือกไฟล์ PDF')
})

test('a non-PDF type is rejected', () => {
  expect(validateUpload({ type: 'image/png', size: 1000 })).toBe('รองรับเฉพาะไฟล์ PDF เท่านั้น')
  expect(validateUpload({ type: 'text/csv', size: 1000 })).toBe('รองรับเฉพาะไฟล์ PDF เท่านั้น')
  expect(validateUpload({ size: 1000 })).toBe('รองรับเฉพาะไฟล์ PDF เท่านั้น')
})

test('an empty file is rejected', () => {
  expect(validateUpload({ type: 'application/pdf', size: 0 })).toBe('ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่')
  expect(validateUpload({ type: 'application/pdf' })).toBe('ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่')
})

test('exactly the size limit passes', () => {
  expect(validateUpload({ type: 'application/pdf', size: MAX_UPLOAD_BYTES })).toBeNull()
})

test('one byte over the limit is rejected', () => {
  expect(validateUpload({ type: 'application/pdf', size: MAX_UPLOAD_BYTES + 1 })).toBe(
    'ไฟล์ใหญ่เกินไป กรุณาใช้ไฟล์ไม่เกิน 4MB'
  )
})

test('MAX_UPLOAD_BYTES is 4MB', () => {
  expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024)
})
