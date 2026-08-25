'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type SuppressedRow = {
  id: string
  linkedin_url: string
  full_name: string | null
  reason: string | null
  created_at: string
}

export default function SuppressedList({ rows }: { rows: SuppressedRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async (id: string) => {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/suppressed/${id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    router.refresh()
  }

  if (!rows.length) return <p className="faint">ยังไม่มีรายชื่อระงับ</p>

  return (
    <div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>ชื่อ</th>
              <th>LinkedIn</th>
              <th>เหตุผล</th>
              <th>วันที่</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.full_name ?? '—'}</td>
                <td className="muted">
                  <a href={r.linkedin_url} target="_blank" rel="noreferrer">เปิด ↗</a>
                </td>
                <td className="muted">{r.reason ?? '—'}</td>
                <td className="muted">{String(r.created_at ?? '').slice(0, 10)}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => remove(r.id)} disabled={busy}>
                    ถอนออก
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
