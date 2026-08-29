# Public Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มหน้าแนะนำฟีเจอร์ที่ `/` และหน้าคู่มือ/UAT ที่ `/help` ซึ่งเปิดสาธารณะทั้งคู่ พร้อมไฟล์ PDF ให้ดาวน์โหลด

**Architecture:** สร้าง route group `(public)` ใหม่คู่กับ `(app)` และ `(auth)` ที่มีอยู่ หน้าทั้งสองเป็น server component ที่เรนเดอร์ JSX นิ่ง ไม่แตะฐานข้อมูลและไม่เรียก Gemini ไฟล์ PDF เป็นไฟล์นิ่งใน `public/` ที่ Next.js เสิร์ฟตรงจาก CDN ค่าคงที่ทั้งหมด (อีเมลติดต่อ เวอร์ชันเอกสาร ปุ่มหลัก) แยกไว้ใน `lib/` เพื่อให้แก้จุดเดียว

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest · CSS ที่มีอยู่ใน `app/globals.css`

**Spec:** `docs/superpowers/specs/2026-08-29-public-pages-design.md`

## Global Constraints

- ภาษาบนหน้าเว็บและในเอกสารเป็น **ภาษาไทยเท่านั้น** (โค้ดและชื่อตัวแปรเป็นอังกฤษตามเดิม)
- **ห้ามแก้ `middleware.ts`** — `matcher` เป็นรายการเจาะจงที่ไม่ครอบ `/` และ `/help` อยู่แล้ว
- **ห้ามสร้าง migration** งานนี้ไม่แตะฐานข้อมูลเลย
- **ห้ามวางไฟล์ `.test.ts` ใน `public/`** — Next.js เสิร์ฟทุกอย่างในนั้นเป็นไฟล์สาธารณะ
- ใช้คลาสและ CSS variable ที่มีอยู่ใน `app/globals.css` ก่อนเสมอ เพิ่มคลาสใหม่เฉพาะที่จำเป็น
- เทสต์ทั้งหมดในแผนนี้เป็น **unit** ไม่แตะเครือข่าย ต้องอยู่ในชุด `npm test` ที่ต้องเขียวเสมอ (ห้ามตั้งชื่อ `*.int.test.ts`)
- คำสั่งรันเทสต์คือ `npx vitest run <path>` และรันบน Windows เท่านั้น (sandbox รัน vitest ไม่ได้เพราะ node_modules เป็นของ Windows)

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `lib/public/cta.ts` | ข้อความและปลายทางของปุ่มหลักบนหน้าแรก — จะเปลี่ยนเมื่องานจำกัดโดเมนเสร็จ |
| `lib/help/contact.ts` | อีเมลกลางองค์กร |
| `lib/help/docMeta.ts` | เวอร์ชันและวันที่ของเอกสาร UAT |
| `lib/help/docAssets.test.ts` | ตรวจว่าไฟล์ PDF มีจริง และอีเมลไม่ใช่ placeholder |
| `app/(public)/layout.tsx` | nav เบาสำหรับหน้าสาธารณะ |
| `app/(public)/page.tsx` | หน้าแนะนำฟีเจอร์ |
| `app/(public)/help/page.tsx` | ประกอบส่วนต่างๆ ของหน้าคู่มือ |
| `components/help/UserGuide.tsx` | เนื้อหาคู่มือการใช้งาน |
| `components/help/UatTable.tsx` | ตารางทดสอบการยอมรับ |
| `docs/uat/skouth-uat.md` | ต้นฉบับเนื้อหาสำหรับแปลงเป็น PDF |
| `public/skouth-uat.pdf` | ไฟล์ที่ผู้ใช้ดาวน์โหลด สร้างบน Windows |
| `docs/manual-tests/public-pages.md` | ขั้นตอนตรวจด้วยตา |

แยก `UserGuide` กับ `UatTable` ออกจากหน้าเพราะเป็นเนื้อหาคนละชนิดที่จะถูกแก้คนละจังหวะ และทำให้ `help/page.tsx` เหลือหน้าที่เดียวคือประกอบร่าง

---

### Task 1: ค่าคงที่และเทสต์ที่กันการ deploy ผิด

**Files:**
- Create: `lib/public/cta.ts`
- Create: `lib/help/contact.ts`
- Create: `lib/help/docMeta.ts`
- Test: `lib/help/docAssets.test.ts`

**Interfaces:**
- Consumes: ไม่มี (งานแรก)
- Produces: `PRIMARY_CTA: { label: string; href: string }` · `CONTACT_EMAIL: string` · `CONTACT_IS_PLACEHOLDER: boolean` · `UAT_DOC: { version: string; updatedAt: string; path: string }`

- [ ] **Step 1: เขียนเทสต์ที่ยังไม่ผ่าน**

สร้าง `lib/help/docAssets.test.ts`

```ts
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CONTACT_EMAIL, CONTACT_IS_PLACEHOLDER } from './contact'
import { UAT_DOC } from './docMeta'

// เทสต์สองข้อนี้ดักความล้มเหลวที่มองไม่เห็นบนเครื่องตัวเอง แต่พังบนโปรดักชัน
test('ไฟล์ PDF ที่ปุ่มดาวน์โหลดชี้ไป มีอยู่จริงและไม่ว่าง', () => {
  // ลืม commit ไฟล์ = ปุ่มดาวน์โหลด 404 บนโปรดักชัน ทั้งที่บนเครื่องตัวเองยังเปิดได้
  const abs = join(process.cwd(), 'public', UAT_DOC.path.replace(/^\//, ''))
  expect(existsSync(abs)).toBe(true)
  expect(statSync(abs).size).toBeGreaterThan(0)
})

test('อีเมลติดต่อไม่ใช่ค่า placeholder', () => {
  // ดักการ deploy ทั้งที่ยังไม่ได้ใส่อีเมลจริง ซึ่งทำให้หน้า help บอกช่องทางที่ไม่มีอยู่
  expect(CONTACT_IS_PLACEHOLDER).toBe(false)
  expect(CONTACT_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
})
```

- [ ] **Step 2: รันเทสต์เพื่อยืนยันว่าตก**

Run: `npx vitest run lib/help/docAssets.test.ts`
Expected: FAIL — `Cannot find module './contact'`

- [ ] **Step 3: เขียนค่าคงที่**

สร้าง `lib/public/cta.ts`

```ts
// ปุ่มหลักบนหน้าแรก เก็บไว้จุดเดียวเพราะจะเปลี่ยนแน่นอนเมื่องานจำกัดโดเมนอีเมลเสร็จ
// (ดูหัวข้อ "งานถัดไป" ในสเปค) ตอนนั้นจะกลายเป็น
// { label: 'สมัครด้วยอีเมลองค์กร', href: '/signup' }
//
// ตอนนี้ยังไม่ชวนสมัคร เพราะ /signup เปิดให้ใครก็ได้ และระบบเก็บข้อมูลส่วนบุคคลจริง
export const PRIMARY_CTA = {
  label: 'ดูคู่มือและติดต่อเรา',
  href: '/help',
} as const
```

สร้าง `lib/help/contact.ts`

