import { getGemini } from './client'
import { withTimeout, GEMINI_TIMEOUT_MS } from './withTimeout'

// 768 dims to match candidates.embedding (and the existing jobs table),
// keeping candidate and job vectors in the same space for future matching.
// taskType: RETRIEVAL_DOCUMENT when indexing a profile, RETRIEVAL_QUERY when
// embedding a search query.
export async function embedText(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const res = await withTimeout(
    getGemini().models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768, taskType },
    }),
    GEMINI_TIMEOUT_MS
  )
  return res.embeddings![0].values!
}
