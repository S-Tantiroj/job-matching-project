// Canonicalize country names so the education-abroad chip matches stored
// education.country values. The stored/synthetic data uses full English country
// names ("United States", "United Kingdom"), so short forms and aliases are
// mapped to that full form; full names and unmapped values pass through
// (trimmed). Applied to the chip's country values before the RPC filters on
// exact equality. v1 covers the common aliases; extend as needed.
const MAP: Record<string, string> = {
  usa: 'United States',
  us: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  america: 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
}

export function normalizeCountry(input: string): string {
  const trimmed = input.trim()
  return MAP[trimmed.toLowerCase()] ?? trimmed
}
