import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import type { ChipFilters } from './extractFilters'

export type SearchResult = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100 semantic similarity
}

// In-memory cache of query embeddings, keyed by the semanticQuery text. Chip
// edits re-run the search with the same semanticQuery but different filters, so
// caching avoids re-embedding the unchanged text on every edit. Bounded FIFO;
// lives per warm serverless instance (a cold start re-embeds once — acceptable).
const queryEmbedCache = new Map<string, number[]>()

async function queryEmbedding(text: string): Promise<number[]> {
  const cached = queryEmbedCache.get(text)
  if (cached) return cached
  const emb = await embedText(text, 'RETRIEVAL_QUERY')
  queryEmbedCache.set(text, emb)
  if (queryEmbedCache.size > 100) {
    const oldest = queryEmbedCache.keys().next().value as string
    queryEmbedCache.delete(oldest)
  }
  return emb
}

// Semantic search with hard filters. Embeds the semanticQuery, then delegates
// filtering + ranking to the match_candidates_filtered RPC (filters applied in
// SQL before ranking). The RPC's country/any-foreign params are left at their
// defaults (education-abroad filtering was removed).
export async function searchCandidates(
  semanticQuery: string,
  filters: ChipFilters
): Promise<SearchResult[]> {
  const db = getServerClient()
  const emb = await queryEmbedding(semanticQuery)

  // **ต้องเช็ค error ของ RPC** ไม่ใช่ทิ้งไว้แล้วอ่านแต่ data
  //
  // เกิดขึ้นจริง 2026-09-07: migration ตั้ง search_path ของ RPC เป็น public เฉยๆ
  // ทำให้ตัวดำเนินการ `<=>` ของ pgvector (อยู่ใน schema `extensions`) หาไม่เจอ
  // RPC จึง error ทุกครั้ง แต่โค้ดตรงนี้อ่านแค่ data ซึ่งเป็น null แล้วคืน []
  // **หน้าเว็บจึงขึ้นว่า "ไม่พบผลลัพธ์" ทั้งที่การค้นหาพังสนิท** ไม่มี log ไม่มีสัญญาณ
  // อะไรเลย ใช้เวลาไล่หาสาเหตุนานกว่าที่ควรมาก
  //
  // "ไม่เจอใครตรงเงื่อนไข" กับ "ค้นหาไม่ได้" เป็นคนละเรื่องและต้องแยกให้ออก
  const { data: matches, error: rpcError } = await db.rpc('match_candidates_filtered', {
    query_embedding: emb,
    match_count: 20,
    p_skills: filters.skills?.length ? filters.skills : null,
    p_min_years: filters.minYears ?? null,
    p_field_or_degree: filters.fieldOrDegree?.length ? filters.fieldOrDegree : null,
  })

  if (rpcError) {
    console.error('match_candidates_filtered failed:', rpcError)
    throw new Error('search rpc failed')
  }

  // PostgREST serializes float as a numeric string over the API — coerce to number.
  const sims = new Map<string, number>((matches ?? []).map((m: any) => [m.id, Number(m.similarity)]))
  const ids = [...sims.keys()]
  if (!ids.length) return []

  const { data: rows, error: rowsError } = await db
    .from('candidates')
    .select('id, full_name, headline')
    .in('id', ids)

  if (rowsError) {
    console.error('candidates fetch after ranking failed:', rowsError)
    throw new Error('search fetch failed')
  }

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
