import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { embedHash } from './embedHash'
import { buildEmbedText, computeYearsExperience, toIsoDate, type CandidateInput } from './normalize'

// Writes a candidate (+ education, experience, skills) to the DB.
// Dedup: scraped rows dedup on linkedin_url (stable unique); otherwise on
// full_name (+ matching first-education country).
//
// คืน suppressed: true เมื่อ linkedin_url อยู่ในรายชื่อระงับ — ไม่เขียนอะไรเลยและ id เป็น null
export async function upsertCandidate(
  input: CandidateInput,
  createdBy: string | null = null,
  ingestRunId: string | null = null
): Promise<{ id: string | null; updated: boolean; suppressed: boolean }> {
  const db = getServerClient()

  // เช็ครายชื่อระงับก่อน embed เสมอ — ไม่เสียโควตากับคนที่จะไม่ถูกเขียนอยู่แล้ว
  //
  // การเช็คอยู่ที่นี่ ไม่ใช่ในสคริปต์ เพราะกติกาของโปรเจกต์คือทุกเส้นทาง ingest ลงที่ไฟล์นี้
  // ถ้าเช็คแค่ในสคริปต์ วันที่ใครเอา CSV ชุดเดิมมาวางที่ /import ด้วยมือ คนที่ขอให้ลบจะกลับเข้ามาใหม่
  if (input.linkedin_url) {
    const { data: blocked } = await db
      .from('suppressed_profiles')
      .select('id')
      .eq('linkedin_url', input.linkedin_url)
      .maybeSingle()
    if (blocked) return { id: null, updated: false, suppressed: true }
  }

  const embedding = await embedText(buildEmbedText(input))

  let existingId: string | null = null
  if (input.linkedin_url) {
    const { data } = await db
      .from('candidates')
      .select('id')
      .eq('linkedin_url', input.linkedin_url)
      .limit(1)
      .maybeSingle()
    existingId = (data as any)?.id ?? null
  } else {
    const firstCountry = input.education?.[0]?.country ?? null
    const { data: existing } = await db
      .from('candidates')
      .select('id, education(country)')
      .eq('full_name', input.full_name)
      .limit(1)
      .maybeSingle()
    const matched =
      existing &&
      (!firstCountry || (existing as any).education?.some((e: any) => e.country === firstCountry))
    existingId = matched ? (existing as any).id : null
  }

  const row = {
    full_name: input.full_name,
    headline: input.headline ?? null,
    location: input.location ?? null,
    summary: input.summary ?? null,
    source: input.source,
    years_experience: computeYearsExperience(input.experience ?? []),
    linkedin_url: input.linkedin_url ?? null,
    professional_email: input.professional_email ?? null,
    refreshed_at: input.refreshed_at ?? null,
    raw_data: input.raw ?? null,
    embedding,
    embed_hash: embedHash(input),
    ingest_run_id: ingestRunId,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  }

  let candidateId: string
  let updated = false

  if (existingId) {
    candidateId = existingId
    updated = true
    await db.from('candidates').update(row).eq('id', candidateId)
    await db.from('education').delete().eq('candidate_id', candidateId)
    await db.from('experience').delete().eq('candidate_id', candidateId)
    await db.from('candidate_skills').delete().eq('candidate_id', candidateId)
  } else {
    const { data } = await db.from('candidates').insert(row).select('id').single()
    candidateId = (data as any).id
  }

  if (input.education?.length) {
    await db
      .from('education')
      .insert(input.education.map((e) => ({ ...e, candidate_id: candidateId })))
  }
  if (input.experience?.length) {
    await db.from('experience').insert(
      input.experience.map((e) => ({
        ...e,
        start_date: toIsoDate(e.start_date),
        end_date: toIsoDate(e.end_date),
        candidate_id: candidateId,
      }))
    )
  }
  for (const name of input.skills ?? []) {
    const { data: sk } = await db
      .from('skills')
      .upsert({ name }, { onConflict: 'name' })
      .select('id')
      .single()
    await db.from('candidate_skills').upsert({ candidate_id: candidateId, skill_id: (sk as any).id })
  }

  return { id: candidateId, updated, suppressed: false }
}
