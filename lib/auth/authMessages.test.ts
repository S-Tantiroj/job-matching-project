import { authErrorMessage, GENERIC_AUTH_ERROR } from './authMessages'

describe('authErrorMessage', () => {
  // สองข้อความนี้เจอกับตาตอน UAT 15-18 ก.ย. — เป็นเหตุผลที่ไฟล์นี้ถูกสร้าง
  test('Invalid login credentials → ไทย และไม่เผยว่าอีเมลมีอยู่จริง', () => {
    const m = authErrorMessage('Invalid login credentials')
    expect(m).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่')
    // **ข้อที่สำคัญที่สุดในไฟล์นี้** — เขียนว่า "รหัสผ่านไม่ถูกต้อง" เมื่อไร
    // UAT ข้อ AU-04 จะกลายเป็นไม่ผ่านทันที เพราะเท่ากับยืนยันว่าอีเมลมีบัญชีอยู่
    expect(m).toContain('อีเมลหรือรหัสผ่าน')
    expect(m).not.toMatch(/^รหัสผ่านไม่ถูกต้อง/)
  })

  test('rate limit → บอกให้รอ ไม่ใช่ให้เปลี่ยนอีเมล', () => {
    const m = authErrorMessage('email rate limit exceeded')
    expect(m).toContain('รอสักครู่')
    // คนอ่านต้องไม่สรุปว่าอีเมลนี้ใช้ไม่ได้ แล้วไปหาอีเมลใหม่มาสมัคร
    expect(m).not.toContain('อีเมลนี้ใช้ไม่ได้')
  })

  test('เทียบด้วยคำสำคัญ ไม่สนตัวพิมพ์ใหญ่เล็กและถ้อยคำรอบข้าง', () => {
    // Supabase เปลี่ยนถ้อยคำได้ทุกเวอร์ชัน การเทียบเต็มประโยคจะพังเงียบๆ
    expect(authErrorMessage('INVALID LOGIN CREDENTIALS')).toContain('อีเมลหรือรหัสผ่าน')
    expect(authErrorMessage('Request failed: Too Many Requests')).toContain('รอสักครู่')
  })

  test('ข้อความที่ไม่รู้จักตกไปที่ข้อความกลาง ไม่ปล่อยของดิบออกไป', () => {
    const raw = 'AuthApiError: pgrst116 relation "auth.users" does not exist'
    const m = authErrorMessage(raw)
    expect(m).toBe(GENERIC_AUTH_ERROR)
    expect(m).not.toContain('auth.users')
    expect(m).not.toContain('AuthApiError')
  })

  test('ค่าว่างหรือไม่มีค่าไม่ทำให้หน้าจอว่างเปล่า', () => {
    // ข้อความว่างแปลว่าผู้ใช้กดแล้วไม่มีอะไรเกิดขึ้น ซึ่งแย่กว่าข้อความกลาง
    expect(authErrorMessage('')).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR)
    expect(authErrorMessage('   ')).toBe(GENERIC_AUTH_ERROR)
  })

  test('ทุกข้อความที่คืนเป็นภาษาไทย ไม่มีอังกฤษปนออกไป', () => {
    const raws = [
      'Invalid login credentials',
      'email rate limit exceeded',
      'Email not confirmed',
      'Password should be at least 6 characters',
      'Unable to validate email address',
      'อะไรก็ไม่รู้',
    ]
    for (const r of raws) expect(authErrorMessage(r)).not.toMatch(/[A-Za-z]{4,}/)
  })
})
