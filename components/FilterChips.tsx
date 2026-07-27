'use client'
import { useState } from 'react'
import type { ChipFilters } from '@/lib/search/extractFilters'

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#eef2ff',
  color: '#3730a3',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 13,
}

// Editable filter chips. All edits call onChange with the next ChipFilters;
// the parent re-runs the search (no LLM).
export default function FilterChips({
  filters,
  onChange,
}: {
  filters: ChipFilters
  onChange: (f: ChipFilters) => void
}) {
  const [skill, setSkill] = useState('')
  const [field, setField] = useState('')
  const [country, setCountry] = useState('')

  const skills = filters.skills ?? []
  const fields = filters.fieldOrDegree ?? []
  const abroad = filters.educationAbroad
  const countries = abroad?.countries ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '12px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {skills.map((s) => (
          <span key={s} style={pillStyle}>
            สกิล: {s}
            <button
              aria-label={`ลบ ${s}`}
              onClick={() => onChange({ ...filters, skills: skills.filter((x) => x !== s) })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && skill.trim()) {
              onChange({ ...filters, skills: [...skills, skill.trim()] })
              setSkill('')
            }
          }}
          placeholder="+ สกิล"
          style={{ width: 100 }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={!!abroad?.anyForeign}
            onChange={(e) =>
              onChange({
                ...filters,
                educationAbroad: e.target.checked ? { anyForeign: true } : undefined,
              })
            }
          />{' '}
          จบต่างประเทศ (ทั่วไป)
        </label>
        {countries.map((c) => (
          <span key={c} style={pillStyle}>
            จบ: {c}
            <button
              aria-label={`ลบ ${c}`}
              onClick={() =>
                onChange({
                  ...filters,
                  educationAbroad: { countries: countries.filter((x) => x !== c) },
                })
              }
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && country.trim()) {
              onChange({ ...filters, educationAbroad: { countries: [...countries, country.trim()] } })
              setCountry('')
            }
          }}
          placeholder="+ ประเทศ"
          style={{ width: 100 }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {fields.map((f) => (
          <span key={f} style={pillStyle}>
            สาขา: {f}
            <button
              aria-label={`ลบ ${f}`}
              onClick={() => onChange({ ...filters, fieldOrDegree: fields.filter((x) => x !== f) })}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#3730a3' }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && field.trim()) {
              onChange({ ...filters, fieldOrDegree: [...fields, field.trim()] })
              setField('')
            }
          }}
          placeholder="+ สาขา/ปริญญา"
          style={{ width: 130 }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        ประสบการณ์ขั้นต่ำ (ปี):
        <input
          type="number"
          min={0}
          value={filters.minYears ?? ''}
          onChange={(e) =>
            onChange({
              ...filters,
              minYears: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          style={{ width: 70 }}
        />
      </div>
    </div>
  )
}
