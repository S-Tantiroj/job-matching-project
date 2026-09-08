import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { identityName, identitySecondary } from '@/lib/auth/identity'
import { getServerClient } from '@/lib/supabase/server'
import RoleSelect from '@/components/RoleSelect'

export const dynamic = 'force-dynamic'

export default async function AdminUsers() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'admin')) redirect('/dashboard')

  // **ต้องดึง email มาด้วย** — display_name เป็นค่าที่ผู้ใช้ตั้งเองได้ (migration 021)
  // ถ้าแสดงแค่ชื่อ ผู้ใช้ที่เปลี่ยนชื่อเป็น "ตั้ม" จะทำให้แอดมินไม่รู้ว่ากำลังแก้สิทธิ์ของใคร
  // เหลือแต่ uuid ให้เดา ซึ่งเป็นหน้าที่ให้สิทธิ์ระดับ admin ได้ จึงต้องระบุตัวได้แน่นอน
  const { data: users, error } = await getServerClient()
    .from('profiles')
    .select('id, display_name, email, role, created_at')
    .order('created_at')

  return (
    <main>
      <h1>จัดการผู้ใช้</h1>
      {error ? (
        // "อ่านไม่ได้" กับ "ไม่มีผู้ใช้" เป็นคนละเรื่อง — รายการว่างบนหน้าที่ควรมี
        // อย่างน้อยตัวแอดมินเองเสมอ คือสัญญาณว่าพัง ไม่ใช่ข้อมูลจริง
        <p style={{ color: 'var(--bad)' }}>โหลดรายชื่อผู้ใช้ไม่สำเร็จ ลองรีเฟรชอีกครั้ง</p>
      ) : (
        <div className="list">
          {(users ?? []).map((u: any) => {
            const secondary = identitySecondary(u)
            return (
              <div key={u.id} className="list-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{identityName(u, u.id)}</div>
                  {secondary && (
                    <div className="muted" style={{ fontSize: 12 }}>{secondary}</div>
                  )}
                </div>
                <RoleSelect userId={u.id} role={u.role} />
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
