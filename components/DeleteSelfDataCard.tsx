'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

// **`self_profiles` ไม่มีคอลัมน์ `full_name`** — ชื่ออยู่ใน `parsed_data` jsonb
// (migration 011: id, owner_id, file_name, raw_text, parsed_data, assessment,
//  embedding, created_at, updated_at) ซึ่งต่างจากตาราง `candidates` ที่มีคอลัมน์ชื่อจริง
type Row = {
  id: string
  file_name: string | null
  parsed_data: { full_name?: string } | null
  created_at: string | null
}

/** ป้ายที่ผู้ใช้จำได้ — ชื่อในร่างที่ยืนยันไว้ ถ้าไม่มีใช้ชื่อไฟล์ */
function rowLabel(r: Row): string {
  return r.parsed_data?.full_name?.trim() || r.file_name?.trim() || 'ไม่ระบุชื่อ'
}

// ลบข้อมูลประเมินตัวเอง — สิทธิ์ของเจ้าของข้อมูลตาม PDPA มาตรา 33
//
// อ่านรายการผ่าน anon key ซึ่ง RLS ของ `self_profiles` กรองให้เหลือเฉพาะแถวของ
// เจ้าของอยู่แล้ว (migration 011) ส่วนการลบยิงไปที่ route ที่ใช้ service-role
// แล้วตรวจ owner_id เอง — ไม่พึ่ง RLS ชั้นเดียวสำหรับการกระทำที่ย้อนกลับไม่ได้
export default function DeleteSelfDataCard() {
  const db = getBrowserClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    const { data: { user } } = await db.auth.getUser()
    if (!user) return
    const { data, error } = await db
      .from('self_profiles')
      .select('id, file_name, parsed_data, created_at')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      // "อ่านไม่ได้" กับ "ไม่มีข้อมูล" เป็นคนละเรื่อง — รายการว่างบนหน้าที่ควรบอก
      // ว่าคุณมีข้อมูลอะไรอยู่บ้าง จะทำให้ผู้ใช้เชื่อว่าไม่มีอะไรให้ลบทั้งที่มี
      console.error('self_profiles list failed:', error.message)
      setLoadFailed(true)
      setLoaded(true)
      return
    }
    setRows((data as Row[]) ?? [])
    setLoaded(true)
  }

  useEffect(() => { load() }, [])

  const remove = async (id: string, label: string) => {
    if (!confirm(`ลบข้อมูลประเมินตัวเอง "${label}" อย่างถาวร?\n\nผลการจัดอันดับงานที่เก็บไว้จะถูกลบไปด้วย และกู้คืนไม่ได้`)) return
    setBusyId(id)
    setMsg('')
    setErr('')
    try {
      const r = await fetch(`/api/self-assessment/${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setErr(j?.error ?? 'ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่')
        return
      }
      setRows((cur) => cur.filter((x) => x.id !== id))
      setMsg('ลบแล้ว')
    } catch {
      setErr('เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>ข้อมูลประเมินตัวเองของฉัน</h3>
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        ข้อมูลที่คุณอัปโหลดเองจากเรซูเม่ เก็บแยกจากฐานข้อมูลผู้สมัครที่ผู้ดูแลค้นหา
        คุณขอให้ลบเมื่อไรก็ได้ตามสิทธิ์ของเจ้าของข้อมูล
      </p>

      {!loaded && <p className="faint" style={{ fontSize: 13 }}>กำลังโหลด…</p>}

      {loaded && loadFailed && (
        <p style={{ color: 'var(--bad)', fontSize: 13 }}>
          โหลดรายการไม่สำเร็จ กรุณารีเฟรชหน้านี้ — <strong>อย่าเพิ่งสรุปว่าไม่มีข้อมูล</strong>
        </p>
      )}

      {loaded && !loadFailed && rows.length === 0 && (
        <p className="faint" style={{ fontSize: 13 }}>ยังไม่มีข้อมูลประเมินตัวเอง</p>
      )}

      {loaded && !loadFailed && rows.length > 0 && (
        <div className="list">
          {rows.map((r) => {
            const label = rowLabel(r)
            return (
              <div key={r.id} className="list-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{label}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {String(r.created_at ?? '').slice(0, 10)}
                  </div>
                </div>
                <button
                  className="btn"
                  style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
                  disabled={busyId === r.id}
                  onClick={() => remove(r.id, label)}
                >
                  {busyId === r.id ? 'กำลังลบ…' : 'ลบ'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        {msg && <span style={{ color: 'var(--ok)', fontSize: 13 }}>{msg}</span>}
        {err && <span style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</span>}
      </div>
    </div>
  )
}
