import { parseLinkedInCsv } from './linkedin'

const camel = `firstName,lastName,linkedinHeadline,linkedinProfileUrl,linkedinJobTitle,companyName,linkedinJobDateRange,linkedinPreviousJobTitle,previousCompanyName,linkedinSchoolName,linkedinSchoolDegree,linkedinSchoolFieldOfStudy,linkedinSchoolDateRange,linkedinSkillsLabel,professionalEmail
Somchai,Jaidee,Data Scientist,https://linkedin.com/in/somchai,Senior Data Scientist,Agoda,Jan 2020 - Present,Data Analyst,SCB,MIT,Master of Science,Computer Science,2015 - 2017,"Python; SQL, Machine Learning",somchai@x.com`

const friendly = `First Name,Last Name,Linkedin Headline,Linkedin Profile Url,Linkedin Job Title,Company Name,Linkedin Job Date Range,Linkedin School Name,Linkedin School Degree,Linkedin School Date Range,Linkedin Skills Label
Somchai,Jaidee,Data Scientist,https://linkedin.com/in/somchai,Senior Data Scientist,Agoda,Jan 2020 - Present,MIT,Master of Science,2015 - 2017,Python; SQL`

test('parses camelCase headers into a full CandidateInput', () => {
  const [c] = parseLinkedInCsv(camel)
  expect(c.full_name).toBe('Somchai Jaidee')
  expect(c.source).toBe('scraper')
  expect(c.linkedin_url).toBe('https://linkedin.com/in/somchai')
  expect(c.professional_email).toBe('somchai@x.com')
  expect(c.experience).toHaveLength(2)
  expect(c.experience![0]).toMatchObject({ title: 'Senior Data Scientist', company: 'Agoda', start_date: '2020-01-01' })
  expect(c.experience![0].end_date).toBeUndefined()
  expect(c.experience![1]).toMatchObject({ title: 'Data Analyst', company: 'SCB' })
  expect(c.education).toHaveLength(1)
  expect(c.education![0]).toMatchObject({ institution: 'MIT', degree: 'Master of Science', field_of_study: 'Computer Science', start_year: 2015, end_year: 2017 })
  expect(c.education![0]).not.toHaveProperty('country')
  expect(c.skills).toEqual(['Python', 'SQL', 'Machine Learning'])
})

test('friendly-label headers parse identically (header tolerance)', () => {
  const [c] = parseLinkedInCsv(friendly)
  expect(c.full_name).toBe('Somchai Jaidee')
  expect(c.linkedin_url).toBe('https://linkedin.com/in/somchai')
  expect(c.education![0].institution).toBe('MIT')
  expect(c.skills).toEqual(['Python', 'SQL'])
})

test('skips rows with no name', () => {
  const csv = `firstName,lastName\n,\nSomchai,Jaidee`
  expect(parseLinkedInCsv(csv)).toHaveLength(1)
})

test('captures previous school, dedups skills, and omits empty entry groups', () => {
  const csv = `firstName,lastName,linkedinSchoolName,linkedinSchoolDegree,linkedinPreviousSchoolName,linkedinPreviousSchoolDegree,linkedinSkillsLabel
Anong,Sri,Chulalongkorn,Bachelor of Engineering,MIT,Master of Science,"Python, Python; SQL"`
  const [c] = parseLinkedInCsv(csv)
  expect(c.education).toHaveLength(2)
  expect(c.education![1]).toMatchObject({ institution: 'MIT', degree: 'Master of Science' })
  expect(c.experience).toBeUndefined() // no job columns -> no experience entries
  expect(c.skills).toEqual(['Python', 'SQL']) // duplicate Python collapsed
})
