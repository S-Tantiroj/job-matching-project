'use client'
import { useState } from 'react'
import type { Role } from '@/lib/auth/session'

export default function RoleSelect({
  userId,
  role,
  isSelf = false,
}: {
  userId: string
  role: Role
  /** แถวของคนที่กำลังใช้งานอยู่ — ลดสิทธิ์ตัวเองไม่ได้ */
  isSelf?: boolean
}) {
  const [value, setValue] = useState<Role>(role)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [failed, setFailed] = useState(false)

  const change = async (next: Role) => {
    const previous = value
    setSaving(true)
    setMsg('')
    setFailed(false)
    setValue(next)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, role: next }),
      })

      if (!res.ok) {
        // **ต้องคืนค่าในช่องกลับ** — เดิมตั้งค่าใหม่ไว้ตั้งแต่ก่อนยิงคำขอแล้วไม่เคย
        // ย้อนกลับ ผลคือคำขอที่ล้มเหลวยังทำให้หน้าจอแสดง role ใหม่ค้างไว้
        // ผู้ใช้เห็น "member" ในช่องทั้งที่ฐานข้อมูลยังเป็น admin — หน้าจอโกหก
        setValue(previous)
        const j = await res.json().catch(() => ({}))
        setFailed(true)
        setMsg(j?.error ?? 'เปลี่ยนสิทธิ์ไม่สำเร็จ')
        return
      }
      setMsg('บันทึกแล้ว')
    } catch {
      setValue(previous)
      setFailed(true)
      setMsg('เชื่อมต่อไม่ได้')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {isSelf && <span className="chip">คุณ</span>}
      <select
        className="select"
        style={{ width: 'auto' }}
        value={value}
        onChange={(e) => change(e.target.value as Role)}
        disabled={saving || isSelf}
        // ปิดช่องของตัวเองไปเลย พร้อมบอกเหตุผล ดีกว่าปล่อยให้กดแล้วเจอ error
        // — ประตูจริงอยู่ที่เซิร์ฟเวอร์ (`checkRoleChange`) อันนี้แค่ไม่ให้เสียเที่ยว
        title={isSelf ? 'ลดสิทธิ์ของตัวเองไม่ได้ ให้แอดมินคนอื่นเป็นคนเปลี่ยนให้' : undefined}
      >
        <option value="member">member</option>
        <option value="data_manager">data manager</option>
        <option value="admin">admin</option>
      </select>
      {msg && (
        <span style={{ fontSize: 12, color: failed ? 'var(--bad)' : 'var(--ok)', maxWidth: 260 }}>
          {msg}
        </span>
      )}
    </span>
  )
}
