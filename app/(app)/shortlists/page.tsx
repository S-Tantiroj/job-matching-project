'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/client'

export default function ShortlistsPage() {
  const db = getBrowserClient()
  const [data, setData] = useState<any[]>([])
  const [newName, setNewName] = useState('')

  const load = async () => {
    const { data } = await db
      .from('shortlists')
      .select('id, name, shortlist_candidates(candidate_id, candidates(id, full_name, headline))')
      .order('created_at')
    setData(data ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    const { data: { user } } = await db.auth.getUser()
    await db.from('shortlists').insert({ name: newName.trim(), owner_id: user!.id })
    setNewName('')
    load()
  }

  const removeCandidate = async (shortlistId: string, candidateId: string) => {
    await db.from('shortlist_candidates').delete().eq('shortlist_id', shortlistId).eq('candidate_id', candidateId)
    load()
  }

  return (
    <main>
      <h1>Shortlists</h1>
      <div className="row" style={{ margin: '12px 0' }}>
        <input className="input" style={{ maxWidth: 320 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ shortlist ใหม่" />
        <button className="btn btn-primary" onClick={create}>สร้าง</button>
      </div>

      {data.length === 0 && <p className="faint">ยังไม่มี shortlist</p>}
      <div className="stack" style={{ gap: 12 }}>
        {data.map((sl) => (
          <div key={sl.id} id={sl.id} className="card shortlist-card" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>{sl.name}</h3>
            <div className="stack" style={{ gap: 4 }}>
              {(sl.shortlist_candidates ?? []).map((sc: any) => (
                <div key={sc.candidate_id} className="row">
                  <Link href={`/candidates/${sc.candidates?.id}`} style={{ fontWeight: 500 }}>
                    {sc.candidates?.full_name}
                  </Link>
                  <span className="muted">{sc.candidates?.headline}</span>
                  <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => removeCandidate(sl.id, sc.candidate_id)}>ลบ</button>
                </div>
              ))}
              {(sl.shortlist_candidates ?? []).length === 0 && <span className="faint">ยังไม่มีผู้สมัครในกลุ่มนี้</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