```ts
// อีเมลกลางขององค์กร — เปลี่ยนที่นี่ที่เดียว
//
// ตั้งค่านี้ให้เป็นอีเมลจริงก่อน deploy มิฉะนั้น docAssets.test.ts จะตก
// ซึ่งเป็นเจตนา: หน้า help ที่บอกช่องทางติดต่อที่ไม่มีอยู่จริงแย่กว่าไม่มีหน้า help
const PLACEHOLDER = 'contact@example.com'

export const CONTACT_EMAIL = PLACEHOLDER
export const CONTACT_IS_PLACEHOLDER = CONTACT_EMAIL === PLACEHOLDER
```

สร้าง `lib/help/docMeta.ts`

```ts
// เวอร์ชันและวันที่ของเอกสาร UAT
//
// แสดงบนหน้าเว็บข้างปุ่มดาวน์โหลด และต้องพิมพ์ตรงกันบนหน้าปก PDF
// หน้าเว็บกับ PDF เป็นเนื้อหาสองชุดที่ดูแลแยกกันโดยตั้งใจ การประทับเวอร์ชัน
// คือสิ่งเดียวที่ทำให้ความไม่ตรงกันมองเห็นได้แทนที่จะเงียบ
//
// แก้เนื้อหาเอกสารเมื่อไร ให้ขยับ version และ updatedAt ที่นี่ทุกครั้ง
export const UAT_DOC = {
  version: '1.0',
  updatedAt: '2026-08-29',
  path: '/skouth-uat.pdf',
} as const
```

- [ ] **Step 4: รันเทสต์ — ยังตกอยู่ และนั่นคือสิ่งที่ถูกต้อง**

Run: `npx vitest run lib/help/docAssets.test.ts`
Expected: FAIL ทั้งสองข้อ — ไฟล์ PDF ยังไม่มี (สร้างใน Task 6) และอีเมลยังเป็น placeholder

**อย่าแก้เทสต์ให้ผ่าน** เทสต์ทั้งสองข้อนี้คือรายการงานที่ยังทำไม่เสร็จ Task 6 จะทำให้ข้อแรกผ่าน ส่วนข้อที่สองผ่านเมื่อเจ้าของงานให้อีเมลจริง

- [ ] **Step 5: Commit**

```bash
git add lib/public/cta.ts lib/help/contact.ts lib/help/docMeta.ts lib/help/docAssets.test.ts
git commit -m "feat(public): add CTA, contact, and UAT doc constants"
```

---

### Task 2: route group สาธารณะ และหน้าแนะนำฟีเจอร์

**Files:**
- Create: `app/(public)/layout.tsx`
- Create: `app/(public)/page.tsx`
- Delete: `app/page.tsx`
- Modify: `app/globals.css` (ต่อท้ายไฟล์)

**Interfaces:**
- Consumes: `PRIMARY_CTA` จาก `lib/public/cta.ts` (Task 1)
- Produces: เส้นทาง `/` และ layout ที่ `/help` จะใช้ร่วมใน Task 3

- [ ] **Step 1: เพิ่มคลาสสำหรับหน้าสาธารณะ**

ต่อท้าย `app/globals.css`

```css
.pub-nav { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 18px;
  padding: 12px 24px; background: var(--surface); border-bottom: 1px solid var(--border); }
.pub-nav-brand { font-weight: 500; font-size: 17px; color: var(--text); text-decoration: none; }
.pub-nav-link { font-size: 14px; color: var(--text-muted); text-decoration: none; }
.pub-nav-link:hover { color: var(--text); }
.pub-nav-right { margin-left: auto; display: flex; gap: 10px; align-items: center; }

.pub-wrap { max-width: 960px; margin: 0 auto; padding: 0 24px 64px; }
.pub-hero { text-align: center; padding: 64px 0 48px; }
.pub-hero h1 { font-size: 34px; line-height: 1.3; margin: 0 0 12px; }
.pub-hero p { font-size: 16px; color: var(--text-muted); margin: 0 0 28px; }
.pub-fakebar { max-width: 520px; margin: 0 auto 28px; display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; text-align: left; background: var(--surface);
  border: 1px solid var(--accent); border-radius: var(--radius-card); }

.pub-section { padding: 40px 0; border-top: 1px solid var(--border); }
.pub-section h2 { font-size: 22px; margin: 0 0 20px; }
.pub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.pub-card { background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-card); padding: 18px 20px; }
.pub-card h3 { font-size: 16px; margin: 0 0 6px; }
.pub-card p { font-size: 14px; color: var(--text-muted); margin: 0; }
.pub-note { background: var(--success-bg); border: 1px solid var(--ok);
  border-radius: var(--radius-card); padding: 18px 20px; }
.pub-footer { padding: 28px 0; border-top: 1px solid var(--border);
  font-size: 13px; color: var(--text-faint); }
```

- [ ] **Step 2: สร้าง layout สาธารณะ**

สร้าง `app/(public)/layout.tsx`

```tsx
import Link from 'next/link'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

// nav เบาสำหรับหน้าที่คนยังไม่ล็อกอินก็เข้าได้
// ปุ่มขวาสลับตาม session เพราะเจ้าของระบบต้องดูหน้าแนะนำของตัวเองได้โดยไม่ต้องออกจากระบบ
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()

  return (
    <div>
      <nav className="pub-nav">
        <Link href="/" className="pub-nav-brand">Skouth</Link>
        <Link href="/#features" className="pub-nav-link">ฟีเจอร์</Link>
        <Link href="/help" className="pub-nav-link">คู่มือ</Link>
        <div className="pub-nav-right">
          {session ? (
            <Link href="/dashboard" className="btn btn-primary">ไปที่ Dashboard</Link>
          ) : (
            <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
          )}
        </div>
      </nav>
      <div className="pub-wrap">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: ลบหน้าเดิมและสร้างหน้าแนะนำฟีเจอร์**

ลบ `app/page.tsx` แล้วสร้าง `app/(public)/page.tsx`

```tsx
import Link from 'next/link'
import { PRIMARY_CTA } from '@/lib/public/cta'

export const metadata = {
  title: 'Skouth — ค้นหาคนไทยที่จบจากต่างประเทศ',
  description: 'ค้นหาและประเมินผู้สมัครด้วยภาษาธรรมชาติและ AI',
}

const FEATURES = [
  {
    title: 'ค้นหาด้วยภาษาธรรมชาติ',
    body: 'พิมพ์สิ่งที่ต้องการเป็นประโยคภาษาไทย ระบบแปลงเป็นเงื่อนไขแล้วจัดอันดับด้วยความหมาย ไม่ใช่การจับคำตรงตัว',
  },
  {
    title: 'คะแนนพร้อมเหตุผล',
    body: 'ให้คะแนนความเหมาะสม 0–100 พร้อมคำอธิบายเป็นภาษาไทยว่าทำไมถึงได้คะแนนเท่านั้น',
  },
  {
    title: 'จับคู่กับตำแหน่งงาน',
    body: 'สร้างตำแหน่งงานแล้วให้ระบบเรียงผู้สมัครที่เหมาะที่สุดให้ โดยไม่ต้องค้นหาใหม่ทีละครั้ง',
  },
  {
    title: 'อัปเดตข้อมูลอัตโนมัติ',
    body: 'ดึงโปรไฟล์ใหม่ทุกคืน คัดกรองอัตโนมัติ และให้คนตรวจอนุมัติก่อนเข้าฐานข้อมูลจริง',
  },
]

