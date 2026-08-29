import { withTimeout, isTransient } from './withTimeout'

test('withTimeout resolves when the call finishes in time', async () => {
  expect(await withTimeout(Promise.resolve('fast'), 100)).toBe('fast')
})

test('withTimeout rejects when the call overruns', async () => {
  const slow = new Promise((r) => setTimeout(() => r('late'), 300))
  await expect(withTimeout(slow, 50)).rejects.toThrow(/timeout/)
})

test('capacity and rate-limit failures are treated as transient', () => {
  // ทั้งสามอย่างนี้หายเองเมื่อลองใหม่ — free tier ตัดคำขอตามความจุแล้วคืนมาปกติ
  for (const msg of ['got 503 from upstream', '429 Too Many Requests', 'UNAVAILABLE']) {
    expect(isTransient(new Error(msg))).toBe(true)
  }
  expect(isTransient(new Error('gemini timeout after 20000ms'))).toBe(true)
})

test('permanent failures are not retried', () => {
  // ลองใหม่กับสองเคสนี้ได้ผลเดิมเสมอ และเผาโควตาฟรีไปเปล่าๆ
  expect(isTransient(new Error('404 model not found'))).toBe(false)
  expect(isTransient(new SyntaxError('Unexpected token < in JSON'))).toBe(false)
  expect(isTransient(new Error('400 invalid argument'))).toBe(false)
})
