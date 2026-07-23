import 'dotenv/config'
import { upsertJob } from '@/lib/jobs/upsert'
import type { JobInput } from '@/lib/jobs/normalize'

// Seeds a fixed set of synthetic jobs (English fields) for demoing job → candidate
// matching. Idempotent: dedups on (source, external_id).
// Usage:  npx tsx scripts/seed-jobs.ts
const JOBS: JobInput[] = [
  {
    title: 'Data Scientist',
    company: 'Siam Analytics',
    description: 'Build and deploy machine learning models on large datasets. Python, strong statistics, experience studying or working abroad a plus.',
    required_skills: ['Python', 'Machine Learning', 'SQL', 'Statistics'],
    min_experience_years: 3,
    location: 'Bangkok',
    category: 'Data',
    source: 'synthetic',
    external_id: 'seed-data-scientist',
  },
  {
    title: 'Frontend Engineer',
    company: 'Bangkok Fintech',
    description: 'Build responsive web apps with React and TypeScript. Care about UX and accessibility.',
    required_skills: ['React', 'TypeScript', 'CSS'],
    min_experience_years: 2,
    location: 'Bangkok',
    category: 'Engineering',
    source: 'synthetic',
    external_id: 'seed-frontend-engineer',
  },
  {
    title: 'Product Manager',
    company: 'Chiang Mai Ventures',
    description: 'Own product roadmap for a consumer app. Work with design and engineering. International education preferred.',
    required_skills: ['Product Strategy', 'Analytics', 'Communication'],
    min_experience_years: 5,
    location: 'Remote',
    category: 'Product',
    source: 'synthetic',
    external_id: 'seed-product-manager',
  },
  {
    title: 'Marketing Analyst',
    company: 'Thai Commerce Group',
    description: 'Analyze campaign performance and customer segments. SQL and data storytelling.',
    required_skills: ['SQL', 'Excel', 'Marketing Analytics'],
    min_experience_years: 2,
    location: 'Bangkok',
    category: 'Marketing',
    source: 'synthetic',
    external_id: 'seed-marketing-analyst',
  },
]

async function main() {
  let done = 0
  for (const job of JOBS) {
    try {
      await upsertJob(job)
      done++
      console.log(`seeded ${done}/${JOBS.length}: ${job.title}`)
    } catch (e: any) {
      console.error('  skip one job:', e?.message ?? e)
    }
  }
  console.log(`Done. ${done} synthetic jobs in the database.`)
}

main().catch((e) => {
  console.error('Seed failed:', e?.message ?? e)
  process.exit(1)
})