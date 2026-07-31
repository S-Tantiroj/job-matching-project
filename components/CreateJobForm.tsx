'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateJobForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [skills, setSkills] = useState('')
  const [minExp, setMinExp] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!title.trim() || !description.trim() || saving) return
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        company: company || undefined,
        description,
        required_skills: skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        min_experience_years: minExp ? Number(minExp) : undefined,
        location: location || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setMsg('บันทึกไม่สำเร็จ')
      return
    }
    setTitle('')
    setCompany('')
    setSkills('')
    setMinExp('')
    setLocation('')
    setDescription('')
    setMsg('เพิ่มงานแล้ว')
    router.refresh()
  }

  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 8, marginBottom: 24 }}>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ตำแหน่งงาน (เช่น Data Scientist)" />
      <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="บริษัท (ไม่บังคับ)" />
      <input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="สกิลที่ต้องการ คั่นด้วยจุลภาค เช่น Python, SQL" />
      <input className="input" value={minExp} onChange={(e) => setMinExp(e.target.value)} placeholder="ประสบการณ์ขั้นต่ำ (ปี)" type="number" />
      <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="สถานที่ (ไม่บังคับ)" />
      <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" rows={4} />
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={saving || !title || !description}>
          {saving ? 'กำลังบันทึก…' : 'เพิ่มงาน'}
        </button>
        {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
      </div>
    </div>
  )
}
