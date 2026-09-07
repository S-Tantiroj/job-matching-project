# Sidebar Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ย้ายแถบเมนูของกลุ่ม `(app)` จากแถบบนไปเป็น sidebar ซ้ายที่พับได้ มีไอคอนทุกรายการ แยกคู่มือกับตั้งค่าไปมุมขวาบน และแสดงชื่อหน้าปัจจุบันบนแถบบน

**Architecture:** `app/(app)/layout.tsx` ยังเป็น server component เรียก `getSession()` แล้วส่ง boolean สองตัวเข้า `components/nav/AppShell.tsx` ซึ่งเป็น client component ถือสถานะพับ/กางและ drawer บนมือถือ รายการเมนูทั้งหมดอยู่ใน `components/nav/navItems.ts` ที่เดียว ทั้ง sidebar ปุ่มมุมขวาบน และชื่อหน้าอ่านจากที่นั่น

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, `lucide-react` (dependency ใหม่)

**Spec:** `docs/superpowers/specs/2026-09-07-sidebar-nav-design.md`

## Global Constraints

- **ห้ามแตะกลุ่ม `(public)`** — `app/(public)/layout.tsx` และคลาส `.pub-nav*` `.pub-wrap` ใน `globals.css` ต้องเหมือนเดิมทุกตัวอักษร
- **ห้ามแก้ `middleware.ts`** — แผนนี้อ่านมันอย่างเดียว การเพิ่ม `/help` เข้า `matcher` จะทำให้คนที่ยังไม่ล็อกอินอ่านคู่มือไม่ได้ (ข้อห้ามใน CLAUDE.md)
- **ไม่ไฮไลต์เมนูของหน้าที่เปิดอยู่** — ตัดสินใจแล้ว ยืนยันสองครั้ง ห้ามใส่คืนเพราะ "ดูแล้วน่าจะดี"
- **ไม่จำสถานะพับ/กาง** — ห้ามใช้ `localStorage` / `sessionStorage` / cookie
- **ไม่ทำ focus trap** ใน drawer — ถ้าจะทำวันหลังให้ใช้ `<dialog>` ไม่ใช่เขียน trap เอง
- **breakpoint คือ `780px`** ค่าเดียวกับที่มีอยู่แล้วใน `globals.css`
- **ความกว้าง sidebar: กาง `208px` หุบ `56px`**
- ห้าม hardcode สีใหม่ ใช้ตัวแปรที่มีอยู่ใน `:root` ของ `globals.css` (`--surface`, `--border`, `--text`, `--text-faint`, `--accent`, `--accent-soft`)
- ภาษาไทยทั้งหมดใน UI, identifier ในโค้ดเป็นอังกฤษ
- Sandbox รัน `npx vitest` / `npm run build` / `npm install` ไม่ได้ — ทุก step ที่ต้องรันคำสั่งเหล่านี้ต้องให้มนุษย์รันบน Windows แล้วรายงานผลกลับ

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `components/nav/navItems.ts` | **สร้าง** — ข้อมูลเมนูล้วน + ฟังก์ชันบริสุทธิ์สามตัว ไม่มี JSX |
| `components/nav/navItems.test.ts` | **สร้าง** — เทสต์โครงสร้างเมนู และความสอดคล้องกับ `middleware.ts` |
| `components/nav/AppShell.tsx` | **สร้าง** — client component ตัวเดียวที่ถือ state ทั้งหมด |
| `app/(app)/layout.tsx` | **แก้** — เรียก `AppShell` แทนการเขียน `<nav>` เอง |
| `app/globals.css` | **แก้** — เพิ่มคลาสใหม่ ลบ `.nav*` ที่ตายแล้ว |

`navItems.ts` แยกจาก `AppShell.tsx` เพราะมันต้องถูก import จากเทสต์ที่รันบน Node เปล่าๆ ถ้ารวมอยู่ในไฟล์ `.tsx` เดียวกับ hook ของ React เทสต์จะลาก `next/navigation` เข้ามาด้วยโดยไม่จำเป็น

