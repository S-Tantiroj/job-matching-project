'use client'
import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge, { scoreClass } from '@/components/ScoreBadge'
import FilterChips from '@/components/FilterChips'
import CoverageStrip from '@/components/CoverageStrip'
import type { ChipFilters } from '@/lib/search/extractFilters'

export default function SearchPage() {
  const [nl, setNl] = useState('')
  const [semanticQuery, setSemanticQuery] = useState('')
  const [filters, setFilters] = useState<ChipFilters>({})
  const [res, setRes] = useState<any[]>([])
  const [parsing, setParsing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [ran, setRan] = useState(false)

  const runSearch = async (sq: string, f: ChipFilters) => {
    if (!sq.trim()) return
    setSearching(true)
    setRan(true)
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ semanticQuery: sq, filters: f }),
    })
    const json = await r.json()
    setRes(Array.isArray(json) ? json : [])
    setSearching(false)
  }

  const parseAndSearch = async () => {
    if (!nl.trim() || parsing) return
    setParsing(true)
    let intent: any = {}
    try {
      const r = await fetch('/api/search/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: nl }),
      })
      if (r.ok) intent = await r.json()
    } catch {
      intent = {}
    }
    setParsing(false)
    const sq = intent.semanticQuery ?? nl
    const f = intent.filters ?? {}
    setSemanticQuery(sq)
    setFilters(f)
    await runSearch(sq, f)
  }

  const onFiltersChange = (f: ChipFilters) => {
    setFilters(f)
    runSearch(semanticQuery, f)
  }

  return (
    <main>
      <h1>ค้นหาผู้สมัคร</h1>

      <div className="row" style={{ margin: '12px 0' }}>
        <input
          className="input"
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && parseAndSearch()}
          placeholder="พิมพ์คำค้นหาทั่วไป เช่น data scientist สาย Python ที่จบจากอเมริกา 3 ปีขึ้นไป"
        />
        <button className="btn btn-primary" onClick={parseAndSearch} disabled={parsing || !nl}>
          {parsing ? 'กำลังอ่าน…' : 'ค้นหา'}
        </button>
      </div>

      <CoverageStrip semanticQuery={semanticQuery} filters={filters} />

      {semanticQuery && (
        <div className="card" style={{ margin: '4px 0 8px' }}>
          <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>คำอธิบายที่ค้นหา (แก้ได้)</div>
          <div className="row">
            <input
              className="input"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(semanticQuery, filters)}
            />
            <button className="btn" onClick={() => runSearch(semanticQuery, filters)} disabled={searching}>
              ค้นหาใหม่
            </button>
          </div>
          <FilterChips filters={filters} onChange={onFiltersChange} />
        </div>
      )}

      {res.length > 0 && (
        <div className="section-header">
          <h2>ผู้สมัคร {res.length} คน</h2>
          <span className="faint" style={{ fontSize: 12 }}>เรียงตามความใกล้เคียง</span>
        </div>
      )}
      <div className="stack">
        {res.map((c) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="result-row" style={{ color: 'inherit' }}>
            <ScoreBadge score={c.score} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{c.full_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{c.headline}</div>
            </div>
            <span className="faint">›</span>
          </Link>
        ))}
      </div>
      {ran && !searching && res.length === 0 && <p className="faint">ไม่พบผู้สมัคร</p>}
    </main>
  )
}
