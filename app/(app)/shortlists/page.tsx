'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/client'

// User's shortlists + their candidates. RLS scopes everything to the owner.
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
    await db
      .from('shortlist_candidates')
      .delete()
      .eq('shortlist_id', shortlistId)
      .eq('candidate_id', candidateId)
    load()
  }

  return (
    <main>
      <h1>Shortlists</h1>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ shortlist ใหม่" />
        <button onClick={create}>สร้าง</button>
      </div>

      {data.length === 0 && <p style={{ color: '#888' }}>ยังไม่มี shortlist</p>}
      {data.map((sl) => (
        <div key={sl.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <h3>{sl.name}</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {(sl.shortlist_candidates ?? []).map((sc: any) => (
              <li key={sc.candidate_id} style={{ display: 'flex', gap: 10, padding: '6px 0' }}>
                <Link href={`/candidates/${sc.candidates?.id}`} style={{ fontWeight: 600 }}>
                  {sc.candidates?.full_name}
                </Link>
                <span style={{ color: '#888' }}>{sc.candidates?.headline}</span>
                <button
                  style={{ marginLeft: 'auto' }}
                  onClick={() => removeCandidate(sl.id, sc.candidate_id)}
                >
                  ลบ
                </button>
              </li>
            ))}
            {(sl.shortlist_candidates ?? []).length === 0 && (
              <li style={{ color: '#aaa' }}>ยังไม่มีผู้สมัครในกลุ่มนี้</li>
            )}
          </ul>
        </div>
      ))}
    </main>
  )
}