const PAINS = [
  'คนเก่งที่จบจากต่างประเทศกระจายอยู่หลายแพลตฟอร์ม ไม่มีที่รวม',
  'การค้นด้วยคีย์เวิร์ดพลาดคนที่ใช่ เพราะคนเขียนโปรไฟล์ด้วยคำที่ต่างกัน',
  'อ่านโปรไฟล์ทีละคนเพื่อคัดกรองไม่ไหวเมื่อผู้สมัครมีหลักร้อย',
]

export default function LandingPage() {
  return (
    <main>
      <section className="pub-hero">
        <h1>หาคนไทยที่จบจากต่างประเทศ ด้วยประโยคเดียว</h1>
        <p>พิมพ์สิ่งที่ต้องการเป็นภาษาไทย ระบบเข้าใจและจัดอันดับผู้สมัครให้</p>

        {/* ภาพนิ่ง ไม่ใช่ input ที่กดได้ — กดแล้วต้องล็อกอินอยู่ดี
            แถบนี้อธิบายผลิตภัณฑ์ได้ในบรรทัดเดียวโดยไม่ต้องบรรยาย */}
        <div className="pub-fakebar" aria-hidden="true">
          <span className="faint">ค้นหา</span>
          <span>หา Data Scientist จบปริญญาโทจากอเมริกา ประสบการณ์ 5 ปีขึ้นไป</span>
        </div>

        <Link href={PRIMARY_CTA.href} className="btn btn-primary">{PRIMARY_CTA.label}</Link>
      </section>

      <section className="pub-section">
        <h2>ทำไมการหาคนกลุ่มนี้ถึงยาก</h2>
        <div className="pub-grid">
          {PAINS.map((p) => (
            <div key={p} className="pub-card"><p>{p}</p></div>
          ))}
        </div>
      </section>

      <section className="pub-section" id="features">
        <h2>ระบบทำอะไรได้บ้าง</h2>
        <div className="pub-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="pub-card">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pub-section">
        <h2>ออกแบบมาให้เคารพ PDPA</h2>
        <div className="pub-note">
          <p style={{ margin: 0, fontSize: 14 }}>
            เมื่อเจ้าของข้อมูลขอให้ลบ ระบบบันทึกไว้ถาวรและไม่นำเข้าคนนั้นอีก แม้รอบเก็บข้อมูล
            ครั้งถัดไปจะเจอโปรไฟล์เดิม · ทุกการเพิ่ม แก้ไข และลบถูกบันทึกว่าใครทำเมื่อไร ·
            ข้อมูลที่ผู้ใช้อัปโหลดเองเพื่อประเมินตัวเองเก็บแยกคนละตาราง เข้าไม่ถึงการค้นหาของผู้สรรหา
          </p>
        </div>
      </section>

      <footer className="pub-footer">Skouth · ระบบสรรหาและประเมินผู้สมัคร</footer>
    </main>
  )
}
```

- [ ] **Step 4: ตรวจว่า build ผ่านและหน้าแสดงได้**

Run: `npm run build`
Expected: build สำเร็จ ไม่มี error เรื่อง route ซ้ำ (ถ้าลืมลบ `app/page.tsx` จะขึ้น error ว่ามีสองหน้าชนกันที่ `/`)

Run: `npm run dev` แล้วเปิด `http://localhost:3000/`
Expected: เห็นหน้าแนะนำ · ล็อกอินอยู่แล้วปุ่มขวาบนเป็น "ไปที่ Dashboard" · ไม่ถูกเด้งไป `/dashboard`

- [ ] **Step 5: Commit**

```bash
git add "app/(public)/layout.tsx" "app/(public)/page.tsx" app/globals.css
git rm app/page.tsx
git commit -m "feat(public): add landing page in a public route group"
```

---

### Task 3: เนื้อหาคู่มือการใช้งาน

**Files:**
- Create: `components/help/UserGuide.tsx`
- Create: `app/(public)/help/page.tsx`

**Interfaces:**
- Consumes: `UAT_DOC` จาก `lib/help/docMeta.ts` · `CONTACT_EMAIL` จาก `lib/help/contact.ts` (Task 1)
- Produces: `<UserGuide />` ที่ `help/page.tsx` ประกอบ · เส้นทาง `/help`

- [ ] **Step 1: สร้างคอมโพเนนต์คู่มือ**

สร้าง `components/help/UserGuide.tsx`

```tsx
// คู่มือการใช้งาน เรียงตามหน้าจริงในระบบ
//
// เนื้อหานี้ดูแลแยกจากไฟล์ PDF โดยตั้งใจ (ดูสเปค) แก้ที่นี่แล้วต้องแก้
// docs/uat/skouth-uat.md แล้วสร้าง PDF ใหม่ พร้อมขยับเวอร์ชันใน lib/help/docMeta.ts
const SECTIONS = [
  {
    id: 'login',
    title: 'เข้าสู่ระบบและสมัครสมาชิก',
    steps: [
      'เปิดหน้าแรกแล้วกด "เข้าสู่ระบบ" ที่มุมขวาบน',
      'ผู้ใช้ใหม่กด "สมัครสมาชิก" กรอกอีเมลและรหัสผ่าน ระบบจะส่งลิงก์ยืนยันไปที่อีเมล',
      'กดลิงก์ในอีเมลแล้วระบบจะพาเข้าสู่ Dashboard ให้อัตโนมัติ ไม่ต้องล็อกอินซ้ำ',
      'ลืมรหัสผ่านให้กด "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    steps: [
      'แสดงจำนวนผู้สมัครทั้งหมด ยอดเปลี่ยนแปลงใน 30 วัน และจำนวนตำแหน่งงานที่เปิด',
      'ยอดเปลี่ยนแปลงเป็นสุทธิ — เขียวมีเครื่องหมายบวกคือเพิ่มขึ้น แดงมีเครื่องหมายลบคือลดลง',
      'ส่วน Shortlist แสดงเฉพาะรายการของคุณเอง',
      'ส่วน "เพิ่งดูล่าสุด" และ "กิจกรรมของคุณ" แสดงเฉพาะสิ่งที่คุณทำ ไม่ใช่ของทั้งระบบ',
    ],
  },
  {
    id: 'search',
    title: 'ค้นหาผู้สมัคร',
    steps: [
      'พิมพ์สิ่งที่ต้องการเป็นประโยคภาษาไทย เช่น "หา Data Scientist จบโทอเมริกา ประสบการณ์ 5 ปีขึ้นไป"',
      'กด Enter หรือปุ่มค้นหา',
      'ระบบแยกประโยคเป็นเงื่อนไขแล้วแสดงเป็นชิปด้านบน กดชิปเพื่อปิดเงื่อนไขนั้นได้',
      'ผลลัพธ์เรียงตามความใกล้เคียงเชิงความหมาย คะแนนเป็นตัวเลข 0–100',
      'กดชื่อผู้สมัครเพื่อดูรายละเอียดเต็ม',
    ],
  },
  {
    id: 'candidate',
    title: 'หน้าผู้สมัคร',
    steps: [
      'ส่วนบนแสดงชื่อ ตำแหน่งย่อ สถานที่ และลิงก์ไปโปรไฟล์ LinkedIn ถ้ามี',
      'ไทม์ไลน์แสดงประวัติการศึกษาและการทำงานเรียงตามเวลา',
      'ส่วน "วิเคราะห์" ให้พิมพ์ความต้องการแล้วกดวิเคราะห์ ระบบให้คะแนนพร้อมเหตุผลภาษาไทย',
      'ผลวิเคราะห์ถูกเก็บไว้ ถ้าถามด้วยข้อความเดิมอีกครั้งจะได้ผลเดิมทันทีโดยไม่เรียก AI ซ้ำ',
      'ส่วน "เพิ่มเข้า Shortlist" เลือกรายการที่มีอยู่หรือสร้างใหม่ได้ในที่เดียว',
    ],
  },
  {
    id: 'shortlist',
    title: 'Shortlist',
    steps: [
      'Shortlist เป็นของส่วนตัว คนอื่นมองไม่เห็นรายการของคุณ',
      'สร้างรายการใหม่ได้จากหน้า Shortlist หรือจากหน้าผู้สมัครโดยตรง',
      'เอาผู้สมัครออกจากรายการได้จากหน้า Shortlist',
    ],
  },
  {
    id: 'jobs',
    title: 'ตำแหน่งงาน',
    steps: [
      'กด "สร้างตำแหน่งงาน" แล้วกรอกชื่อตำแหน่ง คำอธิบาย ทักษะที่ต้องการ และประสบการณ์ขั้นต่ำ',
      'เปิดตำแหน่งงานที่สร้างแล้วจะเห็นรายชื่อผู้สมัครที่เหมาะที่สุดเรียงให้อัตโนมัติ',
      'การจัดอันดับนี้ไม่เรียก AI จึงเร็วและไม่มีค่าใช้จ่าย',
      'กด "วิเคราะห์เชิงลึก" ที่ผู้สมัครรายคนเมื่อต้องการคะแนนพร้อมเหตุผล',
    ],
  },
  {
    id: 'self',
    title: 'ประเมินตัวเอง',
    steps: [
      'อัปโหลดไฟล์เรซูเม่ของตัวเองเป็น PDF',
      'ระบบอ่านไฟล์แล้วสรุปข้อมูลออกมาให้ตรวจ',
      'ระบบจัดอันดับตำแหน่งงานในระบบที่เหมาะกับคุณที่สุด',
      'ข้อมูลส่วนนี้เก็บแยกจากฐานผู้สมัคร ผู้สรรหาค้นหาไม่เจอ',
    ],
  },
  {
    id: 'data',
    title: 'จัดการข้อมูล (เฉพาะ data manager ขึ้นไป)',
    steps: [
      'หน้า "ข้อมูล" แสดงผู้สมัครทั้งหมดในตาราง เรียง ค้นหา และแบ่งหน้าได้',
      'ปุ่ม "แสดงเฉพาะที่มีปัญหา" กรองเฉพาะแถวที่ข้อมูลไม่ครบหรือชื่อซ้ำ',
      'ติ๊กเลือกหลายแถวแล้วกด "ลบที่เลือก" เพื่อลบเป็นกลุ่ม',
      'กล่องยืนยันจะเตือนถ้ามีคนที่มาจากการนำเข้าอัตโนมัติ เพราะลบเฉยๆ แล้วรอบถัดไปจะกลับมา',
      'ติ๊ก "ห้ามนำเข้าอีก" เมื่อต้องการกันไม่ให้กลับมา',
      'ส่วน "บันทึกกิจกรรม" ท้ายหน้าแสดงการเปลี่ยนแปลงของทุกคนในระบบ',
      'หน้า "Import" ใช้วางไฟล์ CSV เอง และดูคิวรอตรวจกับรายชื่อที่ถูกระงับ',
    ],
  },
  {
    id: 'settings',
    title: 'ตั้งค่า',
    steps: [
      'เปลี่ยนชื่อที่แสดงและรหัสผ่านได้ที่หน้าตั้งค่า',
      'การเปลี่ยนรหัสผ่านต้องกรอกรหัสผ่านเดิมเพื่อยืนยันตัวตนก่อน',
    ],
  },
]

export default function UserGuide() {
  return (
    <section className="pub-section" id="guide">
      <h2>คู่มือการใช้งาน</h2>
      {SECTIONS.map((s) => (
        <div key={s.id} id={s.id} style={{ marginBottom: 26 }}>
          <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{s.title}</h3>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
```

- [ ] **Step 2: สร้างหน้า `/help` ที่ประกอบร่าง**

สร้าง `app/(public)/help/page.tsx`

```tsx
import UserGuide from '@/components/help/UserGuide'
import { UAT_DOC } from '@/lib/help/docMeta'
import { CONTACT_EMAIL } from '@/lib/help/contact'

export const metadata = {
  title: 'คู่มือการใช้งาน — Skouth',
  description: 'คู่มือผู้ใช้และเอกสารทดสอบการยอมรับระบบ Skouth',
}

export default function HelpPage() {
  return (
    <main>
      <section className="pub-hero" style={{ padding: '48px 0 24px' }}>
        <h1 style={{ fontSize: 28 }}>คู่มือการใช้งาน</h1>
        <p>อ่านบนหน้านี้ได้เลย หรือดาวน์โหลดเป็นไฟล์ PDF ไปใช้</p>
      </section>

      <section className="pub-card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0 }}>เอกสารคู่มือและแบบทดสอบการยอมรับ</h3>
          <p style={{ margin: '4px 0 0' }}>
            เวอร์ชัน {UAT_DOC.version} · ปรับปรุง {UAT_DOC.updatedAt}
          </p>
        </div>
        {/* ไม่ฝัง iframe PDF — บนมือถือหลายตัวแสดงไม่ได้หรือดาวน์โหลดทับ
            และเนื้อหาซ้ำกับที่อยู่บนหน้านี้อยู่แล้ว */}
        <a href={UAT_DOC.path} download className="btn btn-primary">ดาวน์โหลด PDF</a>
        <a href={UAT_DOC.path} target="_blank" rel="noreferrer" className="btn">เปิดในแท็บใหม่</a>
      </section>

      <UserGuide />

      <section className="pub-section" id="contact">
        <h2>ติดต่อเรา</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          สนใจใช้งานกับทีมของคุณ หรือมีคำถามเรื่องข้อมูลส่วนบุคคล ติดต่อได้ที่
        </p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="btn">{CONTACT_EMAIL}</a>
      </section>

      <footer className="pub-footer">Skouth · ระบบสรรหาและประเมินผู้สมัคร</footer>
    </main>
  )
}
```

- [ ] **Step 3: ตรวจว่า build ผ่านและหน้าแสดงได้**

Run: `npm run build`
Expected: สำเร็จ

Run: `npm run dev` แล้วเปิด `http://localhost:3000/help` **ในหน้าต่างที่ยังไม่ได้ล็อกอิน**
Expected: เห็นหน้าได้โดยไม่ถูกเด้งไป `/login` (ยืนยันว่า middleware ไม่ครอบเส้นทางนี้จริง)

- [ ] **Step 4: Commit**

```bash
git add components/help/UserGuide.tsx "app/(public)/help/page.tsx"
git commit -m "feat(help): add public help page with the user guide"
```

---

### Task 4: ตารางทดสอบการยอมรับบนหน้าเว็บ

**Files:**
- Create: `components/help/UatTable.tsx`
- Modify: `app/(public)/help/page.tsx`

**Interfaces:**
- Consumes: ไม่มีจากงานก่อนหน้า
- Produces: `<UatTable />` ที่ `help/page.tsx` ประกอบเพิ่ม

- [ ] **Step 1: สร้างตารางเคสทดสอบ**

สร้าง `components/help/UatTable.tsx`

