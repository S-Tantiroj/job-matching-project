'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { pageTitle, sidebarItems, topRightItems } from './navItems'

export default function AppShell({
  isAdmin,
  isDataManager,
  children,
}: {
  isAdmin: boolean
  isDataManager: boolean
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // **ปิด drawer เองเมื่อเปลี่ยนหน้า — ไม่ใช่ของแถม**
  // layout ของ Next.js อยู่ข้ามการเปลี่ยนหน้าภายในกลุ่มเดียวกัน state ของ client
  // component จึงไม่ถูกล้าง ถ้าไม่เขียนไว้ พอกดลิงก์ในเมนูแล้วหน้าใหม่โหลดเสร็จ
  // drawer จะยังค้างทับอยู่และผู้ใช้ต้องกดปิดเองทุกครั้ง
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const items = sidebarItems({ isAdmin, isDataManager })
  const cls = ['shell', collapsed && 'shell--collapsed', drawerOpen && 'shell--drawer-open']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Link href="/dashboard" className="nav-avatar" aria-label="Skouth">S</Link>
          <Link href="/dashboard" className="sidebar-brand">Skouth</Link>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'กางแถบเมนู' : 'พับแถบเมนู'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {items.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="sidebar-link" title={label}>
            <Icon size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span>{label}</span>
          </Link>
        ))}
      </aside>

      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="ปิดแถบเมนู"
        onClick={() => setDrawerOpen(false)}
      />

      <div className="content">
        <div className="topbar">
          <button
            type="button"
            className="icon-btn sidebar-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="เปิดแถบเมนู"
          >
            <Menu size={20} />
          </button>
          <span className="topbar-title">{pageTitle(pathname)}</span>
          <div className="topbar-actions">
            {topRightItems().map(({ href, label, Icon, requiresAuth }) => (
              <Link
                key={href}
                href={href}
                className="icon-btn"
                title={label}
                aria-label={label}
                // /help อยู่คนละกลุ่ม layout กดแล้วหลุดออกจากโครง sidebar ทั้งหมด
                // เปิดแท็บใหม่เพื่อไม่ให้งานที่ค้างอยู่บนหน้าเดิมหาย
                {...(requiresAuth === false
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <Icon size={20} />
              </Link>
            ))}
          </div>
        </div>
        <div className="container">{children}</div>
      </div>
    </div>
  )
}
