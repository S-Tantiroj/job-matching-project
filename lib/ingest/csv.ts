import Papa from 'papaparse'
import type { CandidateInput } from './normalize'

// Parses a CSV string into CandidateInput rows.
// `mapping` maps a CSV header -> a target field. Supported target fields:
//   full_name, headline, location, summary, skills,
//   edu_institution, edu_country, edu_degree, edu_field_of_study
// (edu_* fields collapse into a single education entry per row.)
// Skills cells are split on ';' or ','.
export function parseCsv(text: string, mapping: Record<string, string>): CandidateInput[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  })

  return data
    .map((r) => {
      const out: CandidateInput = { full_name: '', source: 'csv' }
      const edu: Record<string, string> = {}

      for (const [col, field] of Object.entries(mapping)) {
        const val = r[col]?.trim()
        if (!val) continue
        if (field === 'skills') {
          out.skills = val.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
        } else if (field.startsWith('edu_')) {
          edu[field.replace('edu_', '')] = val
        } else {
          ;(out as any)[field] = val
        }
      }

      if (Object.keys(edu).length) out.education = [edu]
      return out
    })
    .filter((r) => r.full_name)
}
