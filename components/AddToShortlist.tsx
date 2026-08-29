'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { track } from '@/lib/activity/client'

export default function AddToShortlist({
  candidateId,
  candidateName,
}: {
  candidateId: string
  candidateName?: string
}) {
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
      track('shortlist_create', newName.trim(), listId)
      setNewName('')
      await load()
    }
    if (!listId) return setMsg('เลือกหรือสร้าง shortlist ก่อน')
    const { error } = await db
      .from('shortlist_candidates')
      .upsert({ shortlist_id: listId, candidate_id: candidateId })
    if (!error) {
      const listName = lists.find((l) => l.id === listId)?.name ?? 'shortlist'
      track('shortlist_add', `${candidateName ?? 'ผู้สมัคร'} → ${listName}`, listId)
    }
    setMsg(error ? error.message : 'เพิ่มเข้า shortlist แล้ว')
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>เพิ่มเข้า Shortlist</h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto' }} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">— เลือก shortlist —</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <span className="faint">หรือสร้างใหม่:</span>
        <input className="input" style={{ width: 160 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ shortlist" />
        <button className="btn btn-primary" onClick={add}>เพิ่ม</button>
      </div>
      {msg && <p style={{ marginTop: 8, color: 'var(--ok)' }}>{msg}</p>}
    </div>
  )
}
