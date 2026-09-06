'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateUpload } from '@/lib/self/validateUpload'
import { EMPTY_DRAFT, type ProfileDraft } from '@/lib/self/profileDraft'
import ProfileForm from './ProfileForm'

type Step =
  | { name: 'choose' }
  | { name: 'form'; draft: ProfileDraft; fileName?: string }

// สองทางเข้าคู่กันตั้งแต่แรก ไม่ใช่ให้ "กรอกเอง" โผล่เฉพาะตอนอัปโหลดล้มเหลว
// เพราะคนที่ไม่มีไฟล์ CV เลย — นักศึกษาจบใหม่ หรือคนที่ประวัติอยู่ใน Google Docs —
// จะต้องแกล้งอัปโหลดอะไรสักอย่างให้พังก่อนถึงจะเจอทางที่ใช้ได้ ซึ่งไม่มีใครเดาออก
export default function SelfAssessmentStart({ label }: { label: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const upload = async () => {
    if (busy) return
    setError('')
    const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
    if (invalid) return setError(invalid)

    setBusy(true)
    const form = new FormData()
    form.append('file', file!)
    const res = await fetch('/api/self-assessment/parse', { method: 'POST', body: form })
    setBusy(false)

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
    }
    const json = await res.json()
    setStep({ name: 'form', draft: json.draft, fileName: json.fileName })
  }

  if (step.name === 'form') {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <ProfileForm
          initial={step.draft}
          fileName={step.fileName}
          onSaved={() => {
            setStep({ name: 'choose' })
            setFile(null)
            router.refresh()
          }}
        />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
          onClick={() => setStep({ name: 'choose' })}>
          ← ย้อนกลับ
        </button>
      </div>
    )
  }

  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 12 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            setError('')
            setFile(e.target.files?.[0] ?? null)
          }}
        />
        <button className="btn btn-primary" onClick={upload} disabled={busy || !file}>
          {busy ? 'กำลังอ่านไฟล์…' : label}
        </button>
      </div>
      {busy && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          กำลังอ่านไฟล์ด้วย AI แล้วจะให้คุณตรวจข้อมูลก่อนวิเคราะห์
        </p>
      )}
      {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      <div className="row">
        <span className="faint" style={{ fontSize: 13 }}>ไม่มีไฟล์ CV?</span>
        <button className="btn btn-ghost"
          onClick={() => setStep({ name: 'form', draft: EMPTY_DRAFT })}>
          กรอกข้อมูลด้วยตัวเอง
        </button>
      </div>
    </div>
  )
}
