'use client'
import { useState } from 'react'
import { EMPTY_DRAFT, LIMITS, type ProfileDraft, type DraftEducation } from '@/lib/self/profileDraft'
import {
  EDUCATION_LEVELS,
  INDUSTRY_GROUPS,
  choiceLabel,
  isLegacyChoice,
  type Choice,
} from '@/lib/self/taxonomy'
import { MONTHS_TH, toMonthYear, fromMonthYear, yearOptions } from '@/lib/self/monthYear'

// dropdown ที่ยอมให้ค่าเดิมที่ไม่อยู่ในรายการอยู่ต่อได้
//
// โปรไฟล์ที่บันทึกไว้ก่อนมีรายการตัวเลือก (เช่น degree "MS" หรือ industry "Banking")
// จะไม่ตรงกับ option ไหนเลย ถ้าปล่อยไว้เฉยๆ select จะเด้งไปค่าว่างแล้วผู้ใช้กดบันทึก
// ทับข้อมูลเดิมโดยไม่รู้ว่าเพิ่งลบอะไรไป จึงใส่ option พิเศษกำกับว่าเป็นค่าเดิม
// ให้เห็นกับตาว่ายังอยู่ และเลือกค่าใหม่ทับได้เมื่อพร้อม
function ChoiceSelect({
  value,
  choices,
  placeholder,
  onChange,
}: {
  value: string | undefined
  choices: Choice[]
  placeholder: string
  onChange: (v: string | undefined) => void
}) {
  const current = value ?? ''
  const isLegacy = isLegacyChoice(value, choices)
  return (
    <select
      className="select"
      value={current}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      {isLegacy && <option value={current}>ค่าเดิม: {current}</option>}
      {choices.map((c) => (
        <option key={c.value} value={c.value}>
          {choiceLabel(c)}
        </option>
      ))}
    </select>
  )
}

