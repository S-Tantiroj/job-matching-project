'use client'
import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
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

  // Run search from a given semanticQuery + filters (no LLM).
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

  // Parse NL -> chips (LLM), then search.
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

  // Chip edits: update state and re-run immediately (no LLM).
  const onFiltersChange = (f: ChipFilters) => {
    setFilters(f)
    runSearch(semanticQuery, f)
  }

  return (
    <main>
      <h1>ค้นหาผู้สมัคร</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input
          style={{ flex: 1 }}
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && parseAndSearch()}
          placeholder="พิมพ์คำค้นหาทั่วไป เช่น data scientist สาย Python ที่จบจากอเมริกา 3 ปีขึ้นไป"
        />
        <button onClick={parseAndSearch} disabled={parsing || !nl}>
          {parsing ? 'กำลังอ่าน…' : 'ค้นหา'}
        </button>
      </div>

      <CoverageStrip semanticQuery={semanticQuery} filters={filters} />

      {semanticQuery && (
        <>
          <div style={{ fontSize: 13, color: '#777', marginBottom: 4 }}>คำอธิบายที่ค้นหา (แก้ได้)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ flex: 1 }}
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(semanticQuery, filters)}
            />
            <button onClick={() => runSearch(semanticQuery, filters)} disabled={searching}>
              ค้นหาใหม่
            </button>
          </div>
          <FilterChips filters={filters} onChange={onFiltersChange} />
        </>
      )}

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {res.map((c) => (
          <li
            key={c.id}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f2f2f2' }}
          >
            <ScoreBadge score={c.score} />
            <Link href={`/candidates/${c.id}`} style={{ fontWeight: 600 }}>
              {c.full_name}
            </Link>
            <span style={{ color: '#888' }}>{c.headline}</span>
          </li>
        ))}
      </ul>
      {ran && !searching && res.length === 0 && <p style={{ color: '#888' }}>ไม่พบผู้สมัคร</p>}
    </main>
  )
}
