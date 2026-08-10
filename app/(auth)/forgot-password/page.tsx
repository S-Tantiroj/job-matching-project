'use client'
import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    if (busy || !email.trim()) return
    setBusy(true)
    await getBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    // แสดงข้อความเดียวกันเสมอไม่ว่าอีเมลจะมีอยู่จริงหรือไม่
    // เพื่อไม่เปิดเผยว่าใครเป็นสมาชิกของระบบ
    setSent(true)
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>ลืมรหัสผ่าน</h1>
        {sent ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาตรวจกล่องจดหมาย
            </p>
            <a href="/login">กลับไปหน้าเข้าสู่ระบบ</a>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="อีเมล"
            />
            <button className="btn btn-primary" onClick={submit} disabled={busy || !email.trim()}>
              {busy ? 'กำลังส่ง…' : 'ส่งลิงก์รีเซ็ต'}
            </button>
            <a href="/login">กลับไปหน้าเข้าสู่ระบบ</a>
          </>
        )}
      </div>
    </main>
  )
}
