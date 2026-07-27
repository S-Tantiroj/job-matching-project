'use client'
import type { ChipFilters } from '@/lib/search/extractFilters'

// Shows which search dimensions the current query covers. Each item turns green
// with a check when it has a value. Derived from live state — no LLM call.
export default function CoverageStrip({
  semanticQuery,
  filters,
}: {
  semanticQuery: string
  filters: ChipFilters
}) {
  const items: { label: string; on: boolean }[] = [
    { label: 'ตำแหน่ง', on: !!semanticQuery.trim() },
    { label: 'ประสบการณ์', on: filters.minYears != null },
    { label: 'สกิล', on: !!filters.skills?.length },
    {
      label: 'การศึกษา',
      on:
        !!filters.fieldOrDegree?.length ||
        !!filters.educationAbroad?.anyForeign ||
        !!filters.educationAbroad?.countries?.length,
    },
  ]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 13,
            background: it.on ? '#dcfce7' : '#f3f4f6',
            color: it.on ? '#15803d' : '#9ca3af',
            border: `1px solid ${it.on ? '#86efac' : '#e5e7eb'}`,
          }}
        >
          {it.on ? '✓' : '○'} {it.label}
        </span>
      ))}
    </div>
  )
}
