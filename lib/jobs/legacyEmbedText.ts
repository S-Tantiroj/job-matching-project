import type { JobInput } from './normalize'

// The buildJobEmbedText that shipped before the mirror reorder, kept ONLY so the
// evaluation harness can rank with both formats side by side and measure whether
// the reorder actually helped. Nothing in the app should import this.
//
// Delete it once the comparison in scripts/eval-ranking.ts has been run and the
// answer recorded — a second copy of a formatting rule is a liability the moment
// someone mistakes it for live code.
export function buildJobEmbedTextLegacy(j: JobInput): string {
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
