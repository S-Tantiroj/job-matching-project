import { buildRubric, gradeFromChecks, checkCount, type Rubric } from './rubric'

const full = {
  title: 'Data Scientist',
  description: 'Build models',
  required_skills: ['Python', 'SQL'],
  min_experience_years: 3,
  category: 'Technology',
  location: 'Bangkok',
}

test('buildRubric derives one criterion per populated job field', () => {
  const r = buildRubric('j1', full)
  expect(r.criteria.map((c) => c.id)).toEqual(['role', 'skills', 'experience', 'location'])
  expect(r.title).toBe('Data Scientist')
})

test('buildRubric omits criteria for fields the job does not specify', () => {
  const r = buildRubric('j1', { title: 'Advisor', description: 'x' })
  expect(r.criteria.map((c) => c.id)).toEqual(['role'])
})

test('category never becomes a criterion', () => {
  // category holds internal taxonomy words (Data / Engineering / Product), not
  // industries. "เข้าใจบริบทของแวดวง Data" was unanswerable and duplicated role.
  const r = buildRubric('j1', { ...full, category: 'Data' })
  expect(r.criteria.map((c) => c.id)).not.toContain('domain')
  expect(JSON.stringify(r)).not.toContain('แวดวง')
})

test('a placeless location produces no location criterion', () => {
  // "ทำงานที่ Remote ได้" is true of everyone, so it discriminates nothing.
  for (const loc of ['Remote', 'remote', ' Anywhere ', 'Hybrid', 'Worldwide']) {
    const r = buildRubric('j1', { ...full, location: loc })
    expect(r.criteria.map((c) => c.id)).not.toContain('location')
  }
  expect(buildRubric('j1', { ...full, location: 'Bangkok' }).criteria.map((c) => c.id)).toContain('location')
})

test('every criterion is answerable from the profile, never from intent', () => {
  // Anything asking what a candidate *would* do gets guessed, and guesses are
  // noise that drowns the measurement.
  const text = buildRubric('j1', full).criteria.map((c) => c.label).join(' ')
  for (const banned of ['ได้ไหม', 'ยินดี', 'ย้าย', 'ก้าวมา', 'ใกล้เคียง']) {
    expect(text.includes(banned)).toBe(false)
  }
})

test('the skills criterion states how many of the listed skills are enough', () => {
  // "Python / ML / SQL / Statistics ได้จริง" left the threshold to the reader,
  // so the same person could be judged differently at minute 5 and minute 40.
  const skills = buildRubric('j1', full).criteria.find((c) => c.id === 'skills')!
  expect(skills.label).toContain('อย่างน้อย 1 ใน 2') // full has 2 required skills
  expect(skills.label).toContain('ไม่ใช่แค่มีคำนั้นอยู่ในรายการทักษะ')

  const four = buildRubric('j1', { ...full, required_skills: ['a', 'b', 'c', 'd'] })
  expect(four.criteria.find((c) => c.id === 'skills')!.label).toContain('อย่างน้อย 2 ใน 4')
})

test('every criterion carries a short display name', () => {
  // The full wording is too long to repeat on every card — the page leads with
  // `short` and keeps `label` as the fine print.
  for (const c of buildRubric('j1', full).criteria) {
    expect(c.short.length > 0).toBe(true)
    expect(c.short.length <= 30).toBe(true)
    expect(c.short.length < c.label.length).toBe(true)
  }
})

test('role is the only must-have', () => {
  const r = buildRubric('j1', full)
  expect(r.criteria.filter((c) => c.must).map((c) => c.id)).toEqual(['role'])
})

const r = buildRubric('j1', full) // role + skills, experience, location

test('failing the must-have scores 0 even when everything else passes', () => {
  expect(gradeFromChecks(r, { role: false, skills: true, experience: true, location: true })).toBe(0)
})

test('must-have plus enough others scores 2', () => {
  expect(gradeFromChecks(r, { role: true, skills: true, experience: true, location: true })).toBe(2)
  // 2 of 3 = 0.67 >= 0.6
  expect(gradeFromChecks(r, { role: true, skills: true, experience: true })).toBe(2)
})

test('missing only the location criterion still scores 2', () => {
  // The reason STRONG_RATIO is 0.6: at 0.7 a three-criterion rubric demands a
  // clean sweep, so failing the least important criterion alone would demote a
  // strong candidate.
  expect(gradeFromChecks(r, { role: true, skills: true, experience: true, location: false })).toBe(2)
})

test('must-have with too few others scores 1', () => {
  // 1 of 3 = 0.33
  expect(gradeFromChecks(r, { role: true, skills: true })).toBe(1)
  expect(gradeFromChecks(r, { role: true })).toBe(1)
})

test('checks for a criterion that no longer exists are ignored', () => {
  // Labels recorded against the old rubric still parse — the removed `domain`
  // tick must not leak into the score.
  expect(gradeFromChecks(r, { role: true, skills: true, domain: true })).toBe(1)
})

test('a rubric with no optional criteria scores 2 once the must-have passes', () => {
  const bare = buildRubric('j1', { title: 'Advisor', description: 'x' })
  expect(gradeFromChecks(bare, { role: true })).toBe(2)
  expect(gradeFromChecks(bare, { role: false })).toBe(0)
})

test('unchecked and missing keys behave the same', () => {
  expect(gradeFromChecks(r, {})).toBe(0)
  expect(gradeFromChecks(r, { role: undefined as unknown as boolean })).toBe(0)
})

test('grades survive re-weighting without relabelling', () => {
  // The stored artefact is the checks, so dropping a criterion and recomputing
  // must not require the labeller to look at anyone again.
  const checks = { role: true, skills: true, experience: false, location: false }
  expect(gradeFromChecks(r, checks)).toBe(1) // 1 of 3
  const skillsOnly: Rubric = {
    ...r,
    criteria: r.criteria.filter((c) => ['role', 'skills'].includes(c.id)),
  }
  expect(gradeFromChecks(skillsOnly, checks)).toBe(2) // 1 of 1
})

test('checkCount reports raw ticks and never a grade', () => {
  expect(checkCount(r, { role: true, skills: true })).toEqual({ passed: 2, total: 4 })
})
