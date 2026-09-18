import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import type { ChipFilters } from './extractFilters'
import { splitKnownSkills } from './knownSkills'

export type SearchResult = {
  id: string
  full_name: string
  headline?: string
  score: number // 0–100 semantic similarity
}

export type SearchOutcome = {
  results: SearchResult[]
  /** ชิปสกิลที่ไม่มีในฐาน จึงไม่ได้ถูกใช้กรอง — หน้าจอต้องบอกผู้ใช้ */
  unusedSkills: string[]
}

// ชื่อสกิลที่**มีผู้สมัครถืออยู่จริง** แคชไว้ต่ออินสแตนซ์ที่ยังอุ่นอยู่
//
// **อ่านจาก `candidate_skills` ไม่ใช่ `skills`** — ตาราง `skills` เป็นรายการชื่อ
// ที่สะสมมาจากทุกการนำเข้า ไม่ได้แปลว่ามีคนถืออยู่ · ตรวจกับฐานจริง 18 ก.ย. พบว่า
// มี 487 ชื่อแต่ผูกกับผู้สมัครแค่ 197 ครั้ง และ `Data Science` เป็นหนึ่งในชื่อกำพร้า
// **สกิลกำพร้ากรองคนทิ้งได้เท่ากับชื่อที่ไม่มีอยู่จริง** — รอบแรกอ่านจาก `skills`
// แล้วคำค้น "Data Scientist" ยังคืนศูนย์เหมือนเดิม โดยไม่มีข้อความอธิบายด้วย
// เพราะโค้ดถือว่ามันเป็นสกิลที่ใช้ได้
//
// **ทำไมโหลดมาทั้งชุดแทนการ query ทีละชิป** — `skills` มีแค่ `id` กับ `name`
// ไม่มีคอลัมน์ตัวพิมพ์เล็ก การเทียบแบบไม่สนตัวพิมพ์ใน PostgREST จึงต้องต่อสตริง
// `.or()` ซึ่งพังทันทีถ้าชื่อสกิลมีจุลภาคอยู่ข้างใน
//
// **TTL ทำให้สกิลที่เพิ่งนำเข้าใหม่ใช้กรองได้ภายในไม่กี่นาที** ระหว่างนั้นมันตกไป
// อยู่ในกลุ่มที่ไม่ถูกใช้กรอง ซึ่งแปลว่า**กรองน้อยลง ไม่ใช่กรองผิด** — พลาดในทางที่ปลอดภัย
const SKILLS_TTL_MS = 5 * 60_000
let skillsCache: { names: string[]; at: number } | null = null

async function knownSkillNames(db: ReturnType<typeof getServerClient>): Promise<string[] | null> {
  if (skillsCache && Date.now() - skillsCache.at < SKILLS_TTL_MS) return skillsCache.names

  const { data, error } = await db.from('candidate_skills').select('skills(name)')
  if (error) {
    // **อ่านไม่ได้ ไม่ใช่เหตุให้ทั้งการค้นหาล้ม** — ผู้เรียกจะถอยไปใช้ชิปตามที่ได้มา
    // ซึ่งเป็นพฤติกรรมเดิมก่อนการแก้นี้ · แต่ต้อง log ไม่งั้นจะเงียบสนิท
    console.error('skills lookup failed, filtering with chips as-is:', error)
    return null
  }
  const names = [
    ...new Set(
      (data ?? [])
        .map((r: any) => r?.skills?.name)
        .filter((n: unknown): n is string => typeof n === 'string' && !!n.trim())
    ),
  ]
  skillsCache = { names, at: Date.now() }
  return names
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
): Promise<SearchOutcome> {
  const db = getServerClient()
  const emb = await queryEmbedding(semanticQuery)

  // **กรองเฉพาะสกิลที่มีจริงในฐาน** ดูเหตุผลเต็มใน lib/search/knownSkills.ts
  // สั้นๆ คือ RPC เทียบสกิลแบบตรงตัวและต้องครบทุกตัว ส่วน AI แต่งชื่อสกิลขึ้นเองได้
  // ชื่อที่ไม่มีอยู่จริงจึงตัดทุกคนทิ้ง แล้วคำค้นอย่าง "Data Scientist" คืนศูนย์
  const chips = filters.skills ?? []
  let usableSkills = chips
  let unusedSkills: string[] = []

  if (chips.length) {
    const known = await knownSkillNames(db)
    if (known) {
      const split = splitKnownSkills(chips, known)
      usableSkills = split.usable
      unusedSkills = split.unknown
    }
    // known เป็น null แปลว่าอ่านรายชื่อไม่ได้ — ใช้ชิปตามที่ได้มา (พฤติกรรมเดิม)
  }

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
    p_skills: usableSkills.length ? usableSkills : null,
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
  if (!ids.length) return { results: [], unusedSkills }

  const { data: rows, error: rowsError } = await db
    .from('candidates')
    .select('id, full_name, headline')
    .in('id', ids)

  if (rowsError) {
    console.error('candidates fetch after ranking failed:', rowsError)
    throw new Error('search fetch failed')
  }

  const byId = new Map((rows ?? []).map((r: any) => [r.id, r]))
  const results = (ids.map((id) => byId.get(id)).filter(Boolean) as any[])
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      score: Math.max(0, Math.min(100, Math.round((sims.get(c.id) ?? 0) * 100))),
    }))
    .sort((a, b) => b.score - a.score)

  return { results, unusedSkills }
}