```tsx
// ตารางทดสอบการยอมรับ ครอบคลุมทุกเส้นทางในระบบตามที่เจ้าของงานกำหนด
//
// รหัสเคสขึ้นต้นตามหมวด: AU=auth DB=dashboard SR=search CD=candidate
// SL=shortlist JB=jobs SA=self-assessment DM=data management PB=public pages
type Case = { id: string; area: string; steps: string; expected: string }

const CASES: Case[] = [
  { id: 'AU-01', area: 'สมัครสมาชิก', steps: 'สมัครด้วยอีเมลที่ยังไม่เคยใช้ แล้วเปิดลิงก์ยืนยันในอีเมล', expected: 'เข้าสู่ Dashboard อัตโนมัติโดยไม่ต้องล็อกอินซ้ำ' },
  { id: 'AU-02', area: 'สมัครสมาชิก', steps: 'สมัครด้วยอีเมลที่เคยสมัครไปแล้ว', expected: 'ระบบแจ้งว่าอีเมลนี้ถูกใช้แล้ว และไม่สร้างบัญชีซ้ำ' },
  { id: 'AU-03', area: 'สมัครสมาชิก', steps: 'เปิดลิงก์ยืนยันที่หมดอายุแล้ว', expected: 'ขึ้นข้อความว่าลิงก์หมดอายุ พร้อมทางเลือกขอลิงก์ใหม่' },
  { id: 'AU-04', area: 'เข้าสู่ระบบ', steps: 'ล็อกอินด้วยรหัสผ่านผิด', expected: 'ขึ้นข้อความผิดพลาดโดยไม่บอกว่าอีเมลมีอยู่ในระบบหรือไม่' },
  { id: 'AU-05', area: 'ลืมรหัสผ่าน', steps: 'ขอลิงก์รีเซ็ต แล้วตั้งรหัสผ่านใหม่ จากนั้นล็อกอินด้วยรหัสใหม่', expected: 'ล็อกอินสำเร็จด้วยรหัสใหม่ และรหัสเดิมใช้ไม่ได้แล้ว' },
  { id: 'AU-06', area: 'สิทธิ์', steps: 'ล็อกอินเป็น member แล้วพิมพ์ /candidates ที่ช่อง URL ตรงๆ', expected: 'ถูกเด้งไป /dashboard เข้าหน้าไม่ได้' },
  { id: 'AU-07', area: 'สิทธิ์', steps: 'ล็อกอินเป็น member แล้วพิมพ์ /admin/users ตรงๆ', expected: 'ถูกเด้งไป /dashboard' },
  { id: 'AU-08', area: 'สิทธิ์', steps: 'ออกจากระบบแล้วพิมพ์ /dashboard ตรงๆ', expected: 'ถูกเด้งไป /login' },

  { id: 'DB-01', area: 'Dashboard', steps: 'เปิด Dashboard หลังล็อกอิน', expected: 'เห็นจำนวนผู้สมัครทั้งหมด ยอดเปลี่ยนแปลง 30 วัน และจำนวนตำแหน่งงาน' },
  { id: 'DB-02', area: 'Dashboard', steps: 'ดูการ์ด "เปลี่ยนแปลงใน 30 วัน" เมื่อมีการเพิ่มผู้สมัครมากกว่าลบ', expected: 'ตัวเลขเป็นสีเขียวและมีเครื่องหมายบวกนำหน้า' },
  { id: 'DB-03', area: 'Dashboard', steps: 'ลบผู้สมัครจำนวนมากกว่าที่เพิ่มในรอบ 30 วัน แล้วเปิด Dashboard', expected: 'ตัวเลขเป็นสีแดงและมีเครื่องหมายลบนำหน้า' },
  { id: 'DB-04', area: 'Dashboard', steps: 'เปิดหน้าผู้สมัครหนึ่งคน แล้วกลับมาที่ Dashboard', expected: 'คนนั้นปรากฏในส่วน "เพิ่งดูล่าสุด"' },
  { id: 'DB-05', area: 'Dashboard', steps: 'ล็อกอินด้วยบัญชีอื่นแล้วดู "กิจกรรมของคุณ"', expected: 'ไม่เห็นกิจกรรมของบัญชีแรก เห็นเฉพาะของตัวเอง' },

  { id: 'SR-01', area: 'ค้นหา', steps: 'พิมพ์ "หา Data Scientist จบโทอเมริกา ประสบการณ์ 5 ปีขึ้นไป" แล้วกด Enter', expected: 'ได้ผลลัพธ์พร้อมชิปเงื่อนไขที่ระบบแยกออกมา' },
  { id: 'SR-02', area: 'ค้นหา', steps: 'กดปิดชิปเงื่อนไขหนึ่งอัน', expected: 'ผลลัพธ์อัปเดตตามเงื่อนไขที่เหลือ' },
  { id: 'SR-03', area: 'ค้นหา', steps: 'ค้นด้วยข้อความที่มีเครื่องหมายจุลภาค เช่น "Python, SQL"', expected: 'ยังได้ผลลัพธ์ ไม่ขึ้นหน้าว่างและไม่มี error' },
  { id: 'SR-04', area: 'ค้นหา', steps: 'ค้นด้วยข้อความที่ไม่มีใครตรงเลย', expected: 'ขึ้นข้อความว่าไม่พบผลลัพธ์ ไม่ใช่หน้าเปล่า' },
  { id: 'SR-05', area: 'ค้นหา', steps: 'ค้นหาขณะที่บริการ AI ใช้งานไม่ได้', expected: 'ยังค้นหาได้แบบไม่มีชิป ไม่ใช่หน้าพังทั้งหน้า' },

  { id: 'CD-01', area: 'ผู้สมัคร', steps: 'กดชื่อผู้สมัครจากผลการค้นหา', expected: 'เห็นข้อมูล ไทม์ไลน์การศึกษาและการทำงาน' },
  { id: 'CD-02', area: 'ผู้สมัคร', steps: 'พิมพ์ความต้องการในกล่องวิเคราะห์แล้วกดวิเคราะห์', expected: 'ได้คะแนน 0–100 พร้อมเหตุผลภาษาไทย' },
  { id: 'CD-03', area: 'ผู้สมัคร', steps: 'กดวิเคราะห์ด้วยข้อความเดิมซ้ำอีกครั้ง', expected: 'ได้ผลเดิมทันที และระบบแจ้งว่าเป็นผลที่เก็บไว้' },
  { id: 'CD-04', area: 'ผู้สมัคร', steps: 'เปิดหน้าผู้สมัครที่ไม่มี LinkedIn URL', expected: 'ไม่มีปุ่ม LinkedIn และหน้าไม่พัง' },
  { id: 'CD-05', area: 'ผู้สมัคร', steps: 'เปิด URL ผู้สมัครด้วย id ที่ไม่มีอยู่จริง', expected: 'ขึ้นว่าไม่พบผู้สมัคร ไม่ใช่หน้า error' },

  { id: 'SL-01', area: 'Shortlist', steps: 'สร้าง Shortlist ใหม่จากหน้าผู้สมัคร', expected: 'สร้างสำเร็จและผู้สมัครถูกเพิ่มเข้ารายการนั้น' },
  { id: 'SL-02', area: 'Shortlist', steps: 'เพิ่มผู้สมัครคนเดิมเข้ารายการเดิมซ้ำ', expected: 'ไม่เกิดรายการซ้ำ' },
  { id: 'SL-03', area: 'Shortlist', steps: 'ล็อกอินด้วยบัญชีอื่นแล้วเปิดหน้า Shortlist', expected: 'ไม่เห็น Shortlist ของบัญชีแรก' },
  { id: 'SL-04', area: 'Shortlist', steps: 'เอาผู้สมัครออกจาก Shortlist', expected: 'หายจากรายการ แต่ยังอยู่ในฐานผู้สมัคร' },

  { id: 'JB-01', area: 'ตำแหน่งงาน', steps: 'สร้างตำแหน่งงานใหม่ครบทุกช่อง', expected: 'สร้างสำเร็จและปรากฏในรายการ' },
  { id: 'JB-02', area: 'ตำแหน่งงาน', steps: 'เปิดตำแหน่งงานที่สร้าง', expected: 'เห็นรายชื่อผู้สมัครเรียงตามคะแนนจากมากไปน้อย' },
  { id: 'JB-03', area: 'ตำแหน่งงาน', steps: 'ตรวจคะแนนที่แสดง', expected: 'ทุกคะแนนอยู่ในช่วง 0–100' },
  { id: 'JB-04', area: 'ตำแหน่งงาน', steps: 'กดวิเคราะห์เชิงลึกที่ผู้สมัครหนึ่งคน', expected: 'ได้คะแนนพร้อมเหตุผลภาษาไทย' },

  { id: 'SA-01', area: 'ประเมินตัวเอง', steps: 'อัปโหลดไฟล์เรซูเม่ PDF ที่อ่านได้', expected: 'ระบบสรุปข้อมูลออกมาและจัดอันดับตำแหน่งงานให้' },
  { id: 'SA-02', area: 'ประเมินตัวเอง', steps: 'อัปโหลดไฟล์ที่ไม่ใช่ PDF', expected: 'ระบบปฏิเสธพร้อมบอกว่ารับเฉพาะ PDF' },
  { id: 'SA-03', area: 'ประเมินตัวเอง', steps: 'อัปโหลดไฟล์ PDF ขนาดใหญ่เกินกำหนด', expected: 'ระบบปฏิเสธพร้อมบอกขนาดสูงสุดที่รับได้' },
  { id: 'SA-04', area: 'ประเมินตัวเอง', steps: 'ค้นหาชื่อตัวเองในหน้าค้นหาผู้สมัครหลังอัปโหลด', expected: 'ไม่พบ — ข้อมูลประเมินตัวเองแยกจากฐานผู้สมัคร' },
  { id: 'SA-05', area: 'ประเมินตัวเอง', steps: 'ล็อกอินด้วยบัญชีอื่นแล้วเปิด URL ผลประเมินของคนแรกโดยตรง', expected: 'ได้ 404 เหมือนกับ id ที่ไม่มีอยู่จริง' },

  { id: 'DM-01', area: 'จัดการข้อมูล', steps: 'เปิดหน้าข้อมูลด้วยบัญชี data manager', expected: 'เห็นตารางผู้สมัครพร้อมตัวเรียงและช่องค้นหา' },
  { id: 'DM-02', area: 'จัดการข้อมูล', steps: 'กด "แสดงเฉพาะที่มีปัญหา"', expected: 'เหลือเฉพาะแถวที่ข้อมูลไม่ครบหรือชื่อซ้ำ' },
  { id: 'DM-03', area: 'จัดการข้อมูล', steps: 'ลบผู้สมัครที่มาจากข้อมูลสังเคราะห์หนึ่งคน', expected: 'กล่องยืนยันไม่ขึ้นคำเตือนเรื่องการนำเข้าซ้ำ และลบสำเร็จ' },
  { id: 'DM-04', area: 'จัดการข้อมูล', steps: 'ลบผู้สมัครที่มาจากการนำเข้าอัตโนมัติโดยไม่ติ๊ก "ห้ามนำเข้าอีก" แล้วรันสคริปต์นำเข้าใหม่', expected: 'คนนั้นกลับเข้ามาอีกครั้ง ตรงกับคำเตือนที่แสดงไว้' },
  { id: 'DM-05', area: 'จัดการข้อมูล', steps: 'ทำซ้ำข้อ DM-04 แต่ติ๊ก "ห้ามนำเข้าอีก"', expected: 'คนนั้นไม่กลับมา และปรากฏในหน้ารายชื่อที่ถูกระงับ' },
  { id: 'DM-06', area: 'จัดการข้อมูล', steps: 'ติ๊กเลือกหลายแถวแล้วกด "ลบที่เลือก"', expected: 'ลบทั้งหมดในครั้งเดียวและแจ้งจำนวนที่ลบ' },
  { id: 'DM-07', area: 'จัดการข้อมูล', steps: 'ดูบันทึกกิจกรรมท้ายหน้าหลังลบผู้สมัคร', expected: 'มีบรรทัดการลบที่ยังอ่านชื่อคนที่ถูกลบได้' },
  { id: 'DM-08', area: 'นำเข้าข้อมูล', steps: 'วางไฟล์ CSV ที่หน้า Import', expected: 'ระบบรายงานจำนวนที่เพิ่ม อัปเดต และข้าม' },
  { id: 'DM-09', area: 'นำเข้าข้อมูล', steps: 'วางไฟล์ CSV ที่มีคนซึ่งอยู่ในรายชื่อระงับ', expected: 'ระบบข้ามคนนั้นและรายงานว่าถูกระงับ' },
  { id: 'DM-10', area: 'นำเข้าข้อมูล', steps: 'อนุมัติรายการหนึ่งจากคิวรอตรวจ', expected: 'หายจากคิว และค้นเจอในหน้าค้นหา' },
  { id: 'DM-11', area: 'นำเข้าข้อมูล', steps: 'เลือกหลายรายการในคิวแล้วกดปฏิเสธ', expected: 'หายจากคิว และไม่ปรากฏในหน้าข้อมูล' },

  { id: 'ST-01', area: 'ตั้งค่า', steps: 'เปลี่ยนชื่อที่แสดงแล้วบันทึก', expected: 'ชื่อใหม่ปรากฏหลังรีเฟรช' },
  { id: 'ST-02', area: 'ตั้งค่า', steps: 'เปลี่ยนรหัสผ่านโดยกรอกรหัสเดิมผิด', expected: 'ระบบปฏิเสธและไม่เปลี่ยนรหัส' },
  { id: 'ST-03', area: 'ตั้งค่า', steps: 'เปลี่ยนรหัสผ่านโดยกรอกรหัสเดิมถูก แล้วล็อกอินใหม่ด้วยรหัสใหม่', expected: 'เปลี่ยนสำเร็จและล็อกอินด้วยรหัสใหม่ได้' },

  { id: 'PB-01', area: 'หน้าสาธารณะ', steps: 'เปิด / โดยไม่ล็อกอิน', expected: 'เห็นหน้าแนะนำฟีเจอร์ ไม่ถูกเด้งไป /login' },
  { id: 'PB-02', area: 'หน้าสาธารณะ', steps: 'เปิด /help โดยไม่ล็อกอิน', expected: 'เห็นคู่มือได้ครบ ไม่ถูกเด้ง' },
  { id: 'PB-03', area: 'หน้าสาธารณะ', steps: 'เปิด / ขณะล็อกอินอยู่', expected: 'ยังเห็นหน้าแนะนำ และปุ่มขวาบนเป็น "ไปที่ Dashboard"' },
  { id: 'PB-04', area: 'หน้าสาธารณะ', steps: 'กดปุ่ม "ดาวน์โหลด PDF" ที่หน้า /help', expected: 'ไฟล์ถูกดาวน์โหลด เปิดอ่านได้ และภาษาไทยแสดงถูกต้องไม่เป็นสี่เหลี่ยม' },
  { id: 'PB-05', area: 'หน้าสาธารณะ', steps: 'เทียบเวอร์ชันบนหน้าเว็บกับเวอร์ชันบนหน้าปก PDF', expected: 'ตรงกัน' },
  { id: 'PB-06', area: 'หน้าสาธารณะ', steps: 'กดอีเมลในส่วนติดต่อเรา', expected: 'เปิดโปรแกรมอีเมลพร้อมที่อยู่ที่ถูกต้อง' },
]

export default function UatTable() {
  return (
    <section className="pub-section" id="uat">
      <h2>แบบทดสอบการยอมรับระบบ</h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
        ทั้งหมด {CASES.length} เคส · พิมพ์เอกสาร PDF ไปใช้บันทึกผลได้
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ส่วน</th>
              <th>ขั้นตอน</th>
              <th>ผลที่คาดหวัง</th>
              <th>ผล</th>
            </tr>
          </thead>
          <tbody>
            {CASES.map((c) => (
              <tr key={c.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{c.id}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{c.area}</td>
                <td style={{ fontSize: 13 }}>{c.steps}</td>
                <td style={{ fontSize: 13 }}>{c.expected}</td>
                <td className="faint" style={{ whiteSpace: 'nowrap' }}>ผ่าน / ไม่ผ่าน</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: ประกอบเข้าหน้า `/help`**

แก้ `app/(public)/help/page.tsx` — เพิ่ม import และวาง `<UatTable />` ต่อจาก `<UserGuide />`

```tsx
import UatTable from '@/components/help/UatTable'
```

```tsx
      <UserGuide />
      <UatTable />
