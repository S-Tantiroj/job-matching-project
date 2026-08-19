// ตัวช่วยตีความสิ่งที่ Supabase ส่งกลับมาในขั้นตอนสมัคร → ยืนยันอีเมล
// แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อให้เขียนเทสต์ได้โดยไม่ต้องมีเบราว์เซอร์หรือเครือข่าย

export type SignUpUserLike = { identities?: unknown[] | null } | null | undefined

// Supabase ไม่แจ้งว่าอีเมลซ้ำ เพื่อไม่ให้ใครใช้หน้าสมัครไล่เดาว่าอีเมลไหนเป็นสมาชิก
// มันตอบกลับเหมือนสำเร็จ และยังส่งอีเมลยืนยันซ้ำให้บัญชีที่ยังไม่ยืนยันด้วย
// สัญญาณเดียวที่แยกได้คือ identities เป็น array ว่างเมื่ออีเมลนั้นมีบัญชีอยู่แล้ว
//
// ข้อควรรู้: พฤติกรรมนี้ Supabase ไม่ได้รับประกันไว้เป็นสัญญา ถ้าวันหนึ่งเขาเปลี่ยน
// รูปแบบ response เทสต์ของฟังก์ชันนี้จะยังผ่าน (เพราะเทสต์กับข้อมูลจำลอง) แต่ของจริง
// จะเงียบๆ เลิกทำงาน — ให้ทดสอบด้วยมือซ้ำเมื่ออัปเกรด @supabase/supabase-js ครั้งใหญ่
export function isExistingUser(user: SignUpUserLike): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0
}

// ลิงก์ยืนยันที่หมดอายุหรือถูกใช้ไปแล้ว Supabase จะ redirect กลับมาพร้อมพารามิเตอร์
// `error` ซึ่งอาจอยู่ใน query string (?error=...) หรือใน fragment (#error=...)
// แล้วแต่ flow ที่ใช้ จึงต้องตรวจทั้งสองที่
export function hasAuthError(search: string, hash: string): boolean {
  const fromSearch = new URLSearchParams(search.replace(/^\?/, ''))
  const fromHash = new URLSearchParams(hash.replace(/^#/, ''))
  return fromSearch.has('error') || fromHash.has('error')
}
