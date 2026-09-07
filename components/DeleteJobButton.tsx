'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeleteJobButton({
  jobId,
  title,
  seeded,
}: {
  jobId: string
  title: string
  seeded: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(
          res.status === 403 ? 'คุณไม่มีสิทธิ์ลบงาน' : json.error ?? 'ลบไม่สำเร็จ กรุณาลองใหม่'
        )
        return
      }
      router.push('/jobs')
      router.refresh()
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn"
        style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
        onClick={() => setOpen(true)}
      >
        ลบงาน
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => !busy && setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <p className="modal-title">ลบงาน “{title}” ?</p>
            <p style={{ fontSize: 14 }}>
              ลบแล้วกู้คืนไม่ได้ คะแนนเชิงลึกที่เคยคำนวณไว้กับงานนี้จะถูกลบไปด้วย
            </p>
            {seeded && (
              <p className="faint" style={{ fontSize: 13 }}>
                งานนี้มาจากสคริปต์ตัวอย่าง — รัน <code>npx tsx scripts/seed-jobs.ts</code>{' '}
                อีกครั้งแล้วมันจะกลับมา
              </p>
            )}
            {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
            <div className="row" style={{ marginTop: 14 }}>
              <button
                className="btn"
                style={{ background: 'var(--bad)', borderColor: 'var(--bad)', color: '#fff' }}
                onClick={run}
                disabled={busy}
              >
                {busy ? 'กำลังลบ…' : 'ลบเลย'}
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
