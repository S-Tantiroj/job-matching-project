import Papa from 'papaparse'
import type { CandidateInput } from './normalize'
import { parseLinkedInDateRange } from './linkedinDate'

// Normalize a header/key to a lookup token: lowercase, strip non-alphanumerics.
// "firstName" and "First Name" both become "firstname".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// Returns the first alias that holds a non-empty value.
//
// Two PhantomBuster phantoms feed this parser and they name columns differently:
// the profile scraper uses linkedin*-prefixed names (linkedinJobTitle), the
// search export uses short ones (jobTitle). A file does not say which phantom
// produced it, so every field accepts both. Prefixed names are passed FIRST
// because the profile scraper is the richer source — if a file somehow carries
// both, that column is the one to trust.
function makeGetter(row: Record<string, string>) {
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(row)) map.set(norm(k), v ?? '')
  return (...keys: string[]) => {
    for (const key of keys) {
      const v = (map.get(norm(key)) ?? '').trim()
      if (v) return decodeEntities(v)
    }
    return ''
  }
}

const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : undefined)

// PhantomBuster HTML-escapes some columns and not others — in a real search
// export, additionalInfo came back with "&amp;" while headline had a raw "&".
// Decoding matters twice over: the text is shown to recruiters, and it feeds
// buildEmbedText, where "amp" would become a junk token in the vector.
// &amp; is decoded LAST so "&amp;lt;" does not turn into "<".
const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#0?39;|&#x27;|&apos;/gi, "'"],
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
]
const decodeEntities = (s: string) =>
  ENTITIES.reduce((acc, [re, ch]) => acc.replace(re, ch), s)

// Parse a PhantomBuster LinkedIn CSV export into CandidateInput rows.
// Deterministic (no LLM). Accepts camelCase or friendly-label headers. Captures
// current + previous job and school. Education country is intentionally omitted.
export function parseLinkedInCsv(text: string): CandidateInput[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return data
    .map((row): CandidateInput | null => {
      const get = makeGetter(row)
      // fullName is a fallback: the search export carries it alongside the split
      // pair, and a row can have it when firstName/lastName came back blank.
      const full_name =
        [get('firstName'), get('lastName')].filter(Boolean).join(' ').trim() || get('fullName')
      if (!full_name) return null

      const experience: NonNullable<CandidateInput['experience']> = []
      const cur = parseLinkedInDateRange(get('linkedinJobDateRange', 'jobDateRange'))
      if (get('linkedinJobTitle', 'jobTitle') || get('companyName', 'company')) {
        experience.push({
          company: get('companyName', 'company') || undefined,
          title: get('linkedinJobTitle', 'jobTitle') || undefined,
          start_date: cur.start_date ?? undefined,
          end_date: cur.end_date ?? undefined,
          description: get('linkedinJobDescription', 'jobDescription') || undefined,
        })
      }
      const prev = parseLinkedInDateRange(get('linkedinPreviousJobDateRange', 'jobDateRange2'))
      if (get('linkedinPreviousJobTitle', 'jobTitle2') || get('previousCompanyName', 'company2')) {
        experience.push({
          company: get('previousCompanyName', 'company2') || undefined,
          title: get('linkedinPreviousJobTitle', 'jobTitle2') || undefined,
          start_date: prev.start_date ?? undefined,
          end_date: prev.end_date ?? undefined,
          description: get('linkedinPreviousJobDescription', 'jobDescription2') || undefined,
        })
      }

      const education: NonNullable<CandidateInput['education']> = []
      const sch = parseLinkedInDateRange(get('linkedinSchoolDateRange', 'schoolDateRange'))
      if (get('linkedinSchoolName', 'school')) {
        education.push({
          institution: get('linkedinSchoolName', 'school') || undefined,
          degree: get('linkedinSchoolDegree', 'schoolDegree') || undefined,
          field_of_study: get('linkedinSchoolFieldOfStudy', 'schoolFieldOfStudy') || undefined,
          start_year: yearOf(sch.start_date),
          end_year: yearOf(sch.end_date),
        })
      }
      const psch = parseLinkedInDateRange(get('linkedinPreviousSchoolDateRange', 'schoolDateRange2'))
      if (get('linkedinPreviousSchoolName', 'school2')) {
        education.push({
          institution: get('linkedinPreviousSchoolName', 'school2') || undefined,
          degree: get('linkedinPreviousSchoolDegree', 'schoolDegree2') || undefined,
          field_of_study: get('linkedinPreviousSchoolFieldOfStudy', 'schoolFieldOfStudy2') || undefined,
          start_year: yearOf(psch.start_date),
          end_year: yearOf(psch.end_date),
        })
      }

      // The search export has no skills column at all. Absent stays undefined
      // ("no information"), never [] — upsert reads [] as "delete every skill".
      const skillsRaw = get('linkedinSkillsLabel', 'skillsLabel')
      const skills = skillsRaw
        ? [...new Set(skillsRaw.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean))]
        : undefined

      return {
        full_name,
        headline: get('linkedinHeadline', 'headline') || undefined,
        industry: get('linkedinCompanyIndustry', 'companyIndustry', 'industry') || undefined,
        location: get('location') || undefined,
        // additionalInfo is the search export's closest thing to the About
        // section. It feeds buildEmbedText, so losing it thins the vector.
        summary: get('linkedinDescription', 'additionalInfo') || undefined,
        source: 'scraper',
        linkedin_url: get('linkedinProfileUrl', 'profileUrl') || undefined,
        professional_email: get('professionalEmail') || undefined,
        // timestamp = when the phantom scraped the row, which is what
        // refreshed_at means here.
        refreshed_at: get('refreshedAt', 'timestamp') || undefined,
        education: education.length ? education : undefined,
        experience: experience.length ? experience : undefined,
        skills,
        raw: row,
      }
    })
    .filter((r): r is CandidateInput => r !== null)
}
