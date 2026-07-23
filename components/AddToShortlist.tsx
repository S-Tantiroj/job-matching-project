'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

// Lets the signed-in user add a candidate to one of their shortlists (or a new one).
// Relies on RLS: shortlists are scoped to the owner (auth.uid()).
export default function AddToShortlist({ candidateId }: { candidateId: string }) {
  const db = getBrowserClient()
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState('')
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data } = await db.from('shortlists').select('id, name').order('created_at')
    setLists(data ?? [])
    if (data?.length) setSelected(data[0].id)
  }
  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    setMsg('')
    let listId = selected
    if (newName.trim()) {
      const { data: { user } } = await db.auth.getUser()
      const { data, error } = await db
        .from('shortlists')
        .insert({ name: newName.trim(), owner_id: user!.id })
        .select('id')
        .single()
      if (error) return setMsg(error.message)
      listId = (data as any).id
      setNewName('')
      await load()
    }
    if (!listId) return setMsg('เลือกหรือสร้าง shortlist ก่อน')
    const { error } = await db
      .from('shortlist_candidates')
      .upsert({ shortlist_id: listId, candidate_id: candidateId })
    setMsg(error ? error.message : 'เพิ่มเข้า shortlist แล้ว')
  }

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h3>เพิ่มเข้า Shortlist</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">— เลือก shortlist —</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <span>หรือสร้างใหม่:</span>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ shortlist" />
        <button onClick={add}>เพิ่ม</button>
      </div>
      {msg && <p style={{ marginTop: 8, color: '#16a34a' }}>{msg}</p>}
    </div>
  )
}
