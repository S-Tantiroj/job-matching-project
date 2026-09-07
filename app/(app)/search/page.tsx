'use client'
import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import FilterChips from '@/components/FilterChips'
import CoverageStrip from '@/components/CoverageStrip'
import type { ChipFilters } from '@/lib/search/extractFilters'
import { mergeAiFilters, reconcileAfterUserEdit, NO_AI_FILTERS, type AiOwned } from '@/lib/search/mergeFilters'
import { countActiveFilters, describeFilters } from '@/lib/search/describeFilters'

export default function SearchPage() {
  const [nl, setNl] = useState('')
  const [semanticQuery, setSemanticQuery] = useState('')
  const [filters, setFilters] = useState<ChipFilters>({})
  // ชิปไหนมาจาก AI — ใช้ถอดของรอบก่อนออกโดยไม่แตะของที่ผู้ใช้ตั้งเอง
  // (เหตุผลเต็มอยู่ใน lib/search/mergeFilters.ts)
  const [aiOwned, setAiOwned] = useState<AiOwned>(NO_AI_FILTERS)
  const [res, setRes] = useState<any[]>([])
  const [parsing, setParsing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [ran, setRan] = useState(false)
  const [err, setErr] = useState('')
  // เปิดไว้ตั้งแต่แรกโดยตั้งใจ — ทั้งหน้านี้ถูกแก้มาเพื่อให้เห็นตัวกรองได้ทันที
  // การพับเก็บเป็นสิ่งที่ผู้ใช้เลือกเอง ไม่ใช่ค่าตั้งต้น
  const [filtersOpen, setFiltersOpen] = useState(true)

  const runSearch = async (sq: string, f: ChipFilters) => {
    if (!sq.trim()) return
    setSearching(true)
    setRan(true)
    setErr('')
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ semanticQuery: sq, filters: f }),
      })
      // **ห้ามคืน [] เมื่อคำขอล้มเหลว**
      //
      // เดิมบรรทัดนี้เป็น `setRes(Array.isArray(json) ? json : [])` ซึ่งกลืนการตอบ
      // แบบ `{ error }` ที่ route คืนมาตอน 500 หน้าจอจึงขึ้น "ไม่พบผู้สมัคร"
      // ทั้งที่ระบบค้นหาพังสนิท — เป็นอาการเดียวกับที่ RPC พังเมื่อ 2026-09-07
      // แล้วเสียเวลาไล่หาสาเหตุนาน "ไม่มีใครตรงเงื่อนไข" กับ "ค้นหาไม่ได้"
      // ต้องแยกให้ผู้ใช้เห็น
      if (!r.ok) {
        setRes([])
        setErr(
          r.status === 401
            ? 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วลองอีกครั้ง'
            : 'ค้นหาไม่สำเร็จ ระบบมีปัญหาชั่วคราว กรุณาลองใหม่หรือแจ้งผู้ดูแลระบบ'
        )
        return
      }
      const json = await r.json()
      if (!Array.isArray(json)) {
        setRes([])
        setErr('ค้นหาไม่สำเร็จ ระบบตอบกลับในรูปแบบที่ไม่คาดคิด กรุณาแจ้งผู้ดูแลระบบ')
        return
      }
      setRes(json)
    } catch {
      // เครือข่ายขาดหรือเซิร์ฟเวอร์ไม่ตอบ — ยังต้องไม่ทำให้ดูเหมือนไม่มีผลลัพธ์
      setRes([])
      setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
    } finally {
      setSearching(false)
    }
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
    // รวมกับตัวกรองที่ผู้ใช้ตั้งไว้ก่อนหน้า ไม่เขียนทับ
    const merged = mergeAiFilters(filters, aiOwned, intent.filters ?? {})
    setSemanticQuery(sq)
    setFilters(merged.filters)
    setAiOwned(merged.ai)
    await runSearch(sq, merged.filters)
  }

  const onFiltersChange = (f: ChipFilters) => {
    setAiOwned(reconcileAfterUserEdit(filters, f, aiOwned))
    setFilters(f)
    // ยังไม่เคยค้นหา = ยังไม่มีข้อความให้จัดอันดับ เก็บตัวกรองไว้รอรอบแรก
    // (การจัดอันดับใช้ embedding ของข้อความ ตัวกรองเป็นเงื่อนไขตัดออกเท่านั้น)
    if (semanticQuery.trim()) runSearch(semanticQuery, f)
  }

  const activeFilters = countActiveFilters(filters)

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
        </div>
      )}

      <CoverageStrip semanticQuery={semanticQuery} filters={filters} />

      <div className="card" style={{ margin: '4px 0 8px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="faint" style={{ fontSize: 12 }}>
            ตัวกรอง{activeFilters > 0 ? ` · ใช้อยู่ ${activeFilters}` : ''}
          </span>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 13, padding: '4px 8px' }}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            aria-controls="filter-panel"
          >
            {filtersOpen ? 'ซ่อน ▴' : 'แสดง ▾'}
          </button>
        </div>

        {/* พับแล้วยังต้องบอกว่าอะไรกำลังกรองอยู่ — ตัวกรองที่ทำงานอยู่แต่มองไม่เห็น
            ทำให้ผลลัพธ์น้อยผิดปกติโดยไม่มีอะไรอธิบายว่าเพราะอะไร */}
        {!filtersOpen && activeFilters > 0 && (
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>{describeFilters(filters)}</div>
        )}

        {filtersOpen && (
          <div id="filter-panel">
            <FilterChips filters={filters} onChange={onFiltersChange} />
            <div className="faint" style={{ fontSize: 12 }}>
              {semanticQuery
                ? 'แก้ตัวกรองแล้วระบบค้นหาใหม่ให้ทันที'
                : 'ตั้งไว้ล่วงหน้าได้ ตัวกรองจะถูกใช้เมื่อกดค้นหา — การจัดอันดับต้องมีคำค้นหาด้านบนเสมอ'}
            </div>
          </div>
        )}
      </div>

      {err && <p style={{ color: 'var(--bad)' }} role="alert">{err}</p>}

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
      {ran && !searching && !err && res.length === 0 && <p className="faint">ไม่พบผู้สมัคร</p>}
    </main>
  )
}
