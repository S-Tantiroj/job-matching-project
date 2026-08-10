'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export default function ResetPassword() {
  const db = getBrowserClient()
  const [ready, setReady] = useState<boolean | null>(null)
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // ผู้ใช้มาจากลิงก์ในอีเมลพร้อม recovery session ถ้าไม่มีแปลว่าเปิด URL ตรง
  // หรือลิงก์หมดอายุ
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await db.auth.getSession()
      setReady(!!session)
    })()
  }, [])

  const submit = async () => {
    if (busy) return
    setError('')
    if (next.length < 6) return setError('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร')
    if (next !== confirm) return setError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน')

    setBusy(true)
    const { error: updateError } = await db.auth.updateUser({ password: next })
    setBusy(false)
    if (updateError) return setError('ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาขอลิงก์ใหม่อีกครั้ง')
    window.location.href = '/dashboard'
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>ตั้งรหัสผ่านใหม่</h1>
        {ready === null && <p className="faint" style={{ margin: 0 }}>กำลังตรวจสอบลิงก์…</p>}
        {ready === false && (
          <>
            <p style={{ color: 'var(--bad)', margin: 0 }}>ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว</p>
            <a href="/forgot-password">ขอลิงก์ใหม่</a>
          </>
        )}
        {ready === true && (
          <>
            <input
              className="input"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="รหัสผ่านใหม่"
            />
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="ยืนยันรหัสผ่านใหม่"
            />
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'กำลังบันทึก…' : 'ตั้งรหัสผ่านใหม่'}
            </button>
            {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
          </>
        )}
      </div>
    </main>
  )
}
