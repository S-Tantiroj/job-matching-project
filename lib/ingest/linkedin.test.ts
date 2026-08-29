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

// Headers copied verbatim from a real PhantomBuster "LinkedIn Search Export"
// result.csv. That phantom uses SHORT names (headline, jobTitle, company, school)
// while the profile-scraper phantom uses the linkedin*-prefixed names above.
// Both must parse, because which phantom produced a file is not knowable from
// the file itself.
const searchExport = `profileUrl,fullName,connectionDegree,timestamp,category,query,firstName,lastName,headline,location,vmid,linkedinProfileUrl,company,companyUrl,industry,company2,jobTitle,jobDateRange,jobTitle2,jobDateRange2,school,schoolDegree,schoolDateRange,school2,schoolDegree2,schoolDateRange2,additionalInfo
https://linkedin.com/in/somchai,Somchai Jaidee,2nd,2026-08-25T09:09:51.272Z,People,https://linkedin.com/search,Somchai,Jaidee,Data Scientist,"Bangkok, Thailand",ACoAAA,https://linkedin.com/in/somchai,Agoda,https://linkedin.com/company/agoda,Technology,SCB,Senior Data Scientist,Jan 2020 - Present,Data Analyst,2017 - 2019,MIT,Master of Science,2015 - 2017,Chulalongkorn,Bachelor of Engineering,2011 - 2015,Leads the ranking team.`

test('parses real search-export headers (short names)', () => {
  const [c] = parseLinkedInCsv(searchExport)
  expect(c.full_name).toBe('Somchai Jaidee')
  expect(c.headline).toBe('Data Scientist')
  expect(c.location).toBe('Bangkok, Thailand')
  expect(c.linkedin_url).toBe('https://linkedin.com/in/somchai')

  expect(c.experience).toHaveLength(2)
  expect(c.experience![0]).toMatchObject({ title: 'Senior Data Scientist', company: 'Agoda', start_date: '2020-01-01' })
  expect(c.experience![1]).toMatchObject({ title: 'Data Analyst', company: 'SCB', start_date: '2017-01-01' })

  expect(c.education).toHaveLength(2)
  expect(c.education![0]).toMatchObject({ institution: 'MIT', degree: 'Master of Science', start_year: 2015 })
  expect(c.education![1]).toMatchObject({ institution: 'Chulalongkorn', degree: 'Bachelor of Engineering' })
})

test('search export maps additionalInfo to summary and timestamp to refreshed_at', () => {
  const [c] = parseLinkedInCsv(searchExport)
  expect(c.summary).toBe('Leads the ranking team.')
  expect(c.refreshed_at).toBe('2026-08-25T09:09:51.272Z')
})

test('maps industry from either phantom naming', () => {
  expect(parseLinkedInCsv(searchExport)[0].industry).toBe('Technology')
  const prefixed = `firstName,lastName,linkedinCompanyIndustry\nSomchai,Jaidee,Financial Services`
  expect(parseLinkedInCsv(prefixed)[0].industry).toBe('Financial Services')
})

test('search export has no skills column - skills stay undefined, not empty', () => {
  const [c] = parseLinkedInCsv(searchExport)
  // undefined (not []) matters: buildEmbedText filters falsy, and an empty array
  // would still join to '' and be filtered, but upsert treats [] as "delete all
  // skills" while undefined means "no information".
  expect(c.skills).toBeUndefined()
})

test('decodes HTML entities - the real export escapes additionalInfo but not headline', () => {
  const csv = `firstName,lastName,headline,additionalInfo
Somchai,Jaidee,Oil & Gas Lead,"Trades oil &amp; gas, said &quot;yes&quot; &#39;fast&#39;"`
  const [c] = parseLinkedInCsv(csv)
  expect(c.headline).toBe('Oil & Gas Lead') // already raw, left alone
  expect(c.summary).toBe(`Trades oil & gas, said "yes" 'fast'`)
})

test('decoding does not double-decode escaped entities', () => {
  const csv = `firstName,lastName,additionalInfo\nSomchai,Jaidee,&amp;lt;script&amp;gt;`
  expect(parseLinkedInCsv(csv)[0].summary).toBe('&lt;script&gt;')
})

test('prefixed headers still win when a file somehow has both', () => {
  const csv = `firstName,lastName,headline,linkedinHeadline\nSomchai,Jaidee,short,prefixed`
  expect(parseLinkedInCsv(csv)[0].headline).toBe('prefixed')
})
