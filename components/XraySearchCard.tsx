'use client'
import { useMemo, useState } from 'react'
import { buildXrayQuery, xraySearchUrl, type XrayScope } from '@/lib/xray/query'

// การ์ดช่วยหาโปรไฟล์ด้วย X-ray search บน Google
//
// **การ์ดนี้ไม่ดึงข้อมูลอะไรเลย** มันผลิตคำค้นกับลิงก์ คนกดเปิด อ่านเอง แล้วกรอกลง
// เทมเพลต CSV ที่ปุ่มข้างล่างให้ดาวน์โหลด เหตุผลที่ไม่อัตโนมัติอยู่ใน lib/xray/query.ts

function ChipRow({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string
  placeholder: string
  values: string[]
  onChange: (v: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim()
    // เทียบแบบไม่สนตัวพิมพ์ — "Python" กับ "python" เป็นชิปเดียวกันในสายตาคน
    // ปล่อยให้ซ้ำจะได้คำค้นที่มีเงื่อนไขเดียวกันสองครั้ง ซึ่งไม่ผิดแต่ดูเหมือนบั๊ก
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, v])
    setDraft('')
  }

  return (
    <div>
      <div className="field-label">{label}</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {values.map((v) => (
          <span key={v} className="chip">
            {v}
            <button
              className="chip-x"
              aria-label={`ลบ ${v}`}
              onClick={() => onChange(values.filter((x) => x !== v))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="input"
          style={{ width: 180 }}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
        />
      </div>
    </div>
  )
}

export default function XraySearchCard() {
  const [jobTitle, setJobTitle] = useState('')
  const [institutions, setInstitutions] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [location, setLocation] = useState('')
  const [scope, setScope] = useState<XrayScope>('th')
  const [copied, setCopied] = useState(false)

  const query = useMemo(
    () => buildXrayQuery({ jobTitle, institutions, skills, location, scope }),
    [jobTitle, institutions, skills, location, scope]
  )
  const url = xraySearchUrl(query)

  const copy = async () => {
    if (!query) return
    try {
      await navigator.clipboard.writeText(query)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // เบราว์เซอร์บางตัวปฏิเสธ clipboard เมื่อไม่ได้อยู่บน https
      // ไม่ต้องแจ้ง error — คำค้นแสดงอยู่บนจอให้เลือกคัดลอกเองได้อยู่แล้ว
      setCopied(false)
    }
  }

  return (
    <div className="card">
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        สร้างคำค้นสำหรับหาโปรไฟล์สาธารณะบน Google แล้วเปิดอ่านเอง
        ระบบไม่ได้ดึงข้อมูลจาก Google หรือ LinkedIn ให้อัตโนมัติ
      </p>

      <div className="stack" style={{ gap: 12 }}>
        <div>
          <div className="field-label">ตำแหน่งงาน</div>
          <input
            className="input"
            value={jobTitle}
            placeholder="เช่น Financial Analyst"
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>

        <ChipRow
          label="สถาบัน หรือ ประเทศที่จบ (ตรงข้อใดข้อหนึ่งก็พอ)"
          placeholder="+ เช่น University of Melbourne"
          values={institutions}
          onChange={setInstitutions}
        />

        <ChipRow
          label="ทักษะ (ต้องมีครบทุกข้อ)"
          placeholder="+ เช่น Python"
          values={skills}
          onChange={setSkills}
        />

        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="field-label">ที่ตั้งปัจจุบัน</div>
            <input
              className="input"
              value={location}
              placeholder="เช่น Bangkok"
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div className="field-label">ขอบเขต</div>
            <select
              className="select"
              value={scope}
              onChange={(e) => setScope(e.target.value as XrayScope)}
            >
              <option value="th">โปรไฟล์ในไทย (th.linkedin.com)</option>
              <option value="global">ทั่วโลก (linkedin.com)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="field-label" style={{ marginTop: 14 }}>คำค้นที่ได้</div>
      <textarea
        className="textarea"
        readOnly
        rows={3}
        value={query}
        placeholder="กรอกอย่างน้อยหนึ่งช่องด้านบน"
        style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
      />

      <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
        <button className="btn" onClick={copy} disabled={!query}>
          {copied ? 'คัดลอกแล้ว' : 'คัดลอกคำค้น'}
        </button>
        {url ? (
          <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
            เปิดใน Google
          </a>
        ) : (
          <button className="btn btn-primary" disabled>เปิดใน Google</button>
        )}
      </div>

      <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
        ข้อมูลที่ได้จากวิธีนี้ยังถือว่า<strong>เก็บจากแหล่งอื่นที่ไม่ใช่เจ้าของข้อมูล</strong>{' '}
        ต้องแจ้งเจ้าของข้อมูลภายใน 30 วันตาม PDPA มาตรา 25 — การที่โปรไฟล์เปิดเป็นสาธารณะ
        ไม่ใช่ข้อยกเว้นของหน้าที่นี้
      </p>
    </div>
  )
}
