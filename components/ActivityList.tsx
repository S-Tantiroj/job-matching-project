import Link from 'next/link'
import { ACTION_LABELS } from '@/lib/activity/log'
import type { ActivityRow } from '@/lib/activity/read'

const when = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'เมื่อครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} วันที่แล้ว`
  return iso.slice(0, 10)
}

const TONE: Record<string, string> = {
  delete: 'var(--bad)',
  suppress: 'var(--bad)',
  reject: 'var(--warn)',
  ingest: 'var(--ok)',
  approve: 'var(--ok)',
}

export default function ActivityList({
  rows,
  showActor = false,
  empty = 'ยังไม่มีกิจกรรม',
}: {
  rows: ActivityRow[]
  /** dashboard ไม่ต้องแสดงชื่อผู้กระทำ เพราะเป็นของตัวเองทั้งหมดอยู่แล้ว */
  showActor?: boolean
  empty?: string
}) {
  if (!rows.length) return <p className="faint">{empty}</p>

  return (
    <div className="list">
      {rows.map((r) => {
        // ผู้สมัครที่ถูกลบไปแล้วต้องไม่เป็นลิงก์ — ไม่งั้นกดแล้วเจอ 404
        const linkable = r.entity_type === 'candidate' && r.entity_id && r.action !== 'delete' && r.action !== 'suppress'
        const body = (
          <>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>
                <span style={{ color: TONE[r.action] ?? 'inherit' }}>{ACTION_LABELS[r.action] ?? r.action}</span>
                {r.count > 1 && <span className="muted"> · {r.count} รายการ</span>}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {r.summary}
                {showActor && (
                  <span className="faint"> — {r.actor_name ?? (r.actor_id ? 'ผู้ใช้ที่ถูกลบแล้ว' : 'ระบบอัตโนมัติ')}</span>
                )}
              </div>
            </div>
            <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(r.created_at)}</span>
          </>
        )

        return linkable ? (
          <Link key={r.id} href={`/candidates/${r.entity_id}`} className="list-row" style={{ color: 'inherit' }}>
            {body}
          </Link>
        ) : (
          <div key={r.id} className="list-row">{body}</div>
        )
      })}
    </div>
  )
}
