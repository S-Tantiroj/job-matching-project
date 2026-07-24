// Canonicalize country names so the education-abroad chip is robust to the many
// ways a country is written. Unmapped values pass through (trimmed). v1 covers
// the common English aliases; extend as needed.
const MAP: Record<string, string> = {
  'united states': 'USA',
  'united states of america': 'USA',
  'us': 'USA',
  'u.s.': 'USA',
  'u.s.a.': 'USA',
  'usa': 'USA',
  'america': 'USA',
  'united kingdom': 'UK',
  'great britain': 'UK',
  'britain': 'UK',
  'u.k.': 'UK',
  'uk': 'UK',
  'england': 'UK',
}

export function normalizeCountry(input: string): string {
  const trimmed = input.trim()
  return MAP[trimmed.toLowerCase()] ?? trimmed
}
