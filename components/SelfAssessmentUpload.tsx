'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateUpload } from '@/lib/self/validateUpload'

export default function SelfAssessmentUpload({ label }: { label: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (busy) return
    setError('')
    const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
    if (invalid) return setError(invalid)

    setBusy(true)
    const form = new FormData()
    form.append('file', file!)
    const res = await fetch('/api/self-assessment', { method: 'POST', body: form })
    setBusy(false)

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    setFile(null)
    router.refresh()
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setError('')
            setFile(e.target.files?.[0] ?? null)
          }}
        />
        <button className="btn btn-primary" onClick={submit} disabled={busy || !file}>
          {busy ? 'กำลังวิเคราะห์…' : label}
        </button>
      </div>
      {busy && (
        <p className="faint" style={{ fontSize: 13 }}>
          กำลังอ่านไฟล์และวิเคราะห์ด้วย AI อาจใช้เวลา 10–20 วินาที กรุณาอย่าปิดหน้านี้
        </p>
      )}
      {error && <p style={{ color: 'var(--bad)', marginBottom: 0 }}>{error}</p>}
    </div>
  )
}