---

## Task 0: ติดตั้ง dependency (มนุษย์ทำ)

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: ติดตั้ง lucide-react**

รันบน Windows ที่ราก repo:

```
npm install lucide-react
```

- [ ] **Step 2: ยืนยันว่าติดตั้งแล้ว**

```
node -e "console.log(require('lucide-react/package.json').version)"
```

Expected: พิมพ์เลขเวอร์ชันออกมา ไม่ใช่ `MODULE_NOT_FOUND`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-react for nav icons"
```

**หยุดตรงนี้จนกว่า Step 2 จะผ่าน** — ทุก task ที่เหลือ import จาก `lucide-react`

---

## Task 1: navItems.ts + เทสต์

**Files:**
- Create: `components/nav/navItems.ts`
- Test: `components/nav/navItems.test.ts`

**Interfaces:**
- Consumes: `lucide-react` (Task 0)
- Produces:
  - `type NavItem = { href: string; label: string; Icon: LucideIcon; placement: 'sidebar' | 'topRight'; requires?: 'data_manager' | 'admin'; requiresAuth?: false }`
  - `NAV_ITEMS: NavItem[]`
  - `sidebarItems(opts: { isAdmin: boolean; isDataManager: boolean }): NavItem[]`
  - `topRightItems(): NavItem[]`
  - `pageTitle(pathname: string): string`

- [ ] **Step 1: เขียนเทสต์ที่ยังแดง**

สร้าง `components/nav/navItems.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { NAV_ITEMS, sidebarItems, topRightItems, pageTitle } from './navItems'

// ตัด '/:path*' ออกจากแต่ละรายการใน matcher เหลือคำนำหน้า
// '/admin/:path*' -> '/admin'
function matcherPrefixes(): string[] {
  const src = readFileSync('middleware.ts', 'utf8')
  const start = src.indexOf('matcher:')
  const end = src.indexOf(']', start)
  const block = src.slice(start, end)
  const out: string[] = []
  const re = /'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block))) out.push(m[1].replace('/:path*', ''))
  return out
}

function isCovered(href: string, prefixes: string[]): boolean {
  return prefixes.some((p) => href === p || href.startsWith(p + '/'))
}

test('href ห้ามซ้ำ', () => {
  const hrefs = NAV_ITEMS.map((i) => i.href)
  expect(new Set(hrefs).size).toBe(hrefs.length)
})

test('ทุกรายการมี label, Icon และ placement', () => {
  for (const i of NAV_ITEMS) {
    expect(i.label.trim().length).toBeGreaterThan(0)
    expect(i.Icon).toBeTruthy()
    expect(['sidebar', 'topRight']).toContain(i.placement)
  }
})

test('รายการที่กั้นด้วย role เป็นสามอันนี้เป๊ะ', () => {
  // ถ้าใครลบ requires ออกจาก Admin โดยไม่ตั้งใจ เทสต์นี้แดงทันที
  const gated = NAV_ITEMS.filter((i) => i.requires).map((i) => i.href).sort()
  expect(gated).toEqual(['/admin/users', '/candidates', '/import'])
})

test('ทุก href ที่ต้องล็อกอิน ถูกครอบด้วย matcher ของ middleware', () => {
  // เพิ่มเมนูชี้ไปหน้าใหม่แล้วลืมใส่ใน matcher = หน้านั้นเปิดได้โดยไม่ต้องล็อกอิน
  // และไม่มีอาการอะไรให้สังเกตเลยเพราะเมนูทำงานปกติ
  const prefixes = matcherPrefixes()
  expect(prefixes.length).toBeGreaterThan(0)
  for (const i of NAV_ITEMS) {
    if (i.requiresAuth === false) continue
    expect(isCovered(i.href, prefixes)).toBe(true)
  }
})

