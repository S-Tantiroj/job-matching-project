import { createHash } from 'crypto'

// Stable hash of a requirement, normalized for whitespace and case, so the same
// requirement re-uses a cached analysis instead of calling Gemini again.
export function requirementHash(text: string): string {
  return createHash('sha256')
    .update(text.trim().toLowerCase().replace(/\s+/g, ' '))
    .digest('hex')
}
