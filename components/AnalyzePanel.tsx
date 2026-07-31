'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import ScoreBadge from './ScoreBadge'

export default function AnalyzePanel({ candidateId }: { candidateId: string }) {
  const [requirement, setRequirement] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ score: number; reasoning: string; cached?: boolean } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const db = getBrowserClient()
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const { data } = await db.from('profiles').select('settings').eq('id', user.id).maybeSingle()
      const def = (data as any)?.settings?.defaultRequirement
      if (def) setRequirement(def)
    })()
  }, [])

  const run = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidateId, requirement }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'error')
      setResult(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>ประเมินความเหมาะสม (AI)</h3>
      <div className="row">
        <input
          className="input"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="สกิล/ตำแหน่งที่ต้องการ เช่น Python data scientist"
        />
        <button className="btn btn-primary" onClick={run} disabled={loading || !requirement}>
          {loading ? 'กำลังประเมิน…' : 'ประเมิน'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {result && (
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
          <ScoreBadge score={result.score} />
          <div>
            {result.cached && <span className="faint" style={{ fontSize: 12 }}>(จาก cache)</span>}
            <p style={{ margin: 0 }}>{result.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  )
}
