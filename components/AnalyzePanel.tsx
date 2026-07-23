'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import ScoreBadge from './ScoreBadge'

// Deep per-candidate AI analysis (calls /api/analyze). Reasoning is in Thai.
// Prefills the requirement from the user's saved default (Settings page).
export default function AnalyzePanel({ candidateId }: { candidateId: string }) {
  const [requirement, setRequirement] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ score: number; reasoning: string; cached?: boolean } | null>(
    null
  )
  const [error, setError] = useState('')

  // Prefill from the user's saved default requirement (Settings).
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
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h3>ประเมินความเหมาะสม (AI)</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1 }}
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="สกิล/ตำแหน่งที่ต้องการ เช่น Python data scientist"
        />
        <button onClick={run} disabled={loading || !requirement}>
          {loading ? 'กำลังประเมิน…' : 'ประเมิน'}
        </button>
      </div>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {result && (
        <div style={{ marginTop: 12 }}>
          <ScoreBadge score={result.score} />{' '}
          {result.cached && <span style={{ fontSize: 12, color: '#999' }}>(จาก cache)</span>}
          <p style={{ marginTop: 8 }}>{result.reasoning}</p>
        </div>
      )}
    </div>
  )
}
