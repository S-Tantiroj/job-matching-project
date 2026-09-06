import { parseSkillInput } from './ProfileForm'

test('parseSkillInput splits a normal comma-separated list', () => {
  expect(parseSkillInput('Python, SQL, Machine Learning')).toEqual([
    'Python',
    'SQL',
    'Machine Learning',
  ])
})

test('parseSkillInput trims extra whitespace around entries', () => {
  expect(parseSkillInput('  Python  ,   SQL   ,Machine Learning   ')).toEqual([
    'Python',
    'SQL',
    'Machine Learning',
  ])
})

test('parseSkillInput drops empty entries from doubled commas', () => {
  expect(parseSkillInput('Python,,SQL')).toEqual(['Python', 'SQL'])
})

test('parseSkillInput drops empty entry from a trailing comma', () => {
  expect(parseSkillInput('Python, SQL,')).toEqual(['Python', 'SQL'])
})

test('parseSkillInput returns [] for an empty string', () => {
  expect(parseSkillInput('')).toEqual([])
})

test('parseSkillInput returns [] for a whitespace-only string', () => {
  expect(parseSkillInput('   ')).toEqual([])
})
