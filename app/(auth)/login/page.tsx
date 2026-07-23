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
    <main style={{ maxWidth: 360, margin: '80px auto', display: 'grid', gap: 12 }}>
      <h1>เข้าสู่ระบบ</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="รหัสผ่าน"
      />
      <button onClick={submit}>เข้าสู่ระบบ</button>
      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
      <a href="/signup">ยังไม่มีบัญชี? สมัครสมาชิก</a>
    </main>
  )
}
