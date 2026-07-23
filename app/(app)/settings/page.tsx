'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

// Per-user settings stored in profiles.settings (jsonb). Currently: a default
// requirement string prefilled on the candidate analyze panel later if desired.
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
    const { error } = await db
      .from('profiles')
      .update({ settings: { defaultRequirement } })
      .eq('id', user.id)
    setMsg(error ? error.message : 'บันทึกแล้ว')
  }

  return (
    <main style={{ maxWidth: 520 }}>
      <h1>ตั้งค่า</h1>
      <label style={{ display: 'block', margin: '16px 0 4px', fontWeight: 600 }}>
        ตำแหน่ง/สกิลที่มองหาบ่อย
      </label>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: '#777' }}>
        กรอกคุณสมบัติที่บริษัทคุณมองหาบ่อยที่สุด ระบบจะเติมข้อความนี้ให้อัตโนมัติในช่อง
        “ประเมินความเหมาะสม” ตอนเปิดดูโปรไฟล์ผู้สมัคร จะได้ไม่ต้องพิมพ์ซ้ำทุกครั้ง
      </p>
      <input
        style={{ width: '100%' }}
        value={defaultRequirement}
        onChange={(e) => setDefaultRequirement(e.target.value)}
        placeholder="เช่น Data scientist สาย Python ที่จบจากต่างประเทศ"
        disabled={!loaded}
      />
      <div style={{ marginTop: 12 }}>
        <button onClick={save} disabled={!loaded}>
          บันทึก
        </button>
      </div>
      {msg && <p style={{ color: '#16a34a' }}>{msg}</p>}
    </main>
  )
}
