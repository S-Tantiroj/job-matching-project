'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { normalizeDisplayName, DISPLAY_NAME_MAX } from '@/lib/auth/identity'

// เปลี่ยนชื่อที่แสดงของตัวเอง
//
// เขียนผ่าน browser client ได้เพราะ migration 019 คืนสิทธิ์ UPDATE ให้เฉพาะ
// (display_name, settings) — คอลัมน์อื่นรวมถึง role และ email ถูกปฏิเสธที่ฐานข้อมูล
// ไม่ใช่แค่ที่หน้าจอ ถ้าใครลบการ์ดนี้ทิ้งแล้วยิง PATCH เองก็ยังแก้ได้แค่สองคอลัมน์นี้
//
// **อีเมลแสดงไว้อ่านอย่างเดียว** เพื่อให้ผู้ใช้เห็นว่าบัญชีนี้ยังถูกระบุด้วยอีเมลอยู่
// การเปลี่ยนชื่อไม่ได้ทำให้หายไปจากสายตาแอดมินหรือบันทึกกิจกรรม
export default function DisplayNameCard() {
  const db = getBrowserClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data } = await db
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
      setName((data as any)?.display_name ?? '')
      setLoaded(true)
    })()
  }, [])

  const save = async () => {
    if (busy) return
    setError('')
    setOk('')

    const r = normalizeDisplayName(name)
    if (!r.ok) return setError(r.reason)

    setBusy(true)
    const { data: { user } } = await db.auth.getUser()
    if (!user) {
      setBusy(false)
      return setError('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')
    }

    const { error: updateError } = await db
      .from('profiles')
      .update({ display_name: r.value })
      .eq('id', user.id)
    setBusy(false)

    if (updateError) {
      // ไม่โชว์ข้อความดิบจาก Postgres ให้ผู้ใช้ตามกติกาของโปรเจกต์
      console.error('display name update failed:', updateError.message)
      return setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
    }

    // สะท้อนค่าที่บันทึกจริง (ตัดช่องว่างแล้ว) กลับเข้าช่อง ไม่ใช่ค่าที่ผู้ใช้พิมพ์
    // ไม่งั้นช่องจะแสดงค่าที่ต่างจากที่อยู่ในฐานข้อมูลโดยไม่มีอะไรบอก
    setName(r.value)
    setOk('บันทึกแล้ว')
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>ชื่อที่แสดง</h3>
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        ชื่อนี้จะปรากฏในบันทึกกิจกรรมและหน้าจัดการผู้ใช้
        {email && ` บัญชีของคุณยังถูกระบุด้วยอีเมล ${email} เสมอ`}
      </p>
      <input
        className="input"
        value={name}
        maxLength={DISPLAY_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="เช่น สิวกร ต."
        disabled={!loaded || busy}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={!loaded || busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
        {ok && <span style={{ color: 'var(--ok)' }}>{ok}</span>}
        {error && <span style={{ color: 'var(--bad)' }}>{error}</span>}
      </div>
    </div>
  )
}
