'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type PendingRow = {
  id: string
  full_name: string
  headline: string | null
  linkedin_url: string | null
  missing: string[]
  created_at: string
}

const LABELS: Record<string, string> = {
  headline: 'ไม่มีตำแหน่งย่อ',
  experience: 'ไม่มีประสบการณ์',
  linkedin_url: 'ไม่มี LinkedIn URL',
  education: 'ไม่มีการศึกษา',
}

export default function PendingReviewTable({ rows }: { rows: PendingRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const reset = () => {
    setError('')
    setNotice('')
    setProgress('')
  }

  const approveOne = async (id: string) => {
    const res = await fetch(`/api/pending/${id}/approve`, { method: 'POST' })
    if (res.ok) return null
    const json = await res.json().catch(() => ({}))
    return json.error ?? 'เกิดข้อผิดพลาด'
  }

  const approve = async (id: string) => {
    if (busy) return
    setBusy(true)
    reset()
    const err = await approveOne(id)
    setBusy(false)
    if (err) return setError(err)
    router.refresh()
  }

  // อนุมัติทีละรายการตามลำดับ ไม่ยิงพร้อมกัน — การอนุมัติหนึ่งรายการใช้ Gemini embedding
  // หนึ่งครั้ง การยิงขนานจะชนเพดานทันที และรายที่ล้มไม่ควรทำให้รายอื่นล้มตาม
  const approveSelected = async () => {
    if (busy || !selected.size) return
    setBusy(true)
    reset()

    const ids = [...selected]
    const failed: string[] = []
    let done = 0

    for (const id of ids) {
      setProgress(`กำลังอนุมัติ ${done + 1}/${ids.length}…`)
      const err = await approveOne(id)
      if (err) failed.push(err)
      done++
    }

    setBusy(false)
    setProgress('')
    setSelected(new Set())

    const ok = ids.length - failed.length
    if (failed.length) {
      setError(`อนุมัติสำเร็จ ${ok} รายการ ล้มเหลว ${failed.length} รายการ — ${failed[0]}`)
    } else {
      setNotice(`อนุมัติสำเร็จ ${ok} รายการ`)
    }
    router.refresh()
  }

  const rejectIds = async (ids: string[]) => {
    if (busy || !ids.length) return
    setBusy(true)
    reset()
    const res = await fetch('/api/pending/reject', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    setSelected(new Set())
    router.refresh()
  }

  if (!rows.length) return <p className="faint">ไม่มีรายการรอตรวจ</p>

  return (
    <div>
      <div className="row" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={approveSelected} disabled={busy || !selected.size}>
          อนุมัติที่เลือก ({selected.size})
        </button>
        <button className="btn" onClick={() => rejectIds([...selected])} disabled={busy || !selected.size}>
          ปฏิเสธที่เลือก ({selected.size})
        </button>
        {progress && <span className="faint" style={{ fontSize: 13 }}>{progress}</span>}
      </div>

      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {notice && <p style={{ color: 'var(--ok)' }}>{notice}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>ชื่อ</th>
              <th>ตำแหน่งย่อ</th>
              <th>ขาดอะไร</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`เลือก ${r.full_name}`}
                  />
                </td>
                <td>
                  {r.linkedin_url ? (
                    <a href={r.linkedin_url} target="_blank" rel="noreferrer" style={{ fontWeight: 500 }}>
                      {r.full_name} ↗
                    </a>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{r.full_name}</span>
                  )}
                </td>
                <td className="muted">{r.headline ?? '—'}</td>
                <td>
                  {r.missing.map((m) => (
                    <span key={m} className="badge-warn">{LABELS[m] ?? m}</span>
                  ))}
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn btn-ghost" onClick={() => approve(r.id)} disabled={busy}>
                      อนุมัติ
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ color: 'var(--bad)' }}
                      onClick={() => rejectIds([r.id])}
                      disabled={busy}
                    >
                      ปฏิเสธ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
