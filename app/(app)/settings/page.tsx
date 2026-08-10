'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import ChangePasswordCard from '@/components/ChangePasswordCard'

export default function SettingsPage() {
  const db = getBrowserClient()
  const [defaultRequirement, setDefaultRequirement] = useState('')
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const { data } = await db.from('profiles').select('settings').eq('id', user.id).maybeSingle()
      setDefaultRequirement((data as any)?.settings?.defaultRequirement ?? '')
      setLoaded(true)
    })()
  }, [])

  const save = async () => {
    setMsg('')
    const { data: { user } } = await db.auth.getUser()
    if (!user) return
    const { error } = await db.from('profiles').update({ settings: { defaultRequirement } }).eq('id', user.id)
    setMsg(error ? error.message : 'บันทึกแล้ว')
  }

  const logout = async () => {
    await db.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <main style={{ maxWidth: 560 }}>
      <h1>ตั้งค่า</h1>

      <div className="card">
        <h3>ตำแหน่ง/สกิลที่มองหาบ่อย</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
          กรอกคุณสมบัติที่บริษัทคุณมองหาบ่อยที่สุด ระบบจะเติมข้อความนี้ให้อัตโนมัติในช่อง “ประเมินความเหมาะสม” ตอนเปิดดูโปรไฟล์ผู้สมัคร
        </p>
        <input
          className="input"
          value={defaultRequirement}
          onChange={(e) => setDefaultRequirement(e.target.value)}
          placeholder="เช่น Data scientist สาย Python ที่จบจากต่างประเทศ"
          disabled={!loaded}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={!loaded}>บันทึก</button>
          {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
        </div>
      </div>

      <ChangePasswordCard />

      <div className="card" style={{ marginTop: 16 }}>
        <h3>บัญชี</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>ออกจากระบบบัญชีนี้บนอุปกรณ์นี้</p>
        <button className="btn" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={logout}>ออกจากระบบ</button>
      </div>
    </main>
  )
}
