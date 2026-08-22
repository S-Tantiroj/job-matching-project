'use client'
import { useState } from 'react'
import ScoreBadge from './ScoreBadge'

type Result = { score: number; reasoning: string; cached?: boolean }

export default function RoleScorePanel({ profileId }: { profileId: string }) {
  const [requirement, setRequirement] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  const run = async () => {
    if (busy || !requirement.trim()) return
    setBusy(true)
    setError('')
    setResult(null)
    const res = await fetch(`/api/self-assessment/${profileId}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requirement }),
    })
    setBusy(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    setResult(json)
  }

  return (
    <div className="card">
      <h3>ประเมินกับตำแหน่งที่สนใจ</h3>
      <div className="row">
        <input
          className="input"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="เช่น Data Scientist สาย Python"
        />
        <button className="btn btn-primary" onClick={run} disabled={busy || !requirement.trim()}>
          {busy ? 'กำลังประเมิน…' : 'ประเมิน'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {result && (
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
          <ScoreBadge score={result.score} />
          <div>
            {result.cached && (
              <span className="faint" style={{ fontSize: 12 }}>(จาก cache)</span>
            )}
            <p style={{ margin: 0 }}>{result.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  )
}
