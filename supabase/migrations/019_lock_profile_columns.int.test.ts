import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { getServerClient } from '@/lib/supabase/server'

// พิสูจน์ว่าช่องยกระดับสิทธิ์ปิดจริง — **ไม่ใช่แค่ว่าคำสั่ง grant รันผ่าน**
//
// เทสต์นี้เดินเส้นทางเดียวกับผู้โจมตีจริงทุกขั้น: สร้างบัญชี ล็อกอินด้วย anon key
// ซึ่งเป็นค่าสาธารณะที่อยู่ใน bundle ของเบราว์เซอร์ แล้วยิง PATCH ตรงไปที่ PostgREST
// โดยไม่ผ่านหน้าจอหรือ API route ของแอปเลย
//
// เทสต์ที่ตรวจแค่ว่า "หน้า /settings ไม่มีช่องให้แก้ role" จะเขียวได้ทั้งที่ช่องโหว่
// ยังเปิดอยู่ เพราะช่องโหว่ไม่ได้อยู่ที่หน้าจอ
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

test('ผู้ใช้ที่ล็อกอินแล้วเลื่อน role ของตัวเองไม่ได้ แต่แก้ display_name ได้', async () => {
  const admin = getServerClient()
  const email = `__test__esc_${Date.now()}@example.com`
  const password = `Pw_${Math.random().toString(36).slice(2)}A1!`

  // email_confirm: true เพื่อล็อกอินได้ทันทีโดยไม่ต้องรออีเมลยืนยัน
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  expect(createErr).toBeNull()
  const userId = created!.user!.id

  try {
    // trigger handle_new_user() ควรสร้างแถวใน profiles ให้แล้วด้วย role = 'member'
    const { data: before } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    expect((before as any)?.role).toBe('member')

    // ล็อกอินด้วย anon key — client ตัวนี้มีสิทธิ์เท่าที่เบราว์เซอร์ของผู้ใช้มี
    const asUser = createClient(URL, ANON)
    const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password })
    expect(signInErr).toBeNull()

    // ---- การโจมตี ----
    // RLS ผ่าน (เป็นแถวของตัวเอง) แต่ column-level grant ต้องปฏิเสธ
    const { error: escalateErr } = await asUser
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId)
    expect(escalateErr).not.toBeNull()

    // **ต้องยืนยันที่ฐานข้อมูลด้วย ไม่ใช่เชื่อค่า error อย่างเดียว**
    // ถ้าวันหนึ่ง PostgREST เปลี่ยนไปคืน error เป็น null เมื่อไม่มีแถวถูกแตะ
    // การเช็คแค่ error จะกลายเป็นเทสต์ที่เขียวโดยไม่ได้ตรวจอะไร
    const { data: after } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    expect((after as any)?.role).toBe('member')

    // ---- เส้นทางที่ต้องยังใช้ได้ ----
    // ถ้าถอนสิทธิ์แรงเกินไป หน้า /settings จะพังโดยไม่มีใครรู้จนกว่าจะมีคนใช้
    const { error: nameErr } = await asUser
      .from('profiles')
      .update({ display_name: '__test__ ชื่อใหม่' })
      .eq('id', userId)
    expect(nameErr).toBeNull()

    const { error: settingsErr } = await asUser
      .from('profiles')
      .update({ settings: { defaultRequirement: '__test__' } })
      .eq('id', userId)
    expect(settingsErr).toBeNull()

    const { data: final } = await admin
      .from('profiles')
      .select('display_name, settings')
      .eq('id', userId)
      .maybeSingle()
    expect((final as any)?.display_name).toBe('__test__ ชื่อใหม่')
    expect((final as any)?.settings?.defaultRequirement).toBe('__test__')

    await asUser.auth.signOut()
  } finally {
    // ลบผู้ใช้ทดสอบเสมอ แม้เทสต์ตก — แถวใน profiles หายตามด้วย cascade
    await admin.auth.admin.deleteUser(userId)
  }
}, 30000)

test('ผู้ใช้แก้แถวของคนอื่นไม่ได้ แม้จะเป็นคอลัมน์ที่แก้ของตัวเองได้', async () => {
  const admin = getServerClient()
  const stamp = Date.now()
  const mk = async (n: number) => {
    const email = `__test__esc_${stamp}_${n}@example.com`
    const password = `Pw_${Math.random().toString(36).slice(2)}A1!`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    expect(error).toBeNull()
    return { id: data!.user!.id, email, password }
  }

  const attacker = await mk(1)
  const victim = await mk(2)

  try {
    const asAttacker = createClient(URL, ANON)
    await asAttacker.auth.signInWithPassword({
      email: attacker.email,
      password: attacker.password,
    })

    // policy "update own profile" กันไว้ที่ระดับแถว — คำสั่งไม่ error แต่ต้องไม่โดนแถวไหน
    await asAttacker
      .from('profiles')
      .update({ display_name: '__test__ ถูกยึด' })
      .eq('id', victim.id)

    const { data } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', victim.id)
      .maybeSingle()
    expect((data as any)?.display_name).not.toBe('__test__ ถูกยึด')

    await asAttacker.auth.signOut()
  } finally {
    await admin.auth.admin.deleteUser(attacker.id)
    await admin.auth.admin.deleteUser(victim.id)
  }
}, 30000)
