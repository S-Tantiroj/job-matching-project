'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { hasAuthError } from '@/lib/auth/signupFlow'

// หน้าพักหลังผู้ใช้กดลิงก์ยืนยันอีเมล
//
// ทำไมต้องมีหน้านี้แทนที่จะชี้ emailRedirectTo ไป /dashboard ตรงๆ:
// middleware.ts คุ้ม /dashboard และอ่าน session จาก cookie ฝั่ง server ซึ่งทำงาน
// ก่อน JS ฝั่ง client จะได้รัน ตอนผู้ใช้เพิ่งกลับมาจากลิงก์ยืนยัน cookie ยังว่าง
// middleware จึงเด้งไป /login ทันทีและ token ที่ติดมากับ URL หายไปกับ redirect นั้น
// path /auth/* ไม่อยู่ใน matcher ของ middleware หน้านี้จึงเปิดได้โดยไม่ถูกเด้ง
// รอให้ createBrowserClient เขียน session ลง cookie เสร็จ แล้วค่อยพาไป /dashboard
export default function ConfirmEmail() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const db = getBrowserClient()
    let done = false

    // ใช้ full page load ไม่ใช่ router.push เพื่อให้ server อ่าน cookie ใหม่
    // มิฉะนั้น middleware จะยังเห็น request ที่ไม่มี session
    const go = () => {
      if (done) return
      done = true
      window.location.href = '/dashboard'
    }

    // ลิงก์หมดอายุหรือถูกใช้ไปแล้ว Supabase จะส่ง error กลับมาใน query หรือ fragment
    if (hasAuthError(window.location.search, window.location.hash)) {
      setFailed(true)
      return
    }

    // session อาจถูกสร้างเสร็จก่อน listener จะติด จึงต้องเช็คตรงๆ ด้วย
    db.auth.getSession().then(({ data: { session } }) => {
      if (session) go()
    })

    const { data: sub } = db.auth.onAuthStateChange((_event, session) => {
      if (session) go()
    })

    // ถ้าเกินเวลานี้แล้วยังไม่มี session ให้ถอยไปหน้า login แบบไม่ให้ผู้ใช้ค้าง
    // เขายืนยันอีเมลสำเร็จแล้ว แค่ต้องล็อกอินเอง
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        window.location.href = '/login?confirmed=1'
      }
    }, 8000)

    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  return (
    <main className="auth-wrap">
      <div className="card stack">
        {failed ? (
          <>
            <h1 style={{ margin: 0 }}>ลิงก์ยืนยันไม่ถูกต้อง</h1>
            <p className="muted" style={{ margin: 0 }}>
              ลิงก์นี้อาจหมดอายุหรือถูกใช้ไปแล้ว ลองเข้าสู่ระบบดู ถ้ายังไม่ได้ให้สมัครใหม่อีกครั้ง
            </p>
            <a href="/login">ไปหน้าเข้าสู่ระบบ</a>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0 }}>กำลังเข้าสู่ระบบ…</h1>
            <p className="faint" style={{ margin: 0 }}>ยืนยันอีเมลเรียบร้อยแล้ว กำลังพาไปหน้า Dashboard</p>
          </>
        )}
      </div>
    </main>
  )
}
