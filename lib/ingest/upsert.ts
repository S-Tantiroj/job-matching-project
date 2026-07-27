import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText, computeYearsExperience, toIsoDate, type CandidateInput } from './normalize'

// Writes a candidate (+ education, experience, skills) to the DB.
// Dedup: if a candidate with the same full_name (and matching first-education
// country, when present) already exists, update it in place instead of creating
// a duplicate. Returns the row id and whether it was an update.
export async function upsertCandidate(input: CandidateInput, createdBy: string | null = null) {
  const db = getServerClient()
  const embedding = await embedText(buildEmbedText(input))
  const firstCountry = input.education?.[0]?.country ?? null

  const { data: existing } = await db
    .from('candidates')
    .select('id, education(country)')
    .eq('full_name', input.full_name)
    .limit(1)
    .maybeSingle()

  const matched =
    existing &&
    (!firstCountry ||
      (existing as any).education?.some((e: any) => e.country === firstCountry))

  const row = {
    full_name: input.full_name,
    headline: input.headline ?? null,
    location: input.location ?? null,
    summary: input.summary ?? null,
    source: input.source,
    years_experience: computeYearsExperience(input.experience ?? []),
    raw_data: input.raw ?? null,
    embedding,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  }

  let candidateId: string
  let updated = false

  if (matched) {
    candidateId = (existing as any).id
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

  return { id: candidateId, updated }
}
