import 'dotenv/config'
import { embedText } from '../lib/gemini/embed'

// Quick sanity check that the Gemini API key works and returns a 768-dim vector.
// Run: npx tsx scripts/test-gemini.ts
async function main() {
  console.log('Calling Gemini embedding API...')
  const v = await embedText('Data scientist who studied at Oxford, skilled in Python and SQL')
  console.log('OK — dimensions:', v.length)
  console.log('first 5 values:', v.slice(0, 5))
  if (v.length !== 768) {
    console.error('WARNING: expected 768 dims, got', v.length)
    process.exit(1)
  }
  console.log('Gemini embedding works correctly.')
}

main().catch((e) => {
  console.error('Gemini call failed:', e?.message ?? e)
  process.exit(1)
})