```

- [ ] **Step 3: ตรวจว่าแสดงครบ**

Run: `npm run build` แล้ว `npm run dev` เปิด `http://localhost:3000/help`
Expected: ตารางแสดงครบ 56 เคส เลื่อนแนวนอนได้บนจอแคบ (มาจากคลาส `table-wrap` ที่มีอยู่แล้ว)

- [ ] **Step 4: Commit**

```bash
git add components/help/UatTable.tsx "app/(public)/help/page.tsx"
git commit -m "feat(help): add the acceptance test table"
```

---

### Task 5: ต้นฉบับเอกสารสำหรับแปลงเป็น PDF

**Files:**
- Create: `docs/uat/skouth-uat.md`

**Interfaces:**
- Consumes: เนื้อหาเดียวกับ `UserGuide.tsx` และ `UatTable.tsx` (Task 3, 4) — คัดลอกมา ไม่ใช่ import
- Produces: ไฟล์ต้นฉบับที่ Task 6 นำไปแปลงเป็น PDF

- [ ] **Step 1: สร้างไฟล์ต้นฉบับ**

สร้าง `docs/uat/skouth-uat.md` โดยมีโครงตามนี้ และ**คัดลอกเนื้อหาจาก `UserGuide.tsx` กับ `UatTable.tsx` มาให้ครบทุกข้อ**

