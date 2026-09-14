'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import ChangePasswordCard from '@/components/ChangePasswordCard'
import DisplayNameCard from '@/components/DisplayNameCard'
import DeleteSelfDataCard from '@/components/DeleteSelfDataCard'
import { readDefaultRequirement, mergeSettings } from '@/lib/settings/profileSettings'

export default function SettingsPage() {
  const db = getBrowserClient()
  const [defaultRequirement, setDefaultRequirement] = useState('')
  // เก็บ settings ทั้งก้อนไว้ เพื่อรวมตอนบันทึกแทนการเขียนทับ
  const [rawSettings, setRawSettings] = useState<unknown>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  // **แยก "โหลดไม่สำเร็จ" ออกจาก "ยังไม่เคยตั้งค่า" ให้ได้**
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const { data, error } = await db
        .from('profiles')
        .select('settings')
        .eq('id', user.id)
        .maybeSingle()

      // เดิมโค้ดนี้เขียนว่า `const { data } = await ...` แล้วไม่เคยดู error เลย
      // อ่านล้ม -> data เป็น null -> ช่องขึ้นว่าง -> ผู้ใช้นึกว่ายังไม่เคยตั้ง
      // **พอกดบันทึกก็ทับค่าจริงที่ยังอยู่ในฐานข้อมูลหายไป** ซึ่งทำข้อมูลหายจริง
      // ไม่ใช่แค่แสดงผิด จึงต้องทั้งบอกผู้ใช้ และ **ปิดปุ่มบันทึกไว้**
      if (error) {
        console.error('settings read failed:', error.message)
        setLoadFailed(true)
        setLoaded(true)
        return
      }

      setRawSettings((data as any)?.settings ?? null)
      setDefaultRequirement(readDefaultRequirement((data as any)?.settings))
      setLoaded(true)
    })()
  }, [])

  const save = async () => {
    setMsg('')
    setErr('')
    const { data: { user } } = await db.auth.getUser()
    if (!user) return

    const { error } = await db
      .from('profiles')
      .update({ settings: mergeSettings(rawSettings, { defaultRequirement }) })
      .eq('id', user.id)

    if (error) {
      // ห้ามโชว์ข้อความ Postgres ดิบ — มันบอกชื่อตารางและคอลัมน์ให้คนนอกเห็น
      console.error('settings save failed:', error.message)
      setErr('บันทึกไม่สำเร็จ กรุณาลองใหม่')
      return
    }
    setRawSettings(mergeSettings(rawSettings, { defaultRequirement }))
    setMsg('บันทึกแล้ว')
  }

  const logout = async () => {
    await db.auth.signOut()
    window.location.href = '/login'
  }

  const canSave = loaded && !loadFailed

  return (
    <main style={{ maxWidth: 560 }}>
      <h1>ตั้งค่า</h1>

      <DisplayNameCard />

      <div className="card" style={{ marginTop: 16 }}>
        <h3>ตำแหน่ง/สกิลที่มองหาบ่อย</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
          กรอกคุณสมบัติที่บริษัทคุณมองหาบ่อยที่สุด ระบบจะเติมข้อความนี้ให้อัตโนมัติในช่อง “ประเมินความเหมาะสม” ตอนเปิดดูโปรไฟล์ผู้สมัคร
        </p>

        {loadFailed ? (
          <p style={{ color: 'var(--bad)', fontSize: 13 }}>
            โหลดค่าที่ตั้งไว้ไม่สำเร็จ <strong>ยังบันทึกไม่ได้</strong> เพื่อไม่ให้ทับค่าเดิมที่อาจมีอยู่
            กรุณารีเฟรชหน้านี้อีกครั้ง
          </p>
        ) : (
          <input
            className="input"
            value={defaultRequirement}
            onChange={(e) => setDefaultRequirement(e.target.value)}
            placeholder="เช่น Data scientist สาย Python ที่จบจากต่างประเทศ"
            disabled={!canSave}
          />
        )}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={!canSave}>บันทึก</button>
          {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
          {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
        </div>
      </div>

      <ChangePasswordCard />

      <DeleteSelfDataCard />

      <div className="card" style={{ marginTop: 16 }}>
        <h3>บัญชี</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>ออกจากระบบบัญชีนี้บนอุปกรณ์นี้</p>
        <button className="btn" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={logout}>ออกจากระบบ</button>
      </div>
    </main>
  )
}