test('/help ต้องไม่ถูกครอบด้วย matcher', () => {
  // ทิศตรงข้าม — เผลอใส่ /help เข้า matcher แล้วคนที่ยังไม่ล็อกอินอ่านคู่มือไม่ได้
  // ข้อห้ามนี้เขียนไว้ใน CLAUDE.md แล้วแต่ยังไม่เคยมีอะไรดัก
  const help = NAV_ITEMS.find((i) => i.href === '/help')
  expect(help?.requiresAuth).toBe(false)
  expect(isCovered('/help', matcherPrefixes())).toBe(false)
})

test('sidebarItems กรองตาม role', () => {
  const member = sidebarItems({ isAdmin: false, isDataManager: false }).map((i) => i.href)
  expect(member).not.toContain('/candidates')
  expect(member).not.toContain('/import')
  expect(member).not.toContain('/admin/users')
  expect(member).toContain('/dashboard')

  const dm = sidebarItems({ isAdmin: false, isDataManager: true }).map((i) => i.href)
  expect(dm).toContain('/candidates')
  expect(dm).toContain('/import')
  expect(dm).not.toContain('/admin/users')

  const admin = sidebarItems({ isAdmin: true, isDataManager: true }).map((i) => i.href)
  expect(admin).toContain('/admin/users')
})

test('sidebarItems ไม่คืนรายการของมุมขวาบน', () => {
  const hrefs = sidebarItems({ isAdmin: true, isDataManager: true }).map((i) => i.href)
  expect(hrefs).not.toContain('/help')
  expect(hrefs).not.toContain('/settings')
})

test('topRightItems คือคู่มือกับตั้งค่า เรียงตามนี้', () => {
  expect(topRightItems().map((i) => i.href)).toEqual(['/help', '/settings'])
})

test('pageTitle หาจากคำนำหน้าที่ยาวที่สุด', () => {
  expect(pageTitle('/candidates')).toBe('ข้อมูล')
  expect(pageTitle('/candidates/abc-123')).toBe('ข้อมูล')
  expect(pageTitle('/settings')).toBe('ตั้งค่า')
  expect(pageTitle('/jobs/42')).toBe('Job')
})

test('pageTitle คืน Skouth เมื่อไม่ตรงอะไรเลย', () => {
  expect(pageTitle('/')).toBe('Skouth')
  expect(pageTitle('/ไม่มีอยู่จริง')).toBe('Skouth')
})

test('pageTitle ไม่จับคำนำหน้าที่ไม่ใช่ขอบเส้นทาง', () => {
  // '/searching' ไม่ใช่หน้าลูกของ '/search' — ถ้าใช้ startsWith เฉยๆ จะจับผิด
  expect(pageTitle('/searching')).toBe('Skouth')
})
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่าแดง**

รันบน Windows:

```
npx vitest run components/nav/navItems.test.ts
```

Expected: FAIL — `Failed to resolve import "./navItems"`

**ถ้าแดงด้วยเหตุผลอื่นที่เกี่ยวกับ `lucide-react`** (เช่น resolve ไม่ได้ หรือ `Unexpected token 'export'`) ให้หยุดแล้วรายงาน อย่าพยายามแก้ `vitest.config.ts` เอง — ทางแก้ที่ถูกคือย้าย `Icon` ออกจาก `navItems.ts` ไปเป็นตารางชื่อ→คอมโพเนนต์ใน `AppShell.tsx` แทน ซึ่งเป็นการเปลี่ยนโครงที่ต้องคุยกันก่อน

- [ ] **Step 3: เขียน navItems.ts**

สร้าง `components/nav/navItems.ts`:

```ts
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
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

```
npx vitest run components/nav/navItems.test.ts
```

Expected: PASS ทั้ง 11 เทสต์

- [ ] **Step 5: พิสูจน์ว่าเทสต์ middleware จับได้จริง**

แก้ `components/nav/navItems.ts` ชั่วคราว เปลี่ยนบรรทัด `/help` เป็น:

```ts
  { href: '/help', label: 'คู่มือ', Icon: HelpCircle, placement: 'topRight' },
