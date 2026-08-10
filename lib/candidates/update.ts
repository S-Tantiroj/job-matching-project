import { getServerClient } from '@/lib/supabase/server'
import { embedText } from '@/lib/gemini/embed'
import { buildEmbedText, type CandidateInput } from '@/lib/ingest/normalize'

export type EditableFields = {
  full_name: string
  headline: string | null
  location: string | null
  summary: string | null
  linkedin_url: string | null
  professional_email: string | null
}

const blankToNull = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}

export function normalizeEditable(
  input: unknown
): { ok: true; value: EditableFields } | { ok: false; error: string } {
  const i = (input ?? {}) as Record<string, unknown>
  const full_name = String(i.full_name ?? '').trim()
  if (!full_name) return { ok: false, error: 'กรุณากรอกชื่อผู้สมัคร' }
  return {
    ok: true,
    value: {
      full_name,
      headline: blankToNull(i.headline),
      location: blankToNull(i.location),
      summary: blankToNull(i.summary),
      linkedin_url: blankToNull(i.linkedin_url),
      professional_email: blankToNull(i.professional_email),
    },
  }
}

// เทียบข้อความที่จะ embed จริง แทนการไล่ระบุรายฟิลด์ — ถูกต้องอัตโนมัติกับทุกฟิลด์
// ทั้งฟิลด์หลักและข้อมูลลูก และยังถูกต้องต่อไปแม้มีคนเพิ่มฟิลด์เข้า buildEmbedText ภายหลัง
export function needsReembed(before: CandidateInput, after: CandidateInput): boolean {
  return buildEmbedText(before) !== buildEmbedText(after)
}

// แก้เฉพาะคอลัมน์บนตาราง candidates — ต่างจาก upsertCandidate ที่ลบ education/
// experience/candidate_skills ทิ้งแล้วเขียนใหม่ (เหมาะกับ ingest เท่านั้น)
export async function updateCandidateFields(
  id: string,
  fields: EditableFields
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const db = getServerClient()

  const { data: current } = await db
    .from('candidates')
    .select('full_name, headline, summary, source, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', id)
    .maybeSingle()

  if (!current) return { ok: false, status: 404, error: 'ไม่พบผู้สมัครคนนี้' }

  const c = current as any
  const skills: string[] = (c.candidate_skills ?? [])
    .map((x: any) => x.skills?.name)
    .filter(Boolean)

  const shared = {
    source: c.source,
    skills,
    education: c.education ?? [],
    experience: c.experience ?? [],
  }
  const before: CandidateInput = {
    ...shared,
    full_name: c.full_name,
    headline: c.headline ?? undefined,
    summary: c.summary ?? undefined,
  }
  const after: CandidateInput = {
    ...shared,
    full_name: fields.full_name,
    headline: fields.headline ?? undefined,
    summary: fields.summary ?? undefined,
  }

  const row: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() }

  if (needsReembed(before, after)) {
    try {
      row.embedding = await embedText(buildEmbedText(after))
    } catch {
      // ไม่เขียนอะไรเลย ดีกว่าเขียนฟิลด์สำเร็จแล้วปล่อย embedding ค้างของเก่า
      // ซึ่งจะกลายเป็นข้อมูลไม่ตรงกันแบบเงียบที่ไม่มีสัญญาณเตือน
      return { ok: false, status: 502, error: 'ระบบประมวลผลข้อมูลไม่สำเร็จ กรุณาลองใหม่' }
    }
  }

  const { error } = await db.from('candidates').update(row).eq('id', id)
  if (error) {
    if ((error as any).code === '23505') {
      return { ok: false, status: 409, error: 'LinkedIn URL นี้ถูกใช้กับผู้สมัครคนอื่นแล้ว' }
    }
    return { ok: false, status: 500, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }
  }
  return { ok: true }
}