```markdown
# Skouth — คู่มือการใช้งานและแบบทดสอบการยอมรับระบบ

เวอร์ชัน 1.0 · ปรับปรุง 2026-08-29

ผู้ทดสอบ: ______________________  วันที่ทดสอบ: ______________

---

## ส่วนที่ 1 — คู่มือการใช้งาน

### 1.1 เข้าสู่ระบบและสมัครสมาชิก

1. เปิดหน้าแรกแล้วกด "เข้าสู่ระบบ" ที่มุมขวาบน
2. ผู้ใช้ใหม่กด "สมัครสมาชิก" กรอกอีเมลและรหัสผ่าน ระบบจะส่งลิงก์ยืนยันไปที่อีเมล
3. กดลิงก์ในอีเมลแล้วระบบจะพาเข้าสู่ Dashboard ให้อัตโนมัติ ไม่ต้องล็อกอินซ้ำ
4. ลืมรหัสผ่านให้กด "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ

(ทำต่อจนครบทั้ง 9 หัวข้อตาม SECTIONS ใน UserGuide.tsx)

---

## ส่วนที่ 2 — แบบทดสอบการยอมรับระบบ

| รหัส | ส่วน | ขั้นตอน | ผลที่คาดหวัง | ผล | หมายเหตุ |
|---|---|---|---|---|---|
| AU-01 | สมัครสมาชิก | สมัครด้วยอีเมลที่ยังไม่เคยใช้ แล้วเปิดลิงก์ยืนยันในอีเมล | เข้าสู่ Dashboard อัตโนมัติโดยไม่ต้องล็อกอินซ้ำ | ☐ ผ่าน ☐ ไม่ผ่าน | |

(ทำต่อจนครบทั้ง 56 เคสตาม CASES ใน UatTable.tsx)

---

## สรุปผลการทดสอบ

จำนวนเคสทั้งหมด: 56   ผ่าน: ______   ไม่ผ่าน: ______

ความเห็นเพิ่มเติม:

_______________________________________________

ลงชื่อผู้ทดสอบ: ______________________
```

**เนื้อหาต้องตรงกับหน้าเว็บทุกข้อ** — สองที่นี้ดูแลแยกกันโดยตั้งใจ (ดูสเปค) แต่ต้องเริ่มต้นจากจุดที่ตรงกัน

- [ ] **Step 2: ตรวจความครบถ้วน**

Run: `grep -c '^| [A-Z][A-Z]-' docs/uat/skouth-uat.md`
Expected: `56` — ตรงกับจำนวนเคสใน `UatTable.tsx`

- [ ] **Step 3: Commit**

```bash
git add docs/uat/skouth-uat.md
git commit -m "docs: add the UAT document source"
```

---

### Task 6: สร้างไฟล์ PDF (ทำบน Windows เท่านั้น)

**Files:**
- Create: `public/skouth-uat.pdf`

**Interfaces:**
- Consumes: `docs/uat/skouth-uat.md` (Task 5) · `UAT_DOC.path` จาก Task 1
- Produces: ไฟล์ที่ทำให้เทสต์ข้อแรกใน `docAssets.test.ts` ผ่าน

**ทำไมต้องทำบน Windows** — sandbox ของ Cowork ไม่มีฟอนต์ไทยติดตั้งอยู่เลย และเข้าถึง PyPI กับ apt ไม่ได้ (proxy คืน 403) จึงติดตั้งฟอนต์เพิ่มไม่ได้ PDF ที่สร้างจากที่นั่นจะมีแต่สี่เหลี่ยมเปล่าแทนตัวอักษรไทย ส่วน Windows มีฟอนต์ไทยมาให้อยู่แล้ว

- [ ] **Step 1: แปลงต้นฉบับเป็น PDF**

เปิด `docs/uat/skouth-uat.md` ด้วยวิธีใดวิธีหนึ่ง แล้วบันทึกเป็น PDF

