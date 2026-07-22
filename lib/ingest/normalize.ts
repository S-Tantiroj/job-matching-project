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