```

(ลบ `requiresAuth: false` ออก) แล้วรัน:

```
npx vitest run components/nav/navItems.test.ts
```

Expected: FAIL 2 อัน — `ทุก href ที่ต้องล็อกอิน ถูกครอบด้วย matcher ของ middleware` และ `/help ต้องไม่ถูกครอบด้วย matcher`

**ถ้ายังเขียว แปลว่าเทสต์ไม่ได้ทดสอบอะไร ให้หยุดแล้วรายงาน** จากนั้นคืนค่าเดิม:

```
git checkout -- components/nav/navItems.ts
```

(ถ้ายังไม่ได้ commit ให้แก้กลับด้วยมือแทน)

- [ ] **Step 6: Commit**

```bash
git add components/nav/navItems.ts components/nav/navItems.test.ts
git commit -m "feat(nav): single source of nav items with icons and page titles"
```

---

## Task 2: CSS ของ shell

**Files:**
- Modify: `app/globals.css` (เพิ่มต่อท้าย ก่อนบล็อก `@media (max-width: 780px)` ที่มีอยู่)

**Interfaces:**
- Produces: คลาส `.shell` `.shell--collapsed` `.shell--drawer-open` `.sidebar` `.sidebar-head` `.sidebar-brand` `.sidebar-toggle` `.sidebar-link` `.sidebar-burger` `.sidebar-backdrop` `.content` `.topbar` `.topbar-title` `.topbar-actions` `.icon-btn` — Task 3 ใช้ชื่อเหล่านี้ตรงตัว

- [ ] **Step 1: เพิ่มคลาสใหม่**

แทรกใน `app/globals.css` **ก่อน** บรรทัด `@media (max-width: 780px) {` ที่มีอยู่แล้ว:

```css
.shell { display: grid; grid-template-columns: 208px 1fr; min-height: 100vh;
  transition: grid-template-columns 140ms ease; }
.shell--collapsed { grid-template-columns: 56px 1fr; }

.sidebar { position: sticky; top: 0; height: 100vh; overflow-y: auto; background: var(--surface);
  border-right: 1px solid var(--border); padding: 12px 8px; display: flex; flex-direction: column; gap: 2px; }
.sidebar-head { display: flex; align-items: center; gap: 8px; padding: 4px 4px 12px; }
.sidebar-brand { font-size: 15px; font-weight: 500; color: var(--accent); white-space: nowrap; }
.sidebar-brand:hover { text-decoration: none; }
.sidebar-toggle { margin-left: auto; border: none; background: none; cursor: pointer; padding: 4px;
  border-radius: 6px; color: var(--text-faint); display: inline-flex; }
.sidebar-toggle:hover { color: var(--text); background: #f3f4f6; }
.sidebar-link { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px;
  color: var(--text-faint); font-size: 14px; white-space: nowrap; overflow: hidden; }
.sidebar-link:hover { color: var(--accent-soft-text); background: var(--accent-soft); text-decoration: none; }

/* ซ่อนข้อความตอนหุบด้วย CSS ไม่ใช่เงื่อนไขใน JSX — บนจอแคบ sidebar กางเต็มความกว้าง
   เสมอแม้ผู้ใช้เคยกดหุบไว้บนจอกว้าง ถ้าตัดข้อความออกใน JSX ป้ายจะหายไปทั้งที่มีที่ให้แสดง */
.shell--collapsed .sidebar-brand,
.shell--collapsed .sidebar-link span { display: none; }

/* ตอนหุบเหลือความกว้างใช้งาน 40px (56 ลบ padding) วงกลม 28px กับปุ่มพับเรียงแนวนอน
   รวมกันเกิน จึงต้องวางซ้อนกันแทน ไม่งั้นปุ่มพับจะล้นออกนอก sidebar */
.shell--collapsed .sidebar-head { flex-direction: column; gap: 6px; padding: 4px 0 12px; }
.shell--collapsed .sidebar-toggle { margin-left: 0; }

.content { min-width: 0; display: flex; flex-direction: column; }
.topbar { position: sticky; top: 0; z-index: 40; display: flex; align-items: center; gap: 10px;
  background: var(--surface); border-bottom: 1px solid var(--border); padding: 10px 20px; }
.topbar-title { font-size: 14px; font-weight: 500; }
.topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.icon-btn { border: none; background: none; cursor: pointer; padding: 6px; border-radius: 8px;
  color: var(--text-faint); display: inline-flex; align-items: center; justify-content: center; }
.icon-btn:hover { color: var(--text); background: #f3f4f6; text-decoration: none; }

.sidebar-burger { display: none; }
.sidebar-backdrop { display: none; }
```

`min-width: 0` บน `.content` จำเป็น — grid item มี `min-width: auto` โดยปริยาย ตารางกว้างๆ ใน `/candidates` จะดัน column ให้ล้นออกนอกจอ

- [ ] **Step 2: เพิ่มกฎจอแคบ**

เพิ่ม **ข้างใน** บล็อก `@media (max-width: 780px)` ที่มีอยู่แล้ว ต่อจากกฎ `.guide-toc a`:

```css
  .shell, .shell--collapsed { grid-template-columns: 1fr; }
  .sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: 208px; height: auto; z-index: 60;
    transform: translateX(-100%); transition: transform 140ms ease; }
  .shell--drawer-open .sidebar { transform: translateX(0); }
  /* บนจอแคบมีแค่ "เปิด/ปิด drawer" ไม่มีสถานะหุบแบบไอคอนล้วน ปุ่มพับจึงไม่มีความหมาย */
  .sidebar-toggle { display: none; }
  .sidebar-burger { display: inline-flex; }
  .shell--collapsed .sidebar-brand,
  .shell--collapsed .sidebar-link span { display: inline; }
  .shell--collapsed .sidebar-head { flex-direction: row; gap: 8px; padding: 4px 4px 12px; }
  .shell--drawer-open .sidebar-backdrop { display: block; position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.42); z-index: 50; border: none; padding: 0; }
```

- [ ] **Step 3: ตรวจว่า CSS ยังถูกไวยากรณ์**

```
npx tsc --noEmit
```

Expected: ไม่มี error นอกไฟล์ `*.test.ts` (tsc ไม่อ่าน CSS แต่ step นี้ยืนยันว่ายังไม่มีอะไรพัง) — ตรวจ CSS จริงในภายหลังตอน `npm run build`

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style(nav): add shell, sidebar and topbar classes"
```

---

## Task 3: AppShell.tsx

**Files:**
- Create: `components/nav/AppShell.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS`, `sidebarItems`, `topRightItems`, `pageTitle` จาก Task 1 · คลาส CSS จาก Task 2
- Produces: `export default function AppShell(props: { isAdmin: boolean; isDataManager: boolean; children: React.ReactNode })`

- [ ] **Step 1: เขียนคอมโพเนนต์**

สร้าง `components/nav/AppShell.tsx`:

```tsx
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
```

- [ ] **Step 2: ตรวจชนิดข้อมูล**

```
npx tsc --noEmit
```

Expected: ไม่มี error ที่ชี้มาที่ `components/nav/AppShell.tsx` (กรองไฟล์เทสต์ออก: `| grep -v "\.test\.ts"` บน bash หรือ `| Select-String -NotMatch "\.test\.ts"` บน PowerShell)

- [ ] **Step 3: Commit**

```bash
git add components/nav/AppShell.tsx
git commit -m "feat(nav): AppShell with collapsible sidebar and mobile drawer"
```

---

## Task 4: เปลี่ยน layout มาใช้ AppShell แล้วลบ CSS ที่ตายแล้ว

**Files:**
- Modify: `app/(app)/layout.tsx` (แทนทั้งไฟล์)
- Modify: `app/globals.css:44-50` (ลบคลาส `.nav*`)

**Interfaces:**
- Consumes: `AppShell` จาก Task 3

- [ ] **Step 1: เขียน layout ใหม่**

แทนเนื้อหาทั้งไฟล์ `app/(app)/layout.tsx` ด้วย:

```tsx
import AppShell from '@/components/nav/AppShell'
import { getSession, hasRole } from '@/lib/auth/session'

// ยังเป็น server component — getSession() ต้องอ่าน cookie ฝั่งเซิร์ฟเวอร์
// ส่งเข้า AppShell แค่ boolean สองตัวซึ่ง serialize ข้าม boundary ได้
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  return (
    <AppShell
      isAdmin={!!session && hasRole(session.role, 'admin')}
      isDataManager={!!session && hasRole(session.role, 'data_manager')}
    >
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 2: ยืนยันว่าไม่มีที่ไหนใช้คลาส .nav* แล้ว**

```
git grep -n "nav-link\|nav-brand\|nav-right\|className=\"nav\"" -- "*.tsx"
```

Expected: ไม่มีผลลัพธ์เลย

**ถ้ามีผลลัพธ์โผล่มา ให้หยุดแล้วรายงาน** — แปลว่ามีไฟล์ที่แผนนี้ไม่ได้นับไว้ (`.pub-nav*` เป็นคนละชื่อและไม่เข้าเงื่อนไขข้างบน จึงต้องไม่โผล่)

- [ ] **Step 3: ลบคลาสที่ตายแล้ว**

ลบห้าบรรทัดนี้ออกจาก `app/globals.css` (อยู่ราวบรรทัด 44-50):

```css
.nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 20px; background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; }
.nav-brand { font-size: 16px; font-weight: 500; color: var(--accent); }
.nav-brand:hover { text-decoration: none; }
.nav-link { color: var(--text-faint); font-size: 14px; }
.nav-link:hover { color: var(--text); text-decoration: none; }
.nav-link.active { color: var(--text); font-weight: 500; }
.nav-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
```

**ห้ามลบ `.nav-avatar`** — บรรทัดถัดไป และ Task 3 เพิ่งเริ่มใช้มันเป็นวงกลม "S"

- [ ] **Step 4: ยืนยันว่า .nav-avatar ยังอยู่**

```
git grep -n "nav-avatar" -- app/globals.css components/nav/AppShell.tsx
```

Expected: สองบรรทัด — นิยามใน `globals.css` และการใช้งานใน `AppShell.tsx`

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" app/globals.css
git commit -m "refactor(nav): switch app layout to AppShell, drop dead top-nav CSS"
```

