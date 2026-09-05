'use client'
import { getBrowserClient } from '@/lib/supabase/client'
import { isExistingUser } from '@/lib/auth/signupFlow'
import { useState } from 'react'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  const submit = async () => {
    if (busy) return
    setMsg('')
    setBusy(true)
    const { data, error } = await getBrowserClient().auth.signUp({
      email,
      password: pw,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    setBusy(false)
    if (error) return setMsg(error.message)

    // ดู lib/auth/signupFlow.ts สำหรับเหตุผลว่าทำไมต้องตรวจจาก identities
    if (isExistingUser(data.user)) {
      return setMsg('อีเมลนี้ถูกใช้สมัครแล้ว กรุณาเข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน" หากจำรหัสไม่ได้')
    }

    // เมื่อเปิด "Confirm email" ใน Supabase การสมัครจะยังไม่ให้ session กลับมา
    // ผู้ใช้ต้องกดยืนยันในอีเมลก่อน ถ้าปิดอยู่จะได้ session ทันทีและเข้าใช้งานได้เลย
    // เช็คจาก session จริงแทนการฮาร์ดโค้ด เพื่อให้โค้ดถูกต้องทั้งสองแบบ
    if (data.session) {
      window.location.href = '/dashboard'
      return
    }
    setAwaitingConfirm(true)
  }

  if (awaitingConfirm) {
    return (
      <main className="auth-wrap">
        <div className="card stack">
          <h1 style={{ margin: 0 }}>ยืนยันอีเมลของคุณ</h1>
          <p className="muted" style={{ margin: 0 }}>
            เราส่งลิงก์ยืนยันไปที่ <strong>{email}</strong> แล้ว กรุณาเปิดอีเมลแล้วกดลิงก์เพื่อยืนยัน
            ระบบจะพาเข้าสู่ระบบให้อัตโนมัติ
          </p>
          <p className="faint" style={{ margin: 0, fontSize: 13 }}>
            ไม่พบอีเมล? ลองตรวจในกล่องจดหมายขยะ (spam)
          </p>
          <a href="/login">ไปหน้าเข้าสู่ระบบ</a>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>สมัครสมาชิก</h1>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="อีเมล" />
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="รหัสผ่าน" />
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'กำลังสมัคร…' : 'สมัคร'}
        </button>
        {msg && <p style={{ color: 'var(--bad)', margin: 0 }}>{msg}</p>}
        {/* จุดที่ผู้ใช้ยอมรับข้อกำหนด ต้องอยู่ตรงนี้ก่อนกดสมัคร ไม่ใช่ซ่อนใน footer
            เพราะข้อกำหนดห้ามใช้คะแนน AI ตัดสินคนโดยลำพัง ซึ่งเป็นข้อผูกพันจริง */}
        <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6 }}>
          การสมัครถือว่าท่านยอมรับ <a href="/terms">ข้อกำหนดการใช้งาน</a> และ{' '}
          <a href="/privacy">นโยบายความเป็นส่วนตัว</a>
        </p>
        <a href="/login">มีบัญชีแล้ว? เข้าสู่ระบบ</a>
      </div>
    </main>
  )
}
