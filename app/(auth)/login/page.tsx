'use client'
import { getBrowserClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  const submit = async () => {
    setMsg('')
    const { error } = await getBrowserClient().auth.signInWithPassword({ email, password: pw })
    if (error) return setMsg(error.message)
    window.location.href = '/dashboard'
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>เข้าสู่ระบบ</h1>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="อีเมล" />
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="รหัสผ่าน" />
        <button className="btn btn-primary" onClick={submit}>เข้าสู่ระบบ</button>
        {msg && <p style={{ color: 'var(--bad)', margin: 0 }}>{msg}</p>}
        <a href="/forgot-password">ลืมรหัสผ่าน?</a>
        <a href="/signup">ยังไม่มีบัญชี? สมัครสมาชิก</a>
      </div>
    </main>
  )
}
