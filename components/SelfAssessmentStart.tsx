'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { validateUpload } from '@/lib/self/validateUpload'
import { EMPTY_DRAFT, type ProfileDraft } from '@/lib/self/profileDraft'
import ProfileForm from './ProfileForm'

type Step =
  | { name: 'choose' }
  | { name: 'form'; draft: ProfileDraft; fileName?: string }

// เทียบเลขรุ่นความพยายาม (attempt) ที่บันทึกไว้ตอนเริ่มคำขอ กับเลขรุ่นปัจจุบันของ
// คอมโพเนนต์ — ถ้าไม่ตรงกันแปลว่าผู้ใช้ไปเริ่มอย่างอื่นแล้วระหว่างที่คำขอเก่ายังไม่
// เสร็จ (กดย้อนกลับ, เริ่มอัปโหลดใหม่, ไปกรอกเอง) ต้องทิ้งผลของคำขอเก่าไปเงียบๆ
// ดึงออกมาเป็นฟังก์ชันล้วนเพื่อเทสต์ได้โดยไม่ต้อง mount คอมโพเนนต์ ตามแบบ
// buildTimeline ใน components/Timeline.tsx
export function isStaleAttempt(requestAttempt: number, currentAttempt: number): boolean {
  return requestAttempt !== currentAttempt
}

// สองทางเข้าคู่กันตั้งแต่แรก ไม่ใช่ให้ "กรอกเอง" โผล่เฉพาะตอนอัปโหลดล้มเหลว
// เพราะคนที่ไม่มีไฟล์ CV เลย — นักศึกษาจบใหม่ หรือคนที่ประวัติอยู่ใน Google Docs —
// จะต้องแกล้งอัปโหลดอะไรสักอย่างให้พังก่อนถึงจะเจอทางที่ใช้ได้ ซึ่งไม่มีใครเดาออก
export default function SelfAssessmentStart({ label }: { label: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // เลขรุ่นความพยายามปัจจุบัน เพิ่มทุกครั้งที่เปลี่ยนขั้นตอนหรือเริ่มอัปโหลดใหม่
  // ใช้ ref ไม่ใช่ state เพราะ callback ที่มาช้า (fetch, onSaved) ต้องอ่านค่า
  // "ล่าสุดจริง" ตอนถูกเรียก ไม่ใช่ค่าที่ closure จำไว้ตอนถูกสร้าง
  const attemptRef = useRef(0)
  const nextAttempt = () => (attemptRef.current += 1)

  const upload = async () => {
    if (busy) return
    setError('')
    const invalid = validateUpload(file ? { type: file.type, size: file.size } : null)
    if (invalid) return setError(invalid)

    const myAttempt = nextAttempt()
    setBusy(true)
    const form = new FormData()
    form.append('file', file!)

    try {
      const res = await fetch('/api/self-assessment/parse', { method: 'POST', body: form })
      // ผู้ใช้อาจกดย้อนกลับหรือเริ่มอัปโหลดใหม่ระหว่างรอ — ถ้าไม่ใช่ความพยายาม
      // ล่าสุดแล้ว ทิ้งผลนี้ไปเลย ไม่แตะ state ที่หน้าปัจจุบันไม่ได้ใช้แล้ว
      if (isStaleAttempt(myAttempt, attemptRef.current)) return
      setBusy(false)

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        return setError(json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่')
      }
      const json = await res.json()
      setStep({ name: 'form', draft: json.draft, fileName: json.fileName })
    } catch {
      // ความล้มเหลวระดับเครือข่าย (ออฟไลน์, DNS) — ไม่งั้น busy จะค้าง true ตลอดไป
      if (isStaleAttempt(myAttempt, attemptRef.current)) return
      setBusy(false)
      setError('เชื่อมต่อเครือข่ายไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    }
  }

  if (step.name === 'form') {
    // จำเลขรุ่นตอนเข้าหน้านี้ไว้ในตัวแปรของการ render นี้ — ถ้าผู้ใช้กดย้อนกลับ
    // หรือเริ่มความพยายามอื่นก่อนบันทึกเสร็จ เลขรุ่นจะขยับ แล้ว onSaved ที่มาช้า
    // จะรู้ว่าตัวเองไม่ใช่ของหน้าปัจจุบันอีกต่อไป และไม่ควรพาผู้ใช้ออกจากที่นี่
    const myAttempt = attemptRef.current
    return (
      <div className="stack" style={{ gap: 10 }}>
        <ProfileForm
          initial={step.draft}
          fileName={step.fileName}
          onSaved={() => {
            if (isStaleAttempt(myAttempt, attemptRef.current)) return
            setStep({ name: 'choose' })
            setFile(null)
            router.refresh()
          }}
        />
        <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            nextAttempt()
            setFile(null) // ล้างไฟล์เดิม ไม่งั้นปุ่มอัปโหลดจะยังกดได้ทั้งที่ไม่มีชื่อไฟล์ให้เห็น
            setStep({ name: 'choose' })
          }}>
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
        <button className="btn btn-ghost" disabled={busy}
          onClick={() => {
            nextAttempt()
            setStep({ name: 'form', draft: EMPTY_DRAFT })
          }}>
          กรอกข้อมูลด้วยตัวเอง
        </button>
      </div>
    </div>
  )
}
