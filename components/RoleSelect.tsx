'use client'
import { useState } from 'react'
import type { Role } from '@/lib/auth/session'

export default function RoleSelect({
  userId,
  role,
}: {
  userId: string
  role: Role
}) {
  const [value, setValue] = useState<Role>(role)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const change = async (next: Role) => {
    setSaving(true)
    setMsg('')
    setValue(next)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, role: next }),
    })
    setSaving(false)
    setMsg(res.ok ? 'บันทึกแล้ว' : 'ผิดพลาด')
  }

  return (
    <span className="row">
      <select className="select" style={{ width: 'auto' }} value={value} onChange={(e) => change(e.target.value as Role)} disabled={saving}>
        <option value="member">member</option>
        <option value="data_manager">data manager</option>
        <option value="admin">admin</option>
      </select>
      {msg && <span style={{ fontSize: 12, color: 'var(--ok)' }}>{msg}</span>}
    </span>
  )
}
