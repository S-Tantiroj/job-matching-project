import { similarityToScore } from './score'

test('similarity maps to a 0-100 integer', () => {
  expect(similarityToScore(0.87)).toBe(87)
  expect(similarityToScore(0.5)).toBe(50)
  expect(similarityToScore(0)).toBe(0)
  expect(similarityToScore(1)).toBe(100)
})

test('values outside 0-1 are clamped', () => {
  expect(similarityToScore(-0.3)).toBe(0)
  expect(similarityToScore(1.4)).toBe(100)
})

test('the result is always a rounded integer', () => {
  expect(similarityToScore(0.876)).toBe(88)
  expect(similarityToScore(0.874)).toBe(87)
})

test('non-finite input becomes 0', () => {
  // pgvector อาจคืนค่ามาเป็นสตริง ถ้าแปลงพลาดจะได้ NaN
  expect(similarityToScore(NaN)).toBe(0)
  expect(similarityToScore(Infinity)).toBe(0)
})
