import { getGemini } from '@/lib/gemini/client'

export type ChipFilters = {
  skills?: string[]
  educationAbroad?: { anyForeign?: boolean; countries?: string[] }
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
    "educationAbroad": { "anyForeign": true }  // if they say studied abroad generally
      OR { "countries": ["USA", "UK", ...] },   // if they name countries (use short forms USA, UK)
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

  const res = await getGemini().models.generateContent({
    model: 'gemini-flash-latest',
    contents: prompt,
    // Force strict JSON output (no markdown fences / prose) so complex queries
    // parse reliably instead of falling back to a plain semantic search.
    config: { responseMimeType: 'application/json' },
  })
  // The LLM can occasionally return malformed or truncated JSON (long/complex
  // queries). Never throw — fall back to a plain semantic search on the raw text.
  let parsed: any = {}
  try {
    parsed = JSON.parse((res.text ?? '').replace(/```json|```/g, '').trim())
  } catch {
    parsed = {}
  }
  return {
    semanticQuery: String(parsed.semanticQuery ?? nl),
    filters: (parsed.filters ?? {}) as ChipFilters,
  }
}