---

## Task 5: ตรวจงานทั้งหมด

**Files:** ไม่แก้ไฟล์ (ถ้าพบปัญหาให้กลับไปแก้ task ที่เกี่ยว)

- [ ] **Step 1: เทสต์ทั้งชุด**

```
npm test
```

Expected: เขียวทั้งหมด รวม 11 เทสต์ใหม่ใน `components/nav/navItems.test.ts`

- [ ] **Step 2: Build**

```
npm run build
```

Expected: สำเร็จ ไม่มี error

Build เป็นด่านที่สำคัญที่สุดใน task นี้ — เป็นที่เดียวที่จะจับได้ว่า `'use client'` boundary ถูกต้อง และ `lucide-react` bundle ได้จริง

- [ ] **Step 3: ตรวจด้วยตาบนจอกว้าง**

```
npm run dev
```

เปิด `http://localhost:3000/candidates` แล้วตรวจทีละข้อ:

1. sidebar อยู่ซ้าย มีไอคอนนำหน้าทุกรายการ
2. แถบบนซ้ายขึ้นคำว่า "ข้อมูล"
3. กดปุ่มพับ → sidebar แคบลงเหลือแต่ไอคอน เนื้อหาขยายตาม
4. กดกางกลับ → ข้อความกลับมา
5. มุมขวาบนมี `?` กับเฟือง
6. กด `?` → เปิดแท็บใหม่ไปหน้าคู่มือ แท็บเดิมยังอยู่ที่ `/candidates`
7. กดเฟือง → ไปหน้า `/settings` แถบบนขึ้นว่า "ตั้งค่า"
8. เปิดผู้สมัครสักคน (`/candidates/<id>`) → แถบบนยังขึ้นว่า "ข้อมูล"
9. ตารางใน `/candidates` ไม่ล้นออกนอกจอ

