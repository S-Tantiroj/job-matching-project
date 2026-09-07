import {
  LayoutDashboard,
  Search,
  Briefcase,
  Bookmark,
  ClipboardCheck,
  Database,
  Upload,
  Shield,
  HelpCircle,
  Settings,
  type LucideIcon,
} from 'lucide-react'

// แหล่งเดียวของรายการเมนู ไอคอน และชื่อหน้าที่แสดงบนแถบบน
//
// เดิมรายการเมนูฝังอยู่ใน JSX ของ app/(app)/layout.tsx จึงเอาไปใช้ที่อื่นไม่ได้
// และเขียนเทสต์ครอบไม่ได้ — การกั้น role ของแต่ละลิงก์ไม่มีอะไรดักว่ายังถูกอยู่
export type NavItem = {
  href: string
  label: string
  Icon: LucideIcon
  placement: 'sidebar' | 'topRight'
  requires?: 'data_manager' | 'admin'
  /** เส้นทางที่เข้าได้โดยไม่ต้องล็อกอิน ค่าปริยายคือต้องล็อกอิน */
  requiresAuth?: false
}

// **การกั้นด้วย requires เป็นความสะอาดของหน้าจอ ไม่ใช่ความปลอดภัย**
// isAdmin/isDataManager เดินทางไปถึง bundle ฝั่งเบราว์เซอร์ ใครแก้ใน devtools
// จะเห็นลิงก์ Admin โผล่ แต่กดเข้าไปไม่ได้เพราะ middleware.ts กันฝั่งเซิร์ฟเวอร์
// และ route handler ตรวจ role เอง
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, placement: 'sidebar' },
  { href: '/search', label: 'Search', Icon: Search, placement: 'sidebar' },
  { href: '/jobs', label: 'Job', Icon: Briefcase, placement: 'sidebar' },
  { href: '/shortlists', label: 'Shortlist', Icon: Bookmark, placement: 'sidebar' },
  { href: '/self-assessment', label: 'ประเมินตัวเอง', Icon: ClipboardCheck, placement: 'sidebar' },
  { href: '/candidates', label: 'ข้อมูล', Icon: Database, placement: 'sidebar', requires: 'data_manager' },
  { href: '/import', label: 'Import', Icon: Upload, placement: 'sidebar', requires: 'data_manager' },
  { href: '/admin/users', label: 'Admin', Icon: Shield, placement: 'sidebar', requires: 'admin' },
  // /help อยู่ในกลุ่ม (public) จึงเปิดได้โดยไม่ล็อกอิน และต้องไม่อยู่ใน matcher
  { href: '/help', label: 'คู่มือ', Icon: HelpCircle, placement: 'topRight', requiresAuth: false },
  { href: '/settings', label: 'ตั้งค่า', Icon: Settings, placement: 'topRight' },
]

export function sidebarItems(opts: { isAdmin: boolean; isDataManager: boolean }): NavItem[] {
  return NAV_ITEMS.filter((i) => {
    if (i.placement !== 'sidebar') return false
    if (i.requires === 'admin') return opts.isAdmin
    if (i.requires === 'data_manager') return opts.isDataManager
    return true
  })
}

export function topRightItems(): NavItem[] {
  return NAV_ITEMS.filter((i) => i.placement === 'topRight')
}

// ชื่อหน้าที่แสดงบนแถบบน
//
// **ต้องเลือกคำนำหน้าที่ยาวที่สุด ไม่ใช่อันแรกที่เจอ** — ถ้าวันหนึ่งมี '/admin'
// กับ '/admin/users' อยู่ด้วยกัน การหยุดที่อันแรกจะให้คำตอบตามลำดับในอาร์เรย์
// ซึ่งเป็นสิ่งที่คนแก้ไฟล์ทีหลังไม่มีทางรู้ว่ามีความหมาย
//
// เทียบที่ขอบเส้นทางเท่านั้น ('/searching' ไม่ใช่หน้าลูกของ '/search')
export function pageTitle(pathname: string): string {
  let best: NavItem | undefined
  for (const i of NAV_ITEMS) {
    const hit = pathname === i.href || pathname.startsWith(i.href + '/')
    if (hit && (!best || i.href.length > best.href.length)) best = i
  }
  return best?.label ?? 'Skouth'
}
