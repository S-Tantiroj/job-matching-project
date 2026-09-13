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

// Every column name this parser looks at, in both phantoms' naming schemes.
//
// Used by `scripts/check-linkedin-csv.ts` to report columns a CSV carries that
// we ignore — the failure this catches is a phantom renaming a field, which is
// otherwise silent: the value just never reaches the database and nothing errors.
//
// **Keep in sync by hand when adding a `get(...)` call below.** A test cannot
// verify this list matches usage without re-implementing the parser, so the
// list is a diagnostic aid, not a guarantee.
export const KNOWN_COLUMNS = [
  'firstName', 'lastName', 'fullName',
  'linkedinHeadline', 'headline',
  'linkedinCompanyIndustry', 'companyIndustry', 'industry',
  'location',
  'linkedinDescription', 'additionalInfo',
  'linkedinProfileUrl', 'profileUrl',
  'professionalEmail',
  'refreshedAt', 'timestamp',
  'linkedinJobTitle', 'jobTitle',
  'companyName', 'company',
  'linkedinJobDateRange', 'jobDateRange',
  'linkedinJobDescription', 'jobDescription',
  'linkedinPreviousJobTitle', 'jobTitle2',
  'previousCompanyName', 'company2',
  'linkedinPreviousJobDateRange', 'jobDateRange2',
  'linkedinPreviousJobDescription', 'jobDescription2',
  'linkedinSchoolName', 'school',
  'linkedinSchoolDegree', 'schoolDegree',
  'linkedinSchoolFieldOfStudy', 'schoolFieldOfStudy',
  'linkedinSchoolDateRange', 'schoolDateRange',
  'linkedinPreviousSchoolName', 'school2',
  'linkedinPreviousSchoolDegree', 'schoolDegree2',
  'linkedinPreviousSchoolFieldOfStudy', 'schoolFieldOfStudy2',
  'linkedinPreviousSchoolDateRange', 'schoolDateRange2',
  'linkedinSkillsLabel', 'skillsLabel',
] as const

/** true when the parser reads this column under either naming scheme */
export function isKnownColumn(header: string): boolean {
  return KNOWN_COLUMNS.some((k) => norm(k) === norm(header))
}

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

// Parse a LinkedIn-shaped CSV into CandidateInput rows.
// Deterministic (no LLM). Accepts camelCase or friendly-label headers. Captures
// current + previous job and school. Education country is intentionally omitted.
//
// `source` is a PARAMETER because the file cannot tell you where it came from.
// The same column layout arrives two ways: a PhantomBuster export (`scraper`)
// and a human filling in `lib/ingest/csvTemplate.ts` by hand (`csv`). Only the
// caller knows which. Labelling a hand-typed row `scraper` is not a cosmetic
// slip — `candidate_source_counts` feeds the Dashboard chart that exists to
// answer "where did this data come from", which is PDPA evidence.
//
// The default stays `scraper` so `scripts/sync-candidates.ts` keeps its old
// behaviour without a change; `/api/ingest` type `linkedin` passes `'csv'`.
export function parseLinkedInCsv(
  text: string,
  source: CandidateInput['source'] = 'scraper'
): CandidateInput[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return data
    .map((row): CandidateInput | null => {
      const get = makeGetter(row)
      // The split pair is trusted only when BOTH halves are there. Otherwise
      // fullName wins if it exists.
      //
      // The old rule was `pair || fullName`, which looks equivalent but is not:
      // filter(Boolean) drops an empty lastName, leaving a truthy first name, so
      // `||` never reaches fullName. A row with firstName "Nattapong", blank
      // lastName and fullName "Nattapong Wong" stored just "Nattapong" —
      // **the more complete value was ignored because a partial one was truthy**.
      // Caught 2026-09-13 by scripts/check-linkedin-csv.ts on the sample file.
      //
      // Why this matters beyond the display name: `linkedin_url` is the dedup key
      // (migration 008), and rows without one fall back to matching on name.
      const first = get('firstName')
      const last = get('lastName')
      const pair = [first, last].filter(Boolean).join(' ').trim()
      const full_name = first && last ? pair : get('fullName') || pair
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
        source,
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