- [ ] **Step 4: ตรวจด้วยตาบนจอแคบ**

ย่อหน้าต่างให้แคบกว่า 780px (หรือใช้ device toolbar ของ devtools):

1. sidebar หายไป เนื้อหากินเต็มความกว้าง
2. แถบบนซ้ายมีปุ่มแฮมเบอร์เกอร์ ตามด้วยชื่อหน้า
3. กดแฮมเบอร์เกอร์ → sidebar เลื่อนเข้ามาทับ พร้อมฉากหลังมืด **และเห็นชื่อเมนูครบ**
4. กดฉากหลัง → ปิด
5. เปิดใหม่แล้วกด Esc → ปิด
6. เปิดใหม่แล้วกดลิงก์ในเมนู → **ไปหน้าใหม่และ drawer ปิดเอง**
7. ปุ่มพับไม่โผล่บนจอแคบ

ข้อ 3 และ 6 คือสองข้อที่พังง่ายที่สุด — ข้อ 3 พังถ้าซ่อนข้อความด้วยเงื่อนไขใน JSX แทน CSS ข้อ 6 พังถ้าลืม `useEffect` ที่ผูกกับ `pathname`

- [ ] **Step 5: ตรวจว่าหน้าสาธารณะไม่ถูกกระทบ**

เปิด `http://localhost:3000/` และ `http://localhost:3000/help` — ต้องยังเป็นแถบบนแบบเดิม ไม่มี sidebar

