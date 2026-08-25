import 'dotenv/config'
import { getServerClient } from '../lib/supabase/server'
import { fetchLatestCsv } from '../lib/ingest/phantombuster'
import { parseLinkedInCsv } from '../lib/ingest/linkedin'
import { upsertCandidate } from '../lib/ingest/upsert'
import { embedHash } from '../lib/ingest/embedHash'
import { classifyRow } from '../lib/ingest/classify'

// ดึงผลลัพธ์ล่าสุดจาก PhantomBuster แล้วนำเข้าฐานข้อมูล
// รันด้วย: npx tsx scripts/sync-phantombuster.ts [--dry-run]
//
// สคริปต์นี้ idempotent โดยธรรมชาติ — การเทียบ embed_hash ทำให้แถวที่ทำไปแล้วถูกข้าม
// จึงรันซ้ำได้เสมอ และ resume ได้เองโดยไม่ต้องมีตาราง checkpoint

const DRY_RUN = process.argv.includes('--dry-run')
const MAX_ROWS = Number(process.env.MAX_ROWS_PER_RUN ?? 600)
const DELAY_MS = Number(process.env.EMBED_DELAY_MS ?? 1200)
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 3)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const isRateLimited = (e: any) => {
  const m = String(e?.message ?? e)
  return m.includes('"code":429') || m.includes('"code":503')
}

// ลองใหม่เมื่อโดนจำกัดชั่วคราว error อื่นโยนออกทันทีเพราะ retry ไม่ช่วย
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      if (!isRateLimited(e) || attempt >= MAX_RETRIES) throw e
      const wait = DELAY_MS * Math.pow(2, attempt + 1)
      console.warn(`rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
      await sleep(wait)
    }
  }
}

async function main() {
  const agentId = process.env.PHANTOMBUSTER_AGENT_ID
  if (!agentId) throw new Error('PHANTOMBUSTER_AGENT_ID is not set')
  const db = getServerClient()

  // ปิด run ที่ค้างสถานะ running จากรอบก่อนที่ล้มแบบไม่คาดคิด
  if (!DRY_RUN) {
    await db
      .from('ingest_runs')
      .update({ status: 'failed', finished_at: new Date().toISOString() })
      .eq('status', 'running')
  }

  let runId: string | null = null
  if (!DRY_RUN) {
    const { data } = await db
      .from('ingest_runs')
      .insert({
        trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'scheduled' : 'manual',
        source: 'phantombuster',
        criteria: { agentId },
        status: 'running',
      })
      .select('id')
      .single()
    runId = (data as any)?.id ?? null
  }

  const counts = { imported: 0, updated: 0, pending: 0, skipped_unchanged: 0, skipped_suppressed: 0 }
  const errors: string[] = []
  let truncated = false

  try {
    const csv = await fetchLatestCsv(agentId)
    let rows = parseLinkedInCsv(csv)
    console.log(`fetched ${rows.length} rows`)

    if (rows.length > MAX_ROWS) {
      truncated = true
      rows = rows.slice(0, MAX_ROWS)
      console.warn(`truncated to MAX_ROWS_PER_RUN=${MAX_ROWS}`)
    }

    for (const input of rows) {
      try {
        const missing = classifyRow(input)

        if (missing.length) {
          counts.pending++
          if (!DRY_RUN && input.linkedin_url) {
            await db.from('pending_candidates').upsert(
              {
                ingest_run_id: runId,
                linkedin_url: input.linkedin_url,
                full_name: input.full_name,
                headline: input.headline ?? null,
                payload: input,
                missing,
                status: 'pending',
              },
              { onConflict: 'linkedin_url' }
            )
          }
          continue
        }

        // มาถึงตรงนี้แปลว่า classifyRow บอกว่าครบ ซึ่งรวมถึงมี linkedin_url แน่นอน
        const { data: existing } = await db
          .from('candidates')
          .select('embed_hash')
          .eq('linkedin_url', input.linkedin_url!)
          .maybeSingle()

        if ((existing as any)?.embed_hash === embedHash(input)) {
          counts.skipped_unchanged++
          continue
        }

        if (DRY_RUN) {
          existing ? counts.updated++ : counts.imported++
          continue
        }

        const r = await withRetry(() => upsertCandidate(input, null, runId))
        if (r.suppressed) counts.skipped_suppressed++
        else if (r.updated) counts.updated++
        else counts.imported++

        // คนที่เคยเข้าคิว แล้วรอบนี้ข้อมูลครบแล้ว ต้องเอาออกจากคิว
        // ไม่งั้นคิวจะสะสมรายการที่แก้ตัวเองไปแล้ว และคนตรวจเสียเวลากับของที่เข้าระบบไปแล้ว
        if (!r.suppressed) {
          await db.from('pending_candidates').delete().eq('linkedin_url', input.linkedin_url!)
        }

        await sleep(DELAY_MS)
      } catch (e: any) {
        // แถวเดียวพังไม่ควรล้มทั้งรอบ
        errors.push(`${input.full_name}: ${e?.message ?? e}`)
        console.error(`row failed: ${input.full_name}`, e?.message ?? e)
        if (isRateLimited(e)) {
          console.error('still rate limited after retries — stopping early, next run resumes')
          break
        }
      }
    }

    const status = truncated || errors.length ? 'partial' : 'success'
    console.log(JSON.stringify({ status, ...counts, errors: errors.length, truncated }, null, 2))

    if (!DRY_RUN && runId) {
      await db
        .from('ingest_runs')
        .update({ ...counts, status, errors, finished_at: new Date().toISOString() })
        .eq('id', runId)
    }
  } catch (e: any) {
    console.error('run failed:', e?.message ?? e)
    if (!DRY_RUN && runId) {
      await db
        .from('ingest_runs')
        .update({
          ...counts,
          status: 'failed',
          errors: [String(e?.message ?? e)],
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('unexpected:', e?.message ?? e)
  process.exit(1)
})
