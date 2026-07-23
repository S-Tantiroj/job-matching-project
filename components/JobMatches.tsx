'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'

type Match = { id: string; full_name: string; headline?: string; score: number }
type Deep = { score: number; reasoning: string }

// Loads vector-ranked candidates for a job, with an on-demand LLM deep-score
// button per candidate (POST /api/jobs/[id]/analyze).
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

  if (loading) return <p style={{ color: '#888' }}>กำลังจัดอันดับผู้สมัคร…</p>
  if (!rows.length) return <p style={{ color: '#888' }}>ยังไม่มีผู้สมัครที่เข้าเกณฑ์</p>

  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {rows.map((c) => {
        const d = deep[c.id]
        return (
          <li key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid #f2f2f2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ScoreBadge score={c.score} />
              <Link href={`/candidates/${c.id}`} style={{ fontWeight: 600 }}>
                {c.full_name}
              </Link>
              <span style={{ color: '#888' }}>{c.headline}</span>
              <button
                onClick={() => analyze(c.id)}
                disabled={d === 'loading'}
                style={{ marginLeft: 'auto' }}
              >
                {d === 'loading' ? 'กำลังวิเคราะห์…' : 'วิเคราะห์เชิงลึก'}
              </button>
            </div>
            {d && d !== 'loading' && (
              <div style={{ marginTop: 6, marginLeft: 40, fontSize: 14 }}>
                <ScoreBadge score={d.score} /> <span style={{ color: '#555' }}>{d.reasoning}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
