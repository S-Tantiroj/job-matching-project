'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { MISSING_LABELS, type MissingField } from '@/lib/candidates/quality'
import EditCandidateModal from './EditCandidateModal'

export type CandidateRow = {
  id: string
  full_name: string
  headline: string | null
  location: string | null
  summary: string | null
  linkedin_url: string | null
  professional_email: string | null
  source: string
  years_experience: number | null
  updated_at: string
  missing: MissingField[]
  duplicate: boolean
}

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: 'full_name', label: 'ชื่อ', sortable: true },
  { key: 'headline', label: 'ตำแหน่งย่อ', sortable: false },
  { key: 'location', label: 'สถานที่', sortable: false },
  { key: 'source', label: 'ที่มา', sortable: true },
  { key: 'years_experience', label: 'ปี', sortable: true },
  { key: 'updated_at', label: 'อัปเดต', sortable: true },
  { key: 'issues', label: 'ปัญหา', sortable: false },
]

export default function CandidatesTable({
  rows,
  page,
  totalPages,
  total,
  sort,
  asc,
  q,
  issues,
}: {
  rows: CandidateRow[]
  page: number
  totalPages: number
  total: number
  sort: string
  asc: boolean
  q: string
  issues: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [editing, setEditing] = useState<CandidateRow | null>(null)

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k)
      else next.set(k, v)
    }
    router.push(`/candidates?${next.toString()}`)
  }

  const sortHref = (col: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('sort', col)
    next.set('dir', sort === col && !asc ? 'asc' : 'desc')
    next.delete('page')
    return `/candidates?${next.toString()}`
  }

  return (
    <div>
      <div className="row" style={{ margin: '12px 0', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          defaultValue={q}
          placeholder="ค้นหาชื่อหรือตำแหน่ง"
          onKeyDown={(e) => {
            if (e.key === 'Enter') go({ q: (e.target as HTMLInputElement).value || null, page: null })
          }}
        />
        <button
          className={`btn ${issues ? 'btn-primary' : ''}`}
          onClick={() => go({ issues: issues ? null : '1', page: null })}
        >
          {issues ? 'แสดงทั้งหมด' : 'แสดงเฉพาะที่มีปัญหา'}
        </button>
        <span className="faint" style={{ fontSize: 13, marginLeft: 'auto' }}>ทั้งหมด {total} คน</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key}>
                  {c.sortable ? (
                    <Link href={sortHref(c.key)} className={`table-sort ${sort === c.key ? 'active' : ''}`}>
                      {c.label}{sort === c.key ? (asc ? ' ↑' : ' ↓') : ''}
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/candidates/${r.id}`} style={{ fontWeight: 500 }}>{r.full_name}</Link></td>
                <td className="muted">{r.headline ?? '—'}</td>
                <td className="muted">{r.location ?? '—'}</td>
                <td className="muted">{r.source}</td>
                <td className="muted">{r.years_experience ?? '—'}</td>
                <td className="muted">{r.updated_at.slice(0, 10)}</td>
                <td>
                  {r.duplicate && <span className="badge-issue badge-issue--dup">ชื่อซ้ำ</span>}
                  {r.missing.map((m) => (
                    <span key={m} className="badge-issue">ไม่มี{MISSING_LABELS[m]}</span>
                  ))}
                  {!r.duplicate && r.missing.length === 0 && <span className="faint">—</span>}
                </td>
                <td>
                  <button className="btn btn-ghost" onClick={() => setEditing(r)}>แก้ไข</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && <p className="faint" style={{ marginTop: 14 }}>ไม่พบข้อมูล</p>}

      <div className="pager">
        <button className="btn" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>ก่อนหน้า</button>
        <span className="pager-info">หน้า {page} จาก {Math.max(totalPages, 1)}</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => go({ page: String(page + 1) })}>ถัดไป</button>
      </div>

      {editing && <EditCandidateModal row={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