- Word: วางเนื้อหา ตั้งฟอนต์ทั้งเอกสารเป็น **Leelawadee UI** หรือ **Sarabun** แล้ว File → Save As → PDF
- Google Docs: วางเนื้อหา ตั้งฟอนต์เป็น **Sarabun** แล้ว File → Download → PDF
- เบราว์เซอร์: เปิด `http://localhost:3000/help` แล้ว Ctrl+P → Save as PDF

บันทึกไฟล์เป็น `public/skouth-uat.pdf`

- [ ] **Step 2: ตรวจว่าภาษาไทยแสดงถูกต้อง**

เปิดไฟล์ที่ได้ แล้วตรวจสามอย่าง

1. ตัวอักษรไทยเป็นตัวอักษรจริง ไม่ใช่สี่เหลี่ยมเปล่า
2. สระบนและวรรณยุกต์อยู่ตำแหน่งถูก ไม่ลอยหรือทับกัน
3. หน้าปกมีเวอร์ชันตรงกับ `UAT_DOC.version` ใน `lib/help/docMeta.ts`

**ถ้าข้อ 1 หรือ 2 ไม่ผ่าน อย่า commit** — เปลี่ยนฟอนต์แล้วทำใหม่ ไฟล์ที่อ่านไม่ออกแย่กว่าไม่มีไฟล์

- [ ] **Step 3: รันเทสต์ — ข้อแรกต้องผ่านแล้ว**

Run: `npx vitest run lib/help/docAssets.test.ts`
Expected: ข้อ "ไฟล์ PDF มีอยู่จริง" PASS · ข้อ "อีเมลไม่ใช่ placeholder" ยัง FAIL จนกว่าจะใส่อีเมลจริง

- [ ] **Step 4: Commit**

```bash
git add public/skouth-uat.pdf
git commit -m "docs: add the UAT PDF for download"
```

---

### Task 7: เชื่อมเข้ากับแอป และบันทึกวิธีดูแล

**Files:**
- Modify: `app/(app)/layout.tsx`
- Create: `docs/manual-tests/public-pages.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: เส้นทาง `/help` (Task 3)
- Produces: ไม่มีที่งานอื่นใช้ต่อ

- [ ] **Step 1: เพิ่มลิงก์คู่มือใน nav ของแอป**

แก้ `app/(app)/layout.tsx` เพิ่มบรรทัดนี้ต่อจาก `<Link href="/self-assessment" ...>`

```tsx
        <Link href="/help" className="nav-link">คู่มือ</Link>
```

- [ ] **Step 2: เขียนคู่มือตรวจด้วยตา**

สร้าง `docs/manual-tests/public-pages.md`

```markdown
# คู่มือทดสอบด้วยมือ — หน้าสาธารณะ

ส่วนที่เป็นตรรกะมี unit test คลุมแล้ว (`lib/help/docAssets.test.ts`)
เอกสารนี้คือส่วนที่ต้องใช้ตาดู

## A. เข้าถึงได้โดยไม่ล็อกอิน

เปิดหน้าต่างไม่ระบุตัวตน แล้วเปิด `/` และ `/help`

**ผลที่ต้องได้:** เห็นทั้งสองหน้า ไม่ถูกเด้งไป `/login`
ถ้าถูกเด้ง แปลว่ามีคนเพิ่มเส้นทางเข้า `matcher` ใน `middleware.ts`

## B. ไม่เด้งผู้ใช้ที่ล็อกอินแล้ว

ล็อกอินแล้วเปิด `/`

**ผลที่ต้องได้:** ยังเห็นหน้าแนะนำ และปุ่มขวาบนเป็น "ไปที่ Dashboard"

## C. ไฟล์ PDF

กด "ดาวน์โหลด PDF" และ "เปิดในแท็บใหม่" ที่หน้า `/help`

**ผลที่ต้องได้:** ไฟล์เปิดได้ ภาษาไทยเป็นตัวอักษรจริงไม่ใช่สี่เหลี่ยม
และเวอร์ชันบนหน้าปกตรงกับที่แสดงข้างปุ่ม

## D. บนมือถือ

เปิดทั้งสองหน้าบนจอกว้าง 375px

**ผลที่ต้องได้:** อ่านได้ ไม่มีข้อความล้นขอบ ตาราง UAT เลื่อนแนวนอนได้

## E. หลัง deploy

เปิดหน้า `/help` บนโปรดักชันแล้วกดดาวน์โหลด

**ผลที่ต้องได้:** ไม่ใช่ 404 — ข้อนี้ดักการลืม commit ไฟล์ PDF ซึ่งบนเครื่องตัวเองจะไม่มีทางเห็น
```

- [ ] **Step 3: บันทึกวิธีดูแลลง CLAUDE.md**

เพิ่มหัวข้อใหม่ต่อจากหัวข้อ Testing ใน `CLAUDE.md`

```markdown
## หน้าสาธารณะ

`/` และ `/help` อยู่ในกลุ่ม `(public)` เปิดให้เข้าโดยไม่ต้องล็อกอิน — `matcher` ใน
`middleware.ts` เป็นรายการเจาะจงที่ไม่ครอบสองเส้นทางนี้ **อย่าเพิ่มเข้าไป**

**เนื้อหาคู่มืออยู่สามที่และต้องแก้พร้อมกัน** — `components/help/UserGuide.tsx`,
`components/help/UatTable.tsx` และ `docs/uat/skouth-uat.md` เป็นการตัดสินใจที่ตั้งใจ
(แลกความเสี่ยงเรื่องความไม่ตรงกันกับอิสระในการจัดหน้า PDF) ตัวลดความเสี่ยงคือ
ขยับ `version` ใน `lib/help/docMeta.ts` ทุกครั้งที่แก้ แล้วสร้าง PDF ใหม่

**PDF ต้องสร้างบน Windows** — sandbox ไม่มีฟอนต์ไทยและติดตั้งเพิ่มไม่ได้ (PyPI และ
apt ถูกปิด) ไฟล์ที่สร้างจากที่นั่นจะเป็นสี่เหลี่ยมเปล่าทั้งฉบับ

**ปุ่มหลักบนหน้าแรกอยู่ที่ `lib/public/cta.ts`** จุดเดียว จะเปลี่ยนเป็น
"สมัครด้วยอีเมลองค์กร" เมื่องานจำกัดโดเมนเสร็จ
```

- [ ] **Step 4: ตรวจทั้งชุด**

Run: `npm test`
Expected: ทุกไฟล์เขียว ยกเว้น `docAssets.test.ts` ข้อ "อีเมลไม่ใช่ placeholder" ที่ยังตกจนกว่าเจ้าของงานจะให้อีเมลจริง

Run: `npm run build`
Expected: สำเร็จ

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/layout.tsx" docs/manual-tests/public-pages.md CLAUDE.md
git commit -m "docs: wire help into app nav and record maintenance rules"
```

---

## งานที่ต้องรอเจ้าของงาน

**อีเมลกลางองค์กร** — แก้ `CONTACT_EMAIL` ใน `lib/help/contact.ts` เทสต์จะตกอยู่จนกว่าจะใส่ค่าจริง ซึ่งเป็นเจตนา ไม่ใช่บั๊ก

## นอกขอบเขตแผนนี้

**การจำกัดการสมัครตามโดเมนอีเมล** — ดูหัวข้อ "งานถัดไป" ในสเปค ต้องใช้ Before User Created Hook ของ Supabase และต้องตอบพร้อมกันว่า `member` ควรเห็นข้อมูลอะไรได้บ้าง
