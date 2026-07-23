'use client'
import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [foreign, setForeign] = useState(true)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<any[]>([])
  const [ran, setRan] = useState(false)

  const run = async () => {
    if (!q.trim() || loading) return
    setLoading(true)
    setRan(true)
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q, filters: { foreignEduOnly: foreign } }),
    })
    const json = await r.json()
    setRes(Array.isArray(json) ? json : [])
    setLoading(false)
  }

  return (
    <main>
      <h1>ค้นหาผู้สมัคร</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <input
          style={{ flex: 1 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="ค้นหาด้วยภาษาธรรมชาติ เช่น data scientist skilled in Python who studied abroad"
        />
        <button onClick={run} disabled={loading || !q}>
          {loading ? 'กำลังค้นหา…' : 'ค้นหา'}
        </button>
      </div>
      <label style={{ fontSize: 14 }}>
        <input type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} />{' '}
        เฉพาะคนที่จบจากต่างประเทศ
      </label>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
        {res.map((c) => (
          <li
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderBottom: '1px solid #f2f2f2',
            }}
          >
            <ScoreBadge score={c.score} />
            <Link href={`/candidates/${c.id}`} style={{ fontWeight: 600 }}>
              {c.full_name}
            </Link>
            <span style={{ color: '#888' }}>{c.headline}</span>
          </li>
        ))}
      </ul>
      {ran && !loading && res.length === 0 && <p style={{ color: '#888' }}>ไม่พบผู้สมัคร</p>}
    </main>
  )
}
