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
//
// The line order deliberately MIRRORS buildEmbedText on the candidate side:
//
//   candidate: full_name / headline / industry / summary / skills / degree+institution / title+company
//   job:       title     / category / description / required_skills / (—)             / title+company
//
// Same information as before, arranged so each slot faces its counterpart. This
// matters because a scraped candidate can arrive with no skills and no summary
// (the PhantomBuster search export has neither), leaving a title-and-company
// profile facing a skills-and-description job posting — two vectors describing
// the same role in different vocabulary. The trailing `title company` line is
// the one addition: it gives the job an experience-shaped line to match the
// candidate's, which is the field scraped profiles always have.
export function buildJobEmbedText(j: JobInput): string {
  return [
    j.title,
    j.category,
    j.description,
    (j.required_skills ?? []).join(', '),
    j.min_experience_years != null ? `${j.min_experience_years}+ years experience` : '',
    [j.title, j.company].filter(Boolean).join(' '),
    j.location,
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
