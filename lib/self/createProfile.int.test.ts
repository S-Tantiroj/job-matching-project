import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { createSelfProfile } from './createProfile'
import { tolerateOutage } from '@/test-utils/integration'

// Integration: ต้องมี Supabase env + Gemini key (เรียก assess และ embed จริง)
// ใช้ owner_id ของ profile ที่มีอยู่จริงเพราะมี FK ไป profiles(id)

async function anyUserId(): Promise<string | null> {
  const { data } = await getServerClient().from('profiles').select('id').limit(1).maybeSingle()
  return (data as any)?.id ?? null
}

test('createSelfProfile บันทึกแถวพร้อม embedding 768 มิติ และไม่เขียน raw_text', async (ctx) => {
  await tolerateOutage(ctx, async () => {
    const userId = await anyUserId()
    if (!userId) {
      console.warn('\n  ⏭  ข้ามเทสต์ — ยังไม่มีผู้ใช้ในตาราง profiles\n')
      return ctx.skip()
    }

    const id = await createSelfProfile(
      {
        full_name: '__test__ Somchai Jaidee',
        headline: 'Data Scientist',
        industry: 'Banking',
        summary: 'Ten years building forecasting models.',
        education: [{ institution: 'University of Michigan', country: 'USA', degree: 'MS', gpa: '3.45' }],
        experience: [{ company: 'Agoda', title: 'Data Scientist', start_date: '2018-01-01' }],
        skills: ['Python', 'SQL'],
      },
      userId
    )
    expect(typeof id).toBe('string')

    const { data } = await getServerClient()
      .from('self_profiles')
      .select('raw_text, parsed_data, assessment, embedding')
      .eq('id', id)
      .single()

    const row = data as any
    expect(row.raw_text).toBeNull()
    expect(row.parsed_data.full_name).toBe('__test__ Somchai Jaidee')
    // gpa ต้องอยู่ใน parsed_data แม้จะไม่เข้า embedding
    expect(row.parsed_data.education[0].gpa).toBe('3.45')
    expect(row.assessment.summary.length).toBeGreaterThan(0)

    // Supabase คืน vector เป็น string ของ JSON array
    const vec = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding
    expect(vec).toHaveLength(768)

    await getServerClient().from('self_profiles').delete().eq('id', id)
  })
}, 60000)
