import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase/server'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// เทสต์ทั้งสามตัวยืนยัน "อีเมลใน profiles ต้องตรงกับ auth.users เสมอ และผู้ใช้แก้ไม่ได้"
// ซึ่งเป็นเงื่อนไขที่ทำให้เปิดช่องเปลี่ยน display_name ได้อย่างปลอดภัย

test('สมัครใหม่แล้ว profiles ได้ email มาด้วย', async () => {
  const admin = getServerClient()
  const email = `__test__mail_${Date.now()}@example.com`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: `Pw_${Math.random().toString(36).slice(2)}A1!`,
    email_confirm: true,
  })
  expect(error).toBeNull()
  const userId = created!.user!.id

  try {
    const { data } = await admin
      .from('profiles')
      .select('email, display_name')
      .eq('id', userId)
      .maybeSingle()
    expect((data as any)?.email).toBe(email)
    // display_name ยังตั้งต้นเป็นอีเมลเหมือนเดิม — แอดมินต้องมีอะไรให้เห็นก่อนผู้ใช้ตั้งชื่อเอง
    expect((data as any)?.display_name).toBe(email)
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
}, 30000)

test('เปลี่ยนอีเมลใน auth แล้ว profiles.email ตามทัน', async () => {
  const admin = getServerClient()
  const stamp = Date.now()
  const before = `__test__mail_${stamp}_a@example.com`
  const after = `__test__mail_${stamp}_b@example.com`

  const { data: created, error } = await admin.auth.admin.createUser({
    email: before,
    password: `Pw_${Math.random().toString(36).slice(2)}A1!`,
    email_confirm: true,
  })
  expect(error).toBeNull()
  const userId = created!.user!.id

  try {
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      email: after,
      email_confirm: true,
    })
    expect(updErr).toBeNull()

    // ถ้าไม่มี trigger ตัวที่สอง (after update of email) ค่านี้จะยังเป็นอีเมลเดิม
    // ซึ่งเป็นข้อมูลที่ดูน่าเชื่อถือแต่ผิด — แย่กว่าการไม่มีคอลัมน์นี้เลย
    const { data } = await admin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    expect((data as any)?.email).toBe(after)
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
}, 30000)

test('ผู้ใช้ที่ล็อกอินแล้วแก้ email ของตัวเองในตาราง profiles ไม่ได้', async () => {
  const admin = getServerClient()
  const email = `__test__mail_${Date.now()}_c@example.com`
  const password = `Pw_${Math.random().toString(36).slice(2)}A1!`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  expect(error).toBeNull()
  const userId = created!.user!.id

  try {
    const asUser = createClient(URL, ANON)
    const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password })
    expect(signInErr).toBeNull()

    // 019 คืนสิทธิ์ UPDATE ให้เฉพาะ (display_name, settings) — email จึงถูกปฏิเสธ
    // การปลอมอีเมลในตารางนี้เท่ากับปลอมตัวเป็นคนอื่นในสายตาแอดมินและ activity_log
    const { error: writeErr } = await asUser
      .from('profiles')
      .update({ email: 'attacker@example.com' })
      .eq('id', userId)
    expect(writeErr).not.toBeNull()

    // ยืนยันที่ฐานซ้ำ ไม่เชื่อค่า error อย่างเดียว
    const { data } = await admin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle()
    expect((data as any)?.email).toBe(email)

    // เส้นทางที่ต้องยังใช้ได้: เปลี่ยนชื่อที่แสดงเองได้ตามปกติ
    const { error: nameErr } = await asUser
      .from('profiles')
      .update({ display_name: '__test__ ตั้ม' })
      .eq('id', userId)
    expect(nameErr).toBeNull()

    await asUser.auth.signOut()
  } finally {
    await admin.auth.admin.deleteUser(userId)
  }
}, 30000)
