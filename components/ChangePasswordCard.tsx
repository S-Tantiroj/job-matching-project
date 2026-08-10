'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { validatePasswordChange } from '@/lib/auth/password'

export default function ChangePasswordCard() {
  const db = getBrowserClient()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const submit = async () => {
    if (busy) return
    setError('')
    setOk('')
    const invalid = validatePasswordChange(current, next, confirm)
    if (invalid) return setError(invalid)

    setBusy(true)
    const { data: { user } } = await db.auth.getUser()
    if (!user?.email) {
      setBusy(false)
      return setError('ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบใหม่')
    }

    // Supabase ไม่ตรวจรหัสผ่านเดิมให้ ต้องยืนยันตัวตนเองก่อนด้วยการล็อกอินซ้ำ
    const { error: signInError } = await db.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (signInError) {
      setBusy(false)
      return setError('รหัสผ่านเดิมไม่ถูกต้อง')
    }

    const { error: updateError } = await db.auth.updateUser({ password: next })
    setBusy(false)
    if (updateError) return setError('เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่')

    setCurrent('')
    setNext('')
    setConfirm('')
    setOk('เปลี่ยนรหัสผ่านแล้ว')
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>เปลี่ยนรหัสผ่าน</h3>
      <div className="stack" style={{ gap: 8 }}>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="รหัสผ่านเดิม" />
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="รหัสผ่านใหม่" />
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ยืนยันรหัสผ่านใหม่" />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
        </button>
        {ok && <span style={{ color: 'var(--ok)' }}>{ok}</span>}
      </div>
      {error && <p style={{ color: 'var(--bad)', marginBottom: 0 }}>{error}</p>}
    </div>
  )
}