```
git diff eaa3f92..HEAD --stat -- "app/(public)"
```

`eaa3f92` คือ commit ของ spec ซึ่งเป็นจุดตั้งต้นของงานนี้

Expected: ไม่มีผลลัพธ์ (ไฟล์ในกลุ่ม public ไม่ถูกแตะเลย)

- [ ] **Step 6: อัปเดต CLAUDE.md**

เพิ่มใต้หัวข้อ `### Phase 5 — UI redesign` ใน `CLAUDE.md`:

```markdown
- [x] **แถบเมนูของกลุ่ม `(app)` เป็น sidebar ซ้ายที่พับได้** (`components/nav/`)
      รายการเมนูทั้งหมดอยู่ที่ `navItems.ts` ที่เดียว ทั้ง sidebar ปุ่มมุมขวาบน และ
      ชื่อหน้าบนแถบบนอ่านจากที่นั่น **`pageTitle` ต้องเลือกคำนำหน้าที่ยาวที่สุด**
      ไม่ใช่อันแรกที่เจอ ไม่งั้นคำตอบจะขึ้นกับลำดับในอาร์เรย์โดยไม่มีใครรู้
      **`navItems.test.ts` เทียบกับ `matcher` ของ `middleware.ts` สองทิศ** — ทุก href
      ที่ต้องล็อกอินต้องอยู่ใน matcher (ลืมใส่ = หน้านั้นเปิดได้โดยไม่ล็อกอินแบบเงียบๆ)
      และ `/help` ต้องไม่อยู่ใน matcher (ใส่เข้าไป = คนที่ยังไม่ล็อกอินอ่านคู่มือไม่ได้)
      **บนจอแคบ drawer ต้องปิดเองเมื่อเปลี่ยนหน้า** — layout ของ Next.js อยู่ข้าม
      การเปลี่ยนหน้า state จึงไม่ถูกล้าง ไม่มี `useEffect` นี้แล้ว drawer จะค้างทับ
      **ข้อความในเมนูซ่อนด้วย CSS ไม่ใช่เงื่อนไขใน JSX** — บนจอแคบ sidebar กางเต็ม
      เสมอแม้ผู้ใช้เคยกดหุบบนจอกว้าง ตัดใน JSX แล้วป้ายจะหายทั้งที่มีที่ให้แสดง
      ไม่ทำไฮไลต์เมนูหน้าปัจจุบัน (ตัดสินใจแล้ว) และไม่จำสถานะพับ/กาง
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record sidebar nav decisions and traps"
```

