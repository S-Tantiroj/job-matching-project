'use client'
import { useState } from 'react'

type Result = { imported: number; updated: number; errors: string[] }

export default function ImportPage() {
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    setResult(null)
    setCsv(await f.text())
  }

  const run = async () => {
    if (!csv || importing) return
    setImporting(true)
    setResult(null)
    const r = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'linkedin', csv }),
    })
    const json = await r.json()
    setImporting(false)
    setResult(json)
  }

  return (
    <main>
      <h1>นำเข้าข้อมูล LinkedIn (CSV)</h1>
      <p className="muted">อัปโหลดไฟล์ CSV แล้วกดนำเข้า</p>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="row">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-primary" onClick={run} disabled={!csv || importing}>
            {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
          </button>
        </div>
        {fileName && <p className="faint" style={{ fontSize: 13 }}>ไฟล์: {fileName}</p>}

        {result && (
          <div style={{ marginTop: 12 }}>
            <p>
              เพิ่มใหม่ <strong>{result.imported}</strong> · อัปเดต <strong>{result.updated}</strong> · ผิดพลาด <strong>{result.errors.length}</strong>
            </p>
            {result.errors.length > 0 && (
              <ul style={{ color: 'var(--bad)', fontSize: 13 }}>
                {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {result.imported + result.updated === 0 && result.errors.length === 0 && (
              <p className="faint">ไม่พบข้อมูลในไฟล์</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
