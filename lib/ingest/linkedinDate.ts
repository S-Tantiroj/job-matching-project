const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

// Parse one endpoint ("2019", "Jan 2020") into ISO YYYY-MM-DD, or null for
// "Present"/"Current"/blank/unparseable.
function parseEndpoint(part: string): string | null {
  const s = part.trim()
  if (!s || /present|current/i.test(s)) return null
  const ym = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/)
  if (ym) {
    const m = MONTHS[ym[1].toLowerCase()]
    if (m) return `${ym[2]}-${m}-01`
  }
  const y = s.match(/(\d{4})/)
  return y ? `${y[1]}-01-01` : null
}

// Parse a LinkedIn date range ("2015 - 2019", "Jan 2020 - Present", "2020")
// into ISO start/end. A single value is treated as the start.
export function parseLinkedInDateRange(
  s?: string
): { start_date: string | null; end_date: string | null } {
  if (!s || !s.trim()) return { start_date: null, end_date: null }
  const parts = s.split(/[-–—]| to /i)
  const start = parseEndpoint(parts[0] ?? '')
  const end = parts.length > 1 ? parseEndpoint(parts[1] ?? '') : null
  return { start_date: start, end_date: end }
}
