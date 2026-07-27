export type CandidateInput = {
  full_name: string
  headline?: string
  location?: string
  summary?: string
  source: 'synthetic' | 'csv' | 'upload' | 'scraper'
  education?: {
    institution?: string
    country?: string
    degree?: string
    field_of_study?: string
    start_year?: number
    end_year?: number
  }[]
  experience?: {
    company?: string
    title?: string
    start_date?: string
    end_date?: string
    description?: string
  }[]
  skills?: string[]
  raw?: unknown
}

// Flattens a candidate into a single text blob for embedding.
export function buildEmbedText(i: CandidateInput): string {
  return [
    i.full_name,
    i.headline,
    i.summary,
    (i.skills ?? []).join(', '),
    (i.education ?? [])
      .map((e) => `${e.degree ?? ''} ${e.institution ?? ''} ${e.country ?? ''}`)
      .join('; '),
    (i.experience ?? []).map((e) => `${e.title ?? ''} ${e.company ?? ''}`).join('; '),
  ]
    .filter(Boolean)
    .join('\n')
}

// Total years of experience = sum of each role's duration (open-ended roles run
// to now). Overlapping roles may slightly overcount — acceptable for v1.
// Precomputed and stored on candidates.years_experience for fast filtering.
export function computeYearsExperience(
  experience: { start_date?: string; end_date?: string }[]
): number {
  let totalMs = 0
  for (const e of experience ?? []) {
    if (!e.start_date) continue
    const start = new Date(e.start_date).getTime()
    const end = e.end_date ? new Date(e.end_date).getTime() : Date.now()
    if (isNaN(start) || isNaN(end) || end < start) continue
    totalMs += end - start
  }
  return Math.round(totalMs / (365.25 * 24 * 60 * 60 * 1000))
}

// Coerce loose date strings (year-only "2019", year-month "2019-05") into ISO
// YYYY-MM-DD so they insert cleanly into Postgres `date` columns. Returns null
// for empty or unparseable input. Prevents a whole experience-insert batch from
// failing when the LLM emits a non-ISO date.
export function toIsoDate(input?: string | null): string | null {
  if (!input) return null
  const s = String(input).trim()
  if (/^\d{4}$/.test(s)) return `${s}-01-01`
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
