'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CandidateRow } from './CandidatesTable'

const FIELDS: { key: keyof CandidateRow; label: string; textarea?: boolean }[] = [
  { key: 'full_name', label: 'ชื่อ' },
  { key: 'headline', label: 'ตำแหน่งย่อ' },
  { key: 'location', label: 'สถานที่' },
  { key: 'summary', label: 'สรุปโปรไฟล์', textarea: true },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'professional_email', label: 'อีเมล' },
]

export default function EditCandidateModal({
  row,
  onClose,
}: {
  row: CandidateRow
  onClose: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    full_name: row.full_name ?? '',
    headline: row.headline ?? '',
    location: row.location ?? '',
    summary: row.summary ?? '',
    linkedin_url: row.linkedin_url ?? '',
    professional_email: row.professional_email ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/candidates/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">แก้ไขข้อมูลผู้สมัคร</h2>
        <div className="stack" style={{ gap: 10 }}>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <div className="field-label">{f.label}</div>
              {f.textarea ? (
                <textarea
                  className="textarea"
                  rows={4}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className="input"
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p style={{ color: 'var(--bad)', marginTop: 10 }}>{error}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
        </div>
      </div>
    </div>
  )
}
