export type TLItem = { year: number; label: string; kind: 'edu' | 'exp' }

// Merges education and experience into a single timeline, newest first.
export function buildTimeline(edu: any[] = [], exp: any[] = []): TLItem[] {
  const e: TLItem[] = edu.map((x) => ({
    year: x.start_year ?? 0,
    label: `${x.degree ?? ''} ${x.institution ?? ''}`.trim() + (x.country ? ` (${x.country})` : ''),
    kind: 'edu',
  }))
  const w: TLItem[] = exp.map((x) => ({
    year: x.start_date ? new Date(x.start_date).getFullYear() : 0,
    label: `${x.title ?? ''} @ ${x.company ?? ''}`.trim(),
    kind: 'exp',
  }))
  return [...e, ...w].sort((a, b) => b.year - a.year)
}

export default function Timeline({ edu, exp }: { edu?: any[]; exp?: any[] }) {
  const items = buildTimeline(edu, exp)
  if (!items.length) return <p style={{ color: '#888' }}>ไม่มีข้อมูลไทม์ไลน์</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, borderLeft: '2px solid #ddd' }}>
      {items.map((i, k) => (
        <li key={k} style={{ padding: '6px 0 6px 14px', position: 'relative' }}>
          <span
            style={{
              display: 'inline-block',
              minWidth: 48,
              fontWeight: 600,
              color: i.kind === 'edu' ? '#2563eb' : '#16a34a',
            }}
          >
            {i.year || '—'}
          </span>
          <span style={{ marginLeft: 8 }}>{i.label}</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: '#999' }}>
            {i.kind === 'edu' ? 'การศึกษา' : 'งาน'}
          </span>
        </li>
      ))}
    </ul>
  )
}
