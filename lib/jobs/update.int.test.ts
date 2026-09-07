import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { upsertJob } from './upsert'
import { updateJob, deleteJob } from './update'

const db = getServerClient()
const made: string[] = []

afterAll(async () => {
  if (made.length) await db.from('jobs').delete().in('id', made)
})

async function makeJob(title: string) {
  const { id } = await upsertJob({
    title,
    description: 'Build and ship models for the analytics team',
    required_skills: ['Python'],
    min_experience_years: 3,
    category: 'Technology',
  })
  made.push(id)
  return id
}

// ต้องมีผู้สมัครสักคนเพื่อสร้างแถว analyses ที่ FK ถูกต้อง
async function anyCandidateId(): Promise<string> {
  const { data, error } = await db
    .from('candidates')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error
  if (!data?.length) {
    throw new Error('ต้องมีผู้สมัครอย่างน้อยหนึ่งคน — รัน scripts/seed-synthetic.ts ก่อน')
  }
  return (data[0] as any).id
}

async function seedScore(jobId: string, tag: string) {
  const candidateId = await anyCandidateId()
  const { error } = await db.from('analyses').insert({
    candidate_id: candidateId,
    requirement_text: `__test__ ${tag}`,
    requirement_hash: `__test__${tag}`,
    score: 77,
    reasoning: '__test__',
    job_id: jobId,
  })
  if (error) throw error
}

async function countScores(jobId: string) {
  const { count, error } = await db
    .from('analyses')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
  if (error) throw error
  return count ?? 0
}

test('ลบงานแล้วแถว analyses ที่ผูกอยู่หายไปด้วย (FK cascade)', async () => {
  // migration 018 คือชิ้นที่รับน้ำหนักทั้งฟีเจอร์ ไม่มีอะไรอื่นพิสูจน์ cascade ได้
  const id = await makeJob('__test__ cascade job')
  await seedScore(id, 'cascade')
  expect(await countScores(id)).toBe(1)

  await deleteJob(id)
  expect(await countScores(id)).toBe(0)
}, 60_000)

test('แก้จนข้อความความต้องการเปลี่ยน คะแนนเก่าถูกลบและนับตรง', async () => {
  const id = await makeJob('__test__ stale job')
  await seedScore(id, 'stale')

  const res = await updateJob(id, { description: 'A completely different job description' })
  expect(res?.reembedded).toBe(true)
  expect(res?.staleScoresRemoved).toBe(1)
  expect(await countScores(id)).toBe(0)
}, 60_000)

test('แก้เฉพาะ category — re-embed แต่คะแนนเก่ายังอยู่', async () => {
  // category อยู่ใน buildJobEmbedText แต่ไม่อยู่ใน buildJobRequirementText
  const id = await makeJob('__test__ category job')
  await seedScore(id, 'category')

  const res = await updateJob(id, { category: 'Finance' })
  expect(res?.reembedded).toBe(true)
  expect(res?.staleScoresRemoved).toBe(0)
  expect(await countScores(id)).toBe(1)
}, 60_000)

test('แก้งานที่ไม่มีอยู่คืน null', async () => {
  const res = await updateJob('00000000-0000-0000-0000-000000000000', { title: 'x' })
  expect(res).toBeNull()
})

test('ลบงานที่ไม่มีอยู่คืน deleted: false', async () => {
  const res = await deleteJob('00000000-0000-0000-0000-000000000000')
  expect(res.deleted).toBe(false)
})
