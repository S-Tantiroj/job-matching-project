'use client'
import { authErrorMessage } from '@/lib/auth/authMessages'
import { accessDeniedMessage, decideAccess } from '@/lib/auth/profileGate'
import { getBrowserClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  // อ่านจาก window แทน useSearchParams เพื่อเลี่ยงข้อกำหนด Suspense boundary
  // ของ Next.js 15 ที่จะทำให้ build ไม่ผ่าน
  useEffect(() => {
    setConfirmed(new URLSearchParams(window.location.search).get('confirmed') === '1')
  }, [])

  const submit = async () => {
    setMsg('')
    const sb = getBrowserClient()
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pw })
    if (error) return setMsg(authErrorMessage(error.message))

    // **ด่านนี้อยู่ที่นี่เพื่อกันการวนลูป ไม่ใช่เพื่อความปลอดภัย**
    // ด่านจริงคือ `getSession()` ฝั่งเซิร์ฟเวอร์ ซึ่งคืน null เมื่อไม่มีแถวใน profiles
    // ถ้าไม่เช็คตรงนี้ด้วย ผู้ใช้จะล็อกอินสำเร็จ → ถูกเด้งกลับมาหน้านี้ → ล็อกอินสำเร็จ
    // ไปเรื่อยๆ โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
    const uid = data.user?.id
    if (uid) {
      const { data: p, error: readError } = await sb
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .maybeSingle()
      const decision = decideAccess(p, !!readError)
      if (!decision.allowed) {
        // ออกจากระบบก่อนแสดงข้อความ ไม่งั้นคุกกี้ค้างไว้แล้วผู้ใช้อยู่ในสถานะ
        // "ล็อกอินอยู่แต่ทำอะไรไม่ได้" ซึ่งอธิบายยากกว่าการไม่ได้ล็อกอิน
        await sb.auth.signOut()
        return setMsg(accessDeniedMessage(decision.reason))
      }
    }

    window.location.href = '/dashboard'
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>เข้าสู่ระบบ</h1>
        {confirmed && (
          <p style={{ color: 'var(--ok)', margin: 0 }}>ยืนยันอีเมลเรียบร้อยแล้ว เข้าสู่ระบบได้เลย</p>
        )}
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="อีเมล" />
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="รหัสผ่าน" />
        <button className="btn btn-primary" onClick={submit}>เข้าสู่ระบบ</button>
        {msg && <p style={{ color: 'var(--bad)', margin: 0 }}>{msg}</p>}
        <a href="/forgot-password">ลืมรหัสผ่าน?</a>
        <a href="/signup">ยังไม่มีบัญชี? สมัครสมาชิก</a>
        {/* หน้าแรกเปิดได้โดยไม่ต้องล็อกอินโดยตั้งใจ (ดู middleware matcher)
            ไม่มีลิงก์นี้ สามหน้า auth จะเป็นทางตันสำหรับคนที่แค่อยากดูว่าเว็บนี้คืออะไร */}
        <a href="/" className="faint">← กลับหน้าแรก</a>
      </div>
    </main>
  )
}
