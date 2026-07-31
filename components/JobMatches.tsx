'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'

type Match = { id: string; full_name: string; headline?: string; score: number }
type Deep = { score: number; reasoning: string }

export default function JobMatches({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [deep, setDeep] = useState<Record<string, Deep | 'loading'>>({})

  useEffect(() => {
    ;(async () => {
      const r = await fetch(`/api/jobs/${jobId}/match`)
      const json = await r.json()
      setRows(Array.isArray(json) ? json : [])
      setLoading(false)
    })()
  }, [jobId])

  const analyze = async (candidateId: string) => {
    setDeep((d) => ({ ...d, [candidateId]: 'loading' }))
    const r = await fetch(`/api/jobs/${jobId}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })
    const json = await r.json()
    setDeep((d) => ({ ...d, [candidateId]: { score: json.score, reasoning: json.reasoning } }))
  }

  if (loading) return <p className="faint">กำลังจัดอันดับผู้สมัคร…</p>
  if (!rows.length) return <p className="faint">ยังไม่มีผู้สมัครที่เข้าเกณฑ์</p>

  return (
    <div className="stack">
      {rows.map((c) => {
        const d = deep[c.id]
        return (
          <div key={c.id} className="result-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="row">
              <ScoreBadge score={c.score} />
              <Link href={`/candidates/${c.id}`} style={{ fontWeight: 500 }}>{c.full_name}</Link>
              <span className="muted">{c.headline}</span>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => analyze(c.id)} disabled={d === 'loading'}>
                {d === 'loading' ? 'กำลังวิเคราะห์…' : 'วิเคราะห์เชิงลึก'}
              </button>
            </div>
            {d && d !== 'loading' && (
              <div className="row" style={{ marginTop: 8, marginLeft: 44, fontSize: 14, alignItems: 'flex-start' }}>
                <ScoreBadge score={d.score} />
                <span className="muted">{d.reasoning}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
