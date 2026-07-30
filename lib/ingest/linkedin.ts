import Papa from 'papaparse'
import type { CandidateInput } from './normalize'
import { parseLinkedInDateRange } from './linkedinDate'

// Normalize a header/key to a lookup token: lowercase, strip non-alphanumerics.
// "firstName" and "First Name" both become "firstname".
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function makeGetter(row: Record<string, string>) {
  const map = new Map<string, string>()
  for (const [k, v] of Object.entries(row)) map.set(norm(k), v ?? '')
  return (key: string) => (map.get(norm(key)) ?? '').trim()
}

const yearOf = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : undefined)

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
      const full_name = [get('firstName'), get('lastName')].filter(Boolean).join(' ').trim()
      if (!full_name) return null

      const experience: NonNullable<CandidateInput['experience']> = []
      const cur = parseLinkedInDateRange(get('linkedinJobDateRange'))
      if (get('linkedinJobTitle') || get('companyName')) {
        experience.push({
          company: get('companyName') || undefined,
          title: get('linkedinJobTitle') || undefined,
          start_date: cur.start_date ?? undefined,
          end_date: cur.end_date ?? undefined,
          description: get('linkedinJobDescription') || undefined,
        })
      }
      const prev = parseLinkedInDateRange(get('linkedinPreviousJobDateRange'))
      if (get('linkedinPreviousJobTitle') || get('previousCompanyName')) {
        experience.push({
          company: get('previousCompanyName') || undefined,
          title: get('linkedinPreviousJobTitle') || undefined,
          start_date: prev.start_date ?? undefined,
          end_date: prev.end_date ?? undefined,
          description: get('linkedinPreviousJobDescription') || undefined,
        })
      }

      const education: NonNullable<CandidateInput['education']> = []
      const sch = parseLinkedInDateRange(get('linkedinSchoolDateRange'))
      if (get('linkedinSchoolName')) {
        education.push({
          institution: get('linkedinSchoolName') || undefined,
          degree: get('linkedinSchoolDegree') || undefined,
          field_of_study: get('linkedinSchoolFieldOfStudy') || undefined,
          start_year: yearOf(sch.start_date),
          end_year: yearOf(sch.end_date),
        })
      }
      const psch = parseLinkedInDateRange(get('linkedinPreviousSchoolDateRange'))
      if (get('linkedinPreviousSchoolName')) {
        education.push({
          institution: get('linkedinPreviousSchoolName') || undefined,
          degree: get('linkedinPreviousSchoolDegree') || undefined,
          field_of_study: get('linkedinPreviousSchoolFieldOfStudy') || undefined,
          start_year: yearOf(psch.start_date),
          end_year: yearOf(psch.end_date),
        })
      }

      const skillsRaw = get('linkedinSkillsLabel')
      const skills = skillsRaw
        ? [...new Set(skillsRaw.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean))]
        : undefined

      return {
        full_name,
        headline: get('linkedinHeadline') || undefined,
        location: get('location') || undefined,
        summary: get('linkedinDescription') || undefined,
        source: 'scraper',
        linkedin_url: get('linkedinProfileUrl') || get('profileUrl') || undefined,
        professional_email: get('professionalEmail') || undefined,
        refreshed_at: get('refreshedAt') || undefined,
        education: education.length ? education : undefined,
        experience: experience.length ? experience : undefined,
        skills,
        raw: row,
      }
    })
    .filter((r): r is CandidateInput => r !== null)
}