---

## Self-Review

**ความครอบคลุมของ spec**

| หัวข้อใน spec | task ที่ทำ |
|---|---|
| `navItems.ts` แหล่งเดียว | Task 1 |
| ตารางรายการเมนู 10 รายการ | Task 1 Step 3 |
| `/help` เปิดแท็บใหม่ | Task 3 Step 1 |
| โครง `.shell` / `.sidebar` / `.topbar` | Task 2 |
| ใช้ `.nav-avatar` ที่เคยตายเป็นวงกลม "S" | Task 3 Step 1, ตรวจที่ Task 4 Step 4 |
| ชื่อหน้าจากคำนำหน้าที่ยาวที่สุด | Task 1 Step 3, เทสต์ครอบ |
| จอแคบ = overlay + ฉากหลัง + Esc + ปิดเมื่อเปลี่ยนหน้า | Task 2 Step 2, Task 3 Step 1, ตรวจที่ Task 5 Step 4 |
| เทสต์ 5 กลุ่ม | Task 1 Step 1 |
| ลบ `.nav*` เก็บ `.nav-avatar` | Task 4 Step 3-4 |
| ไม่แตะกลุ่ม `(public)` | ตรวจที่ Task 5 Step 5 |
| ไม่ไฮไลต์ / ไม่จำสถานะ / ไม่ focus trap | Global Constraints |

ไม่มีหัวข้อไหนใน spec ที่ไม่มี task รองรับ

**สแกน placeholder:** ไม่มี TBD / TODO / "similar to Task N" / step ที่บอกว่าให้ทำอะไรโดยไม่มีโค้ด

**ความสอดคล้องของชนิดข้อมูลและชื่อ:** `sidebarItems` / `topRightItems` / `pageTitle` / `NAV_ITEMS` / `NavItem` ใช้ชื่อเดียวกันทั้ง Task 1 (นิยาม), Task 1 Step 1 (เทสต์), Task 3 (ใช้งาน) · ชื่อคลาส CSS ใน Task 2 ตรงกับที่ Task 3 อ้างทุกตัว (`shell` `shell--collapsed` `shell--drawer-open` `sidebar` `sidebar-head` `sidebar-brand` `sidebar-toggle` `sidebar-link` `sidebar-backdrop` `sidebar-burger` `content` `topbar` `topbar-title` `topbar-actions` `icon-btn` `nav-avatar`) · prop ของ `AppShell` คือ `isAdmin` / `isDataManager` / `children` ตรงกันระหว่าง Task 3 และ Task 4

**หมายเหตุเรื่องเทสต์:** Task 2 และ 3 ไม่มี unit test เพราะ repo นี้ตั้ง `environment: 'node'` และไม่มี jsdom หรือ React testing library ติดตั้งอยู่ การเพิ่มเข้ามาเพื่องานนี้เป็นการขยายขอบเขตที่ไม่ได้ตกลงกัน จึงพึ่ง `npm run build` กับการตรวจด้วยตาใน Task 5 แทน และเขียนรายการตรวจไว้ให้ชัดว่าต้องดูอะไรบ้าง
