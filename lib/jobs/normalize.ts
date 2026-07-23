export type JobInput = {
  title: string
  company?: string
  description: string
  required_skills?: string[]
  min_experience_years?: number
  location?: string
  category?: string
  source?: string
  external_id?: string
}

// Flatten a job into one text blob for embedding — same 768-dim space as
// candidates so job and candidate vectors are directly comparable.
export function buildJobEmbedText(j: JobInput): string {
  return [
    j.title,
    j.company,
    j.category,
    j.location,
    (j.required_skills ?? []).join(', '),
    j.min_experience_years != null ? `${j.min_experience_years}+ years experience` : '',
    j.description,
  ]
    .filter(Boolean)
    .join('\n')
}

// Human-readable requirement string fed to the LLM deep-scorer (reuses
// analyzeCandidate + the analyses cache). English for uniformity with stored
// data; the model still returns Thai reasoning.
export function buildJobRequirementText(j: JobInput): string {
  const parts = [`Role: ${j.title}`]
  if (j.company) parts.push(`Company: ${j.company}`)
  if (j.required_skills?.length) parts.push(`Required skills: ${j.required_skills.join(', ')}`)
  if (j.min_experience_years != null) parts.push(`Minimum experience: ${j.min_experience_years} years`)
  if (j.location) parts.push(`Location: ${j.location}`)
  parts.push(`Description: ${j.description}`)
  return parts.join('. ')
}
