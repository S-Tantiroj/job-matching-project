import { getGemini } from '@/lib/gemini/client'
import { withTimeout } from '@/lib/gemini/withTimeout'

export type ChipFilters = {
  skills?: string[]
  minYears?: number
  fieldOrDegree?: string[]
}

export type SearchIntent = { semanticQuery: string; filters: ChipFilters }

// Turns a natural-language recruiter query into a semantic query string (for
// vector search over role/skills meaning) plus structured hard-filter chips.
// One gemini-flash-latest call. English output for the structured values.
export async function extractSearchIntent(nl: string): Promise<SearchIntent> {
  const prompt = `You extract structured search filters from a recruiter's natural-language request. Respond with JSON ONLY, no prose.

Schema:
{
  "semanticQuery": "<short English phrase describing the ROLE and core skills, for semantic search>",
  "filters": {
    "skills": ["<hard skill>", ...],
    "minYears": <integer years of experience>,
    "fieldOrDegree": ["<field of study or degree>", ...]
  }
}

Rules:
- Omit any filter key not mentioned. Omit "filters" entirely if none apply.
- Put the job title / role in semanticQuery, NOT in filters.
- Translate any Thai in the query to English for ALL output values.
- An education level counts as fieldOrDegree. Map Thai levels: ปริญญาตรี = "Bachelor", ปริญญาโท = "Master", ปริญญาเอก = "PhD". A field of study (e.g. "Computer Science") also goes in fieldOrDegree.
- Output English values.

Request: ${nl}`

  // ห้ามโยน error ออกจากฟังก์ชันนี้เด็ดขาด
  //
  // การจัดอันดับจริงใช้ embedding ซึ่งเป็นคนละ endpoint กับโมเดลตอบข้อความ และ
  // ยังทำงานปกติแม้ตอนที่ฝั่ง generate ล่ม การปล่อยให้ error หลุดออกไปจะทำให้
  // "ค้นหา" พังทั้งหน้าเพราะสกัด chip ไม่ได้ ทั้งที่ยังค้นแบบ semantic ได้สบาย
  //
  // ตัวชิปเป็นของเสริม ไม่ใช่แกน — เสียชิปยังค้นเจอ เสียการค้นหาคือใช้งานไม่ได้เลย
  let parsed: any = {}
  try {
    const res = await withTimeout(
      getGemini().models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        // Force strict JSON output (no markdown fences / prose) so complex queries
        // parse reliably instead of falling back to a plain semantic search.
        config: { responseMimeType: 'application/json' },
      })
    )
    const raw = (res.text ?? '').replace(/```json|```/g, '').trim()
    // Extract the JSON object even if the model wraps it in prose.
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw)
  } catch (e) {
    console.error('extractSearchIntent fell back to plain semantic search:', e)
    parsed = {}
  }
  return {
    semanticQuery: String(parsed.semanticQuery ?? nl),
    filters: (parsed.filters ?? {}) as ChipFilters,
  }
}
