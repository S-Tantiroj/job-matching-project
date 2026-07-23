import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildJobEmbedText, type JobInput } from './normalize'

// Writes a job to the DB with a 768-dim embedding (RETRIEVAL_DOCUMENT, the
// embedText default). Dedup: when external_id is present, upsert on the existing
// unique (source, external_id) constraint; otherwise insert a new row. Returns
// the row id and whether an existing row was updated.
export async function upsertJob(input: JobInput): Promise<{ id: string; updated: boolean }> {
  const db = getServerClient()
  const embedding = await embedText(buildJobEmbedText(input))
  const source = input.source ?? 'manual'

  const row = {
    title: input.title,
    company: input.company ?? null,
    description: input.description,
    required_skills: input.required_skills ?? null,
    min_experience_years: input.min_experience_years ?? null,
    location: input.location ?? null,
    category: input.category ?? null,
    source,
    external_id: input.external_id ?? null,
    embedding,
  }

  if (input.external_id) {
    const { data: existing } = await db
      .from('jobs')
      .select('id')
      .eq('source', source)
      .eq('external_id', input.external_id)
      .maybeSingle()

    const { data } = await db
      .from('jobs')
      .upsert(row, { onConflict: 'source,external_id' })
      .select('id')
      .single()

    return { id: (data as any).id, updated: !!existing }
  }

  const { data } = await db.from('jobs').insert(row).select('id').single()
  return { id: (data as any).id, updated: false }
}
