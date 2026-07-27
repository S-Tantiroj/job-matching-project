import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { normalizeCountry } from './normalizeCountry'
import type { ChipFilters } from './extractFilters'

export type SearchResult = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100 semantic similarity
}

// Semantic search with hard filters. Embeds the semanticQuery, then delegates
// filtering + ranking to the match_candidates_filtered RPC (filters applied in
// SQL before ranking). Country chip values are canonicalized first.
export async function searchCandidates(
  semanticQuery: string,
  filters: ChipFilters
): Promise<SearchResult[]> {
  const db = getServerClient()
  const emb = await embedText(semanticQuery, 'RETRIEVAL_QUERY')

  const countries = filters.educationAbroad?.countries?.map(normalizeCountry) ?? null

  const { data: matches } = await db.rpc('match_candidates_filtered', {
    query_embedding: emb,
    match_count: 20,
    p_skills: filters.skills?.length ? filters.skills : null,
    p_any_foreign: filters.educationAbroad?.anyForeign ?? false,
    p_countries: countries && countries.length ? countries : null,
    p_min_years: filters.minYears ?? null,
    p_field_or_degree: filters.fieldOrDegree?.length ? filters.fieldOrDegree : null,
  })

  // PostgREST serializes float as a numeric string over the API — coerce to number.
  const sims = new Map<string, number>((matches ?? []).map((m: any) => [m.id, Number(m.similarity)]))
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows } = await db
    .from('candidates')
    .select('id, full_name, headline')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  return (ids.map((id) => byId.get(id)).filter(Boolean) as any[])
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      score: Math.max(0, Math.min(100, Math.round((sims.get(c.id) ?? 0) * 100))),
    }))
    .sort((a, b) => b.score - a.score)
}
