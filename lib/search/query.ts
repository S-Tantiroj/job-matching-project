import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'

export type SearchFilters = { foreignEduOnly?: boolean; skill?: string }
export type SearchResult = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100, from semantic similarity
}

// Hybrid search: semantic vector retrieval (RAG) + structured filters.
// The search-time match score comes from vector similarity (fast, no LLM /
// quota cost). Deep per-candidate LLM scoring lives on the candidate page
// (see /api/analyze), matching the spec's fast-filter vs. deep-analysis split.
export async function searchCandidates(
  query: string,
  filters: SearchFilters
): Promise<SearchResult[]> {
  const db = getServerClient()

  const emb = await embedText(query, 'RETRIEVAL_QUERY')
  const { data: matches } = await db.rpc('match_candidates', {
    query_embedding: emb,
    match_count: 20,
  })
  const sims = new Map<string, number>((matches ?? []).map((m: any) => [m.id, m.similarity]))
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows } = await db
    .from('candidates')
    .select('id, full_name, headline, education(country)')
    .in('id', ids)

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  let ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[]

  if (filters.foreignEduOnly) {
    ordered = ordered.filter((c) =>
      c.education?.some((e: any) => e.country && e.country !== 'Thailand')
    )
  }

  return ordered
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      score: Math.round((sims.get(c.id) ?? 0) * 100),
    }))
    .sort((a, b) => b.score - a.score)
}
