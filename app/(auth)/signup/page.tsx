'use client'
import { getBrowserClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  const submit = async () => {
    setMsg('')
    const { error } = await getBrowserClient().auth.signUp({ email, password: pw })
    // The profiles row is created automatically by a DB trigger (see migration 002).
    if (error) return setMsg(error.message)
    window.location.href = '/dashboard'
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', display: 'grid', gap: 12 }}>
      <h1>สมัครสมาชิก</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="รหัสผ่าน"
      />
      <button onClick={submit}>สมัคร</button>
      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
      <a href="/login">มีบัญชีแล้ว? เข้าสู่ระบบ</a>
    </main>
  )
}
