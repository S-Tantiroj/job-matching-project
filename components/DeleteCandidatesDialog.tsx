'use client'
import { useState } from 'react'

export type DeleteTarget = { id: string; full_name: string; reimportable: boolean }

export default function DeleteCandidatesDialog({
  targets,
  onClose,
  onDone,
}: {
  targets: DeleteTarget[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [suppress, setSuppress] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const back = targets.filter((t) => t.reimportable)
  const many = targets.length > 1

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError('')

    const single = targets.length === 1
    const res = single
      ? await fetch(`/api/candidates/${targets[0].id}`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ suppress, reason }),
        })
      : await fetch('/api/candidates/delete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: targets.map((t) => t.id), suppress, reason }),
        })

    setBusy(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }

    const json = await res.json().catch(() => ({}))
    let msg = `ลบแล้ว ${json.deleted ?? targets.length} รายการ`
    if (json.suppressed) msg += ` · ห้ามนำเข้าอีก ${json.suppressed} รายการ`
    if (json.unblockable?.length) {
      msg += ` · ${json.unblockable.length} รายการไม่มี LinkedIn URL จึงกันการนำเข้าซ้ำไม่ได้`
    }
    onDone(msg)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h2 className="modal-title">ลบ {many ? `${targets.length} รายการ` : 'ผู้สมัคร'}</h2>

        {!many && <p style={{ fontWeight: 500, margin: '0 0 8px' }}>{targets[0].full_name}</p>}

        {many && (
          <p className="faint" style={{ marginTop: 0 }}>
            {targets.slice(0, 5).map((t) => t.full_name).join(', ')}
            {targets.length > 5 ? ` และอีก ${targets.length - 5} คน` : ''}
          </p>
        )}

        <p className="faint" style={{ fontSize: 13 }}>
          ข้อมูลการศึกษา ประสบการณ์ ทักษะ ผลวิเคราะห์ และรายการในลิสต์ที่บันทึกไว้
          จะถูกลบไปด้วย และกู้คืนไม่ได้
        </p>

        {back.length > 0 && (
          <div
            style={{
              border: '1px solid var(--warn)',
              borderRadius: 'var(--radius-card)',
              padding: '10px 12px',
              margin: '12px 0',
              fontSize: 13.5,
            }}
          >
            <b>{back.length} รายการมาจากการนำเข้าอัตโนมัติ</b>
            <p style={{ margin: '4px 0 10px' }}>
              ถ้าลบเฉยๆ สคริปต์รอบถัดไปจะพากลับเข้ามาใหม่
            </p>
            <label className="row" style={{ gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={suppress}
                onChange={(e) => setSuppress(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>ห้ามนำเข้าอีก — บันทึกไว้ในรายชื่อระงับเพื่อไม่ให้กลับมา</span>
            </label>
          </div>
        )}

        {suppress && (
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span className="faint" style={{ fontSize: 13 }}>เหตุผล (ไม่บังคับ)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ไม่ตรงกลุ่มเป้าหมาย"
              style={{ width: '100%' }}
            />
          </label>
        )}

        {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button
            className="btn btn-primary"
            style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }}
            onClick={run}
            disabled={busy}
          >
            {busy ? 'กำลังลบ…' : 'ลบ'}
          </button>
        </div>
      </div>
    </div>
  )
}
