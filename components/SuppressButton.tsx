'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SuppressButton({
  candidateId,
  fullName,
}: {
  candidateId: string
  fullName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/candidates/${candidateId}/suppress`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    router.push('/candidates')
  }

  return (
    <>
      <button
        className="btn"
        style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
        onClick={() => setOpen(true)}
      >
        ลบและห้ามนำเข้าอีก
      </button>

      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">ลบ {fullName} และห้ามนำเข้าอีก</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              ข้อมูลของผู้สมัครนี้จะถูกลบถาวร และระบบจะไม่นำเข้าอีกไม่ว่าจะมาจากช่องทางใด
              การกระทำนี้ย้อนกลับไม่ได้
            </p>
            <div className="field-label">เหตุผล (เก็บเป็นหลักฐานการใช้สิทธิ์)</div>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น เจ้าของข้อมูลขอให้ลบเมื่อ 24/08/2026"
            />
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="btn"
                style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
                onClick={submit}
                disabled={busy}
              >
                {busy ? 'กำลังลบ…' : 'ยืนยันลบและระงับ'}
              </button>
              <button className="btn" onClick={() => setOpen(false)} disabled={busy}>
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