// ช่องเดือน/ปี — ไม่ใช้ <input type="date"> เพราะเบราว์เซอร์เลือกรูปแบบตาม locale
// เครื่องที่ตั้งเป็นอังกฤษจึงขึ้น MM/DD/YYYY ซึ่งอ่านสลับกับ DD/MM/YYYY ได้ง่ายมาก
//
// **ถ้าผู้ใช้ไม่แตะเลย ค่าเดิมถูกส่งกลับเหมือนเดิมทุกตัวอักษร** รวมถึงแถวเก่าที่มี
// วันจริงอยู่ (2025-04-15) — จะเปลี่ยนเป็นวันที่ 01 ก็ต่อเมื่อเขาเลือกใหม่เท่านั้น
// การเขียนทับค่าเดิมเงียบๆ ตอนบันทึกเรื่องอื่นเป็นการแก้ข้อมูลโดยเจ้าตัวไม่ได้สั่ง
function MonthYearPicker({
  value,
  label,
  onChange,
}: {
  value: string | undefined
  label: string
  onChange: (v: string | undefined) => void
}) {
  const my = toMonthYear(value)
  const years = yearOptions()
  return (
    <div className="row" style={{ gap: 6, flex: 1 }}>
      <select
        className="select"
        aria-label={`${label} — เดือน`}
        value={my?.month ?? ''}
        onChange={(e) =>
          onChange(fromMonthYear(Number(e.target.value) || undefined, my?.year))
        }
      >
        <option value="">{label} — เดือน</option>
        {MONTHS_TH.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="select"
        aria-label={`${label} — ปี`}
        value={my?.year ?? ''}
        onChange={(e) =>
          onChange(fromMonthYear(my?.month, Number(e.target.value) || undefined))
        }
      >
        <option value="">ปี</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  )
}

type Exp = NonNullable<ProfileDraft['experience']>[number]

// แยกสตริงสกิลที่คั่นด้วยจุลภาคออกเป็นรายการ ตัดช่องว่างหัวท้ายและทิ้งช่องว่าง
// (เช่นจากจุลภาคติดกัน หรือจุลภาคท้ายสตริง) ดึงออกมาเป็นฟังก์ชันล้วนเพื่อเทสต์ได้
// โดยไม่ต้อง mount คอมโพเนนต์ — ตามแบบ buildTimeline ใน components/Timeline.tsx
export function parseSkillInput(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// แมปชื่อฟิลด์จากเซิร์ฟเวอร์ไปยังป้ายชื่อไทยที่ผู้ใช้เข้าใจ เพื่อบอกว่าส่วนไหนของฟอร์มมีปัญหา
// ชื่อฟิลด์ที่เซิร์ฟเวอร์อาจส่งมา: top-level (full_name, headline, etc.) และ nested
// (education.institution, experience.title, เป็นต้น) หรือ "_" สำหรับข้อผิดพลาดทั่วไป
// ค่ากลับคืนเป็นสตริง กลับคืนว่างสำหรับ "_" หรือค่าที่ไม่ทราบ (ให้เพียงแค่ข้อความข้อผิดพลาด)
export function fieldToLabel(field: string | undefined): string {
  if (!field) return ''
  const labels: Record<string, string> = {
    full_name: 'ชื่อ-นามสกุล',
    headline: 'ตำแหน่งย่อ',
    industry: 'อุตสาหกรรม',
    location: 'สถานที่',
    summary: 'แนะนำตัวเอง',
    education: 'การศึกษา',
    'education.institution': 'การศึกษา › สถาบัน',
    'education.country': 'การศึกษา › ประเทศ',
    'education.degree': 'การศึกษา › ระดับการศึกษา',
    'education.field_of_study': 'การศึกษา › สาขา',
    'education.gpa': 'การศึกษา › ผลการเรียน',
    'education.start_year': 'การศึกษา › ปีเริ่ม',
    'education.end_year': 'การศึกษา › ปีจบ',
    experience: 'ประสบการณ์ทำงาน',
    'experience.company': 'ประสบการณ์ทำงาน › บริษัท',
    'experience.title': 'ประสบการณ์ทำงาน › ตำแหน่ง',
    'experience.description': 'ประสบการณ์ทำงาน › รายละเอียดงาน',
    'experience.start_date': 'ประสบการณ์ทำงาน › วันที่เริ่มต้น',
    'experience.end_date': 'ประสบการณ์ทำงาน › วันที่สิ้นสุด',
    skills: 'สกิล',
  }
  return labels[field] ?? ''
}

// ฟอร์มเดียวใช้สองทาง: ตรวจร่างที่อ่านมาจาก PDF และกรอกเองตั้งแต่ต้น
// ต่างกันแค่ค่า initial ที่ส่งเข้ามา — นั่นคือเหตุผลที่ "กรอกเอง" แทบไม่มีต้นทุนเพิ่ม
//
// maxLength ในช่องต่างๆ เป็นเรื่องประสบการณ์ผู้ใช้เท่านั้น การป้องกันจริงอยู่ที่
// validateProfileDraft ฝั่งเซิร์ฟเวอร์ ดู app/api/self-assessment/route.ts
export default function ProfileForm({
  initial,
  fileName,
  onSaved,
}: {
  initial: ProfileDraft
  fileName?: string
  onSaved: () => void
}) {
  const [d, setD] = useState<ProfileDraft>({ ...EMPTY_DRAFT, ...initial })
  const [skillText, setSkillText] = useState((initial.skills ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warned, setWarned] = useState(false)

  const set = (patch: Partial<ProfileDraft>) => setD((p) => ({ ...p, ...patch }))

  const edu = d.education ?? []
  const exp = d.experience ?? []

  const setEdu = (idx: number, patch: Partial<DraftEducation>) =>
    set({ education: edu.map((e, i) => (i === idx ? { ...e, ...patch } : e)) })
  const setExp = (idx: number, patch: Partial<Exp>) =>
    set({ experience: exp.map((e, i) => (i === idx ? { ...e, ...patch } : e)) })

  const submit = async () => {
    if (busy) return
    setError('')

    if (!(d.full_name ?? '').trim()) return setError('กรุณากรอกชื่อ')

    // summary มีน้ำหนักในการจัดอันดับงานมากกว่า skills (วัดด้วย ablate-embedding.ts:
    // ตัด skills ออก Spearman 0.951 · ตัด summary ออก 0.856) คนที่ข้ามช่องนี้จะได้ผล
    // จับคู่งานแย่ลงชัดเจนโดยไม่รู้ตัว จึงเตือนหนึ่งครั้ง แต่ไม่บังคับ
    if (!(d.summary ?? '').trim() && !warned) {
      setWarned(true)
      return setError(
        'ยังไม่ได้กรอก "แนะนำตัวเอง" ซึ่งมีผลกับการจับคู่งานมาก กดอีกครั้งถ้าต้องการข้ามไป'
      )
    }

    const skills = parseSkillInput(skillText)

    setBusy(true)
    try {
      const res = await fetch('/api/self-assessment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draft: { ...d, skills }, fileName }),
      })
      setBusy(false)

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        const fieldLabel = fieldToLabel(json.field)
        const message = json.error ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
        const displayText = fieldLabel ? `${fieldLabel}: ${message}` : message
        return setError(displayText)
      }
      onSaved()
    } catch {
      // ความล้มเหลวระดับเครือข่าย (ออฟไลน์, การเชื่อมต่อหลุดกลางคัน) — ไม่งั้น busy
      // จะค้าง true ตลอดไปและผู้ใช้ต้องรีโหลดหน้า ซึ่งทำลายร่างที่ยังไม่บันทึกทั้งหมด
      // (ฟีเจอร์นี้ตั้งใจไม่มี autosave และไม่มีร่างในฐานข้อมูล) ตามแบบ upload
      // ใน SelfAssessmentStart.tsx
      setBusy(false)
      setError('เชื่อมต่อเครือข่ายไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่อีกครั้ง')
    }
  }

  return (
    <div className="card stack" style={{ maxWidth: 620, gap: 14 }}>
      {fileName && (
        <p className="faint" style={{ fontSize: 13, margin: 0 }}>
          อ่านจากไฟล์ {fileName} — ตรวจแล้วแก้ให้ถูกต้องก่อนกดวิเคราะห์
        </p>
      )}

      <div className="stack" style={{ gap: 8 }}>
        <input
          className="input"
          maxLength={LIMITS.full_name}
          value={d.full_name ?? ''}
          onChange={(e) => set({ full_name: e.target.value })}
          placeholder="ชื่อ-นามสกุล (ภาษาอังกฤษ)"
        />
        <input
          className="input"
          maxLength={LIMITS.headline}
          value={d.headline ?? ''}
          onChange={(e) => set({ headline: e.target.value })}
          placeholder="ตำแหน่งย่อ เช่น Senior Data Scientist"
        />
        <ChoiceSelect
          value={d.industry}
          choices={INDUSTRY_GROUPS}
          placeholder="เลือกกลุ่มอุตสาหกรรม"
          onChange={(v) => set({ industry: v })}
        />
        <input
          className="input"
          maxLength={LIMITS.location}
          value={d.location ?? ''}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="สถานที่ เช่น Bangkok, Thailand"
        />
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>การศึกษา</div>
        <div className="stack" style={{ gap: 10 }}>
          {edu.map((e, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <div className="row">
                <input className="input" maxLength={LIMITS.institution} value={e.institution ?? ''}
                  onChange={(ev) => setEdu(i, { institution: ev.target.value })} placeholder="สถาบัน" />
                <input className="input" maxLength={LIMITS.country} value={e.country ?? ''}
                  onChange={(ev) => setEdu(i, { country: ev.target.value })} placeholder="ประเทศ" />
              </div>
              <div className="row">
                <ChoiceSelect
                  value={e.degree}
                  choices={EDUCATION_LEVELS}
                  placeholder="เลือกระดับการศึกษา"
                  onChange={(v) => setEdu(i, { degree: v })}
                />
                <input className="input" maxLength={LIMITS.field_of_study} value={e.field_of_study ?? ''}
                  onChange={(ev) => setEdu(i, { field_of_study: ev.target.value })} placeholder="สาขา" />
              </div>
              <div className="row">
                <input className="input" type="number" value={e.start_year ?? ''}
                  onChange={(ev) => setEdu(i, { start_year: ev.target.value ? Number(ev.target.value) : undefined })}
                  placeholder="ปีเริ่ม" />
                <input className="input" type="number" value={e.end_year ?? ''}
                  onChange={(ev) => setEdu(i, { end_year: ev.target.value ? Number(ev.target.value) : undefined })}
                  placeholder="ปีจบ" />
                {/* ผลการเรียนเป็นข้อความ ไม่ใช่ตัวเลข เพราะสเกลไม่เหมือนกัน —
                    3.45 จากระบบ 4.0, 4.2 จากระบบ 5.0, "เกียรตินิยมอันดับหนึ่ง"
                    ล้วนเป็นคำตอบที่ถูก type="number" จะทำให้กรอกไม่ได้ */}
                <input className="input" maxLength={LIMITS.gpa} value={e.gpa ?? ''}
                  onChange={(ev) => setEdu(i, { gpa: ev.target.value })} placeholder="ผลการเรียน (ถ้ามี)" />
                <button className="btn btn-ghost" onClick={() => set({ education: edu.filter((_, j) => j !== i) })}>ลบ</button>
              </div>
            </div>
          ))}
          {edu.length < LIMITS.education && (
            <button className="chip-add" onClick={() => set({ education: [...edu, {}] })}>+ เพิ่มการศึกษา</button>
          )}
        </div>
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>ประสบการณ์ทำงาน</div>
        <div className="stack" style={{ gap: 10 }}>
          {exp.map((e, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <div className="row">
                <input className="input" maxLength={LIMITS.title} value={e.title ?? ''}
                  onChange={(ev) => setExp(i, { title: ev.target.value })} placeholder="ตำแหน่ง" />
                <input className="input" maxLength={LIMITS.company} value={e.company ?? ''}
                  onChange={(ev) => setExp(i, { company: ev.target.value })} placeholder="บริษัท" />
              </div>
              <div className="row">
                <MonthYearPicker
                  value={e.start_date}
                  label="เริ่ม"
                  onChange={(v) => setExp(i, { start_date: v })}
                />
                <MonthYearPicker
                  value={e.end_date}
                  label="สิ้นสุด"
                  onChange={(v) => setExp(i, { end_date: v })}
                />
                <button className="btn btn-ghost" onClick={() => set({ experience: exp.filter((_, j) => j !== i) })}>ลบ</button>
              </div>
              <textarea className="textarea" rows={2} maxLength={LIMITS.description} value={e.description ?? ''}
                onChange={(ev) => setExp(i, { description: ev.target.value })} placeholder="รายละเอียดงาน (ไม่บังคับ)" />
            </div>
          ))}
          {exp.length < LIMITS.experience && (
            <button className="chip-add" onClick={() => set({ experience: [...exp, {}] })}>+ เพิ่มประสบการณ์</button>
          )}
        </div>
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>สกิล (คั่นด้วยจุลภาค)</div>
        <input className="input" value={skillText} onChange={(e) => setSkillText(e.target.value)}
          placeholder="Python, SQL, Machine Learning" />
      </div>

      <div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
          แนะนำตัวเอง — มีผลกับการจับคู่งานมากที่สุด
        </div>
        <textarea className="textarea" rows={4} maxLength={LIMITS.summary} value={d.summary ?? ''}
          onChange={(e) => set({ summary: e.target.value })}
          placeholder="เช่น ทำงานด้านโมเดลพยากรณ์และความเสี่ยงมา 10 ปี เคยดูแลทีม 6 คน สนใจงานฝั่งธนาคารและค้าปลีก" />
      </div>

      <div className="row">
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {busy ? 'กำลังวิเคราะห์…' : 'ยืนยันและวิเคราะห์'}
        </button>
        {busy && <span className="faint" style={{ fontSize: 13 }}>อาจใช้เวลา 10–20 วินาที</span>}
      </div>
      {error && <p style={{ color: 'var(--bad)', margin: 0 }}>{error}</p>}
      {fileName && (
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>
          แสดงเฉพาะรายการล่าสุดจากไฟล์ ถ้าขาดอะไรสำคัญเพิ่มเองได้
        </p>
      )}
    </div>
  )
}
