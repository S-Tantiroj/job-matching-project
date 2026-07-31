'use client'
import type { ChipFilters } from '@/lib/search/extractFilters'

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
    { label: 'การศึกษา', on: !!filters.fieldOrDegree?.length },
  ]

  return (
    <div className="row" style={{ flexWrap: 'wrap', margin: '10px 0' }}>
      {items.map((it) => (
        <span key={it.label} className={`pill ${it.on ? 'pill-on' : 'pill-off'}`}>
          {it.on ? '✓' : '○'} {it.label}
        </span>
      ))}
    </div>
  )
}
