'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { requirementTextChanged, type JobInput } from '@/lib/jobs/normalize'

export type EditableJob = JobInput & { id: string; source: string }

// ฟอร์มเดียวใช้ทั้งสร้างและแก้ ต่างกันแค่ค่าเริ่มต้นกับปลายทางที่ยิง
// (แบบเดียวกับที่ ProfileForm ใช้ทั้งตรวจ draft และกรอกเองในฟีเจอร์ประเมินตัวเอง)
export default function JobForm({
  job,
  cachedScoreCount = 0,
}: {
  job?: EditableJob
  cachedScoreCount?: number
}) {
  const router = useRouter()
  const editing = !!job
  const [title, setTitle] = useState(job?.title ?? '')
  const [company, setCompany] = useState(job?.company ?? '')
  const [skills, setSkills] = useState((job?.required_skills ?? []).join(', '))
  const [minExp, setMinExp] = useState(
    job?.min_experience_years != null ? String(job.min_experience_years) : ''
  )
  const [location, setLocation] = useState(job?.location ?? '')
  const [description, setDescription] = useState(job?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const payload = (): Partial<JobInput> => ({
    title,
    company: company || undefined,
    description,
    required_skills: skills
      ? skills.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
    min_experience_years: minExp ? Number(minExp) : undefined,
    location: location || undefined,
  })

  // คำเตือนแบบสด ไม่ใช่ขึ้นตลอด — โผล่เฉพาะตอนที่การแก้นั้นทำให้ requirement_hash
  // เปลี่ยนจริง แก้แล้วเปลี่ยนกลับเป็นค่าเดิมจะไม่เตือน คำเตือนที่ขึ้นทุกครั้ง
  // คือคำเตือนที่คนเลิกอ่าน
  const willVoidCache =
    editing &&
    cachedScoreCount > 0 &&
    requirementTextChanged(job as JobInput, { ...(job as JobInput), ...payload() })

  const save = async () => {
    if (!title.trim() || !description.trim() || saving) return
    setSaving(true)
    setMsg('')
    setErr('')
    try {
      const res = editing
        ? await fetch(`/api/jobs/${job!.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload()),
          })
        : await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload()),
          })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setErr(
          res.status === 403
            ? 'คุณไม่มีสิทธิ์ทำรายการนี้'
            : json.error ?? 'บันทึกไม่สำเร็จ กรุณาลองใหม่'
        )
        return
      }
      if (editing) {
        router.push(`/jobs/${job!.id}`)
        router.refresh()
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
    } catch {
      setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 8, marginBottom: 24 }}>
      {editing && job!.source === 'synthetic' && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          งานนี้มาจากสคริปต์ตัวอย่าง — รัน <code>npx tsx scripts/seed-jobs.ts</code> อีกครั้ง
          แล้วค่าที่แก้จะกลับคืนเป็นค่าเดิม
        </p>
      )}
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ตำแหน่งงาน (เช่น Data Scientist)" />
      <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="บริษัท (ไม่บังคับ)" />
      <input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="สกิลที่ต้องการ คั่นด้วยจุลภาค เช่น Python, SQL" />
      <input className="input" value={minExp} onChange={(e) => setMinExp(e.target.value)} placeholder="ประสบการณ์ขั้นต่ำ (ปี)" type="number" />
      <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="สถานที่ (ไม่บังคับ)" />
      <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" rows={4} />
      {willVoidCache && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          การแก้นี้ทำให้คะแนนเชิงลึกที่เคยคำนวณไว้ {cachedScoreCount} รายการใช้ไม่ได้
          และจะถูกลบทิ้ง กดดูใหม่จะต้องให้ AI คำนวณอีกครั้ง
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={saving || !title || !description}>
          {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}
        </button>
        {editing && (
          <button className="btn" onClick={() => router.back()} disabled={saving}>ยกเลิก</button>
        )}
        {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--bad)' }}>{err}</span>}
      </div>
    </div>
  )
}
