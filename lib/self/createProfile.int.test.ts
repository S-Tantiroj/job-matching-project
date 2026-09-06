import 'dotenv/config'
import { getServerClient } from '@/lib/supabase/server'
import { createSelfProfile } from './createProfile'
import { tolerateOutage } from '@/test-utils/integration'

// Integration: ต้องมี Supabase env + Gemini key (เรียก assess และ embed จริง)
// ใช้ owner_id ของ profile ที่มีอยู่จริงเพราะมี FK ไป profiles(id)

// เรียง created_at แล้วตาม id เป็นตัวตัดสินเสมอ (deterministic) — ห้าม .limit(1)
// เฉยๆ โดยไม่มี .order() เพราะไม่มี ORDER BY แปลว่า Postgres คืนแถวแรกในฮีป ซึ่ง
// ช่องว่างต้นฮีปจะถูกใช้ซ้ำหลังมีการลบ ทำให้ผลลัพธ์เปลี่ยนไปมาแบบสุ่มข้ามการรัน
//
// โยน error ออกไปแทนการกลืนไว้ — ถ้าไม่โยน ทั้ง "เครือข่ายล่ม" และ "ตาราง
// profiles ว่างจริง" จะกลายเป็น null เหมือนกันหมด แล้วข้อความข้าม (skip) ที่ผู้ใช้
// เห็นบน Windows จะบอกเหตุผลผิด — ที่นี่ error จริงจะโผล่ผ่าน tolerateOutage
// (ข้ามพร้อมข้อความ ถ้าเป็นความล้มเหลวชั่วคราว) หรือทำให้เทสต์ตกจริงถ้าไม่ใช่
async function anyUserId(): Promise<string | null> {
  const { data, error } = await getServerClient()
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as any)?.id ?? null
}

test('createSelfProfile บันทึกแถวพร้อม embedding 768 มิติ และไม่เขียน raw_text', async (ctx) => {
  await tolerateOutage(ctx, async () => {
    const userId = await anyUserId()
    if (!userId) {
      console.warn('\n  ⏭  ข้ามเทสต์ — ยังไม่มีผู้ใช้ในตาราง profiles\n')
      return ctx.skip()
    }

    // owner_id ปลอมปนมาใน draft โดยตั้งใจ (ผ่าน as any เพราะ ProfileDraft ไม่มี
    // ฟิลด์นี้) เพื่อพิสูจน์ว่า createSelfProfile ไม่มีทางอ่าน owner_id จาก draft
    // เลย — ต้องมาจาก argument userId เท่านั้น ถ้าแค่สังเกตค่าที่ถูกต้องเฉยๆ โดย
    // ไม่ยัดค่าปลอมเข้าไปก่อน จะพิสูจน์ไม่ได้ว่าโค้ดไม่ได้บังเอิญอ่าน draft.owner_id
    const bogusOwnerId = '00000000-0000-0000-0000-000000000000'
    const id = await createSelfProfile(
      {
        full_name: '__test__ Somchai Jaidee',
        headline: 'Data Scientist',
        industry: 'Banking',
        summary: 'Ten years building forecasting models.',
        education: [{ institution: 'University of Michigan', country: 'USA', degree: 'MS', gpa: '3.45' }],
        experience: [{ company: 'Agoda', title: 'Data Scientist', start_date: '2018-01-01' }],
        skills: ['Python', 'SQL'],
        owner_id: bogusOwnerId,
      } as any,
      userId
    )
    expect(typeof id).toBe('string')

    // ครอบทุกอย่างหลัง insert ด้วย try/finally แล้วลบด้วย id ที่จับไว้ในขั้นตอน
    // ตอนท้ายเสมอ — ถ้า expect() ใดล้มเหลวก่อนถึงบรรทัด delete เดิม แถว
    // __test__ Somchai Jaidee จะค้างอยู่ในตาราง self_profiles จริงตลอดไป
    try {
      const { data } = await getServerClient()
        .from('self_profiles')
        .select('raw_text, parsed_data, assessment, embedding, owner_id')
        .eq('id', id)
        .single()

      const row = data as any
      expect(row.raw_text).toBeNull()
      expect(row.parsed_data.full_name).toBe('__test__ Somchai Jaidee')
      // gpa ต้องอยู่ใน parsed_data แม้จะไม่เข้า embedding
      expect(row.parsed_data.education[0].gpa).toBe('3.45')
      expect(row.assessment.summary.length).toBeGreaterThan(0)

      // owner_id ต้องมาจาก argument userId เท่านั้น ไม่ใช่จาก draft (bogusOwnerId
      // ต้องไม่ถูกเขียนลงไปไม่ว่ากรณีใด) — นี่คือคุณสมบัติด้านความปลอดภัยที่สำคัญ
      // ที่สุดของฟังก์ชันนี้
      expect(row.owner_id).toBe(userId)
      expect(row.owner_id).not.toBe(bogusOwnerId)

      // Supabase คืน vector เป็น string ของ JSON array
      const vec = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding
      expect(vec).toHaveLength(768)
    } finally {
      await getServerClient().from('self_profiles').delete().eq('id', id)
    }
  })
}, 60000)
