'use client'
import { useState } from 'react'
import type { ChipFilters } from '@/lib/search/extractFilters'

export default function FilterChips({
  filters,
  onChange,
}: {
  filters: ChipFilters
  onChange: (f: ChipFilters) => void
}) {
  const [skill, setSkill] = useState('')
  const [field, setField] = useState('')

  const skills = filters.skills ?? []
  const fields = filters.fieldOrDegree ?? []

  return (
    <div className="stack" style={{ gap: 10, margin: '12px 0' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {skills.map((s) => (
          <span key={s} className="chip">
            สกิล: {s}
            <button className="chip-x" aria-label={`ลบ ${s}`} onClick={() => onChange({ ...filters, skills: skills.filter((x) => x !== s) })}>×</button>
          </span>
        ))}
        <input
          className="input"
          style={{ width: 110 }}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && skill.trim()) {
              onChange({ ...filters, skills: [...skills, skill.trim()] })
              setSkill('')
            }
          }}
          placeholder="+ สกิล"
        />
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {fields.map((f) => (
          <span key={f} className="chip">
            สาขา: {f}
            <button className="chip-x" aria-label={`ลบ ${f}`} onClick={() => onChange({ ...filters, fieldOrDegree: fields.filter((x) => x !== f) })}>×</button>
          </span>
        ))}
        <input
          className="input"
          style={{ width: 140 }}
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && field.trim()) {
              onChange({ ...filters, fieldOrDegree: [...fields, field.trim()] })
              setField('')
            }
          }}
          placeholder="+ สาขา/ปริญญา"
        />
      </div>

      <div className="row" style={{ fontSize: 13 }}>
        <span className="faint">ประสบการณ์ขั้นต่ำ (ปี):</span>
        <input
          className="input"
          type="number"
          min={0}
          style={{ width: 80 }}
          value={filters.minYears ?? ''}
          onChange={(e) => onChange({ ...filters, minYears: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
    </div>
  )
}
