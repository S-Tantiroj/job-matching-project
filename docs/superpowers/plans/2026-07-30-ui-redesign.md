# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the whole app a clean/minimal-SaaS look via one central CSS design system, restyle every page/component to use it, and add a "your shortlists" card grid to the Dashboard.

**Architecture:** A single `app/globals.css` defines design tokens (CSS variables) and ~20 reusable classes. Every page/component drops its ad-hoc inline styles for these classes. No new dependencies, no behavior changes (except the Dashboard shortlist query). Verification is `npm run build` + the existing Vitest suite staying green + a visual pass.

**Tech Stack:** Next.js 15 (App Router), plain CSS (no Tailwind), Vitest.

## Global Constraints

- No new dependencies (no Tailwind / component lib / CSS-in-JS). Plain CSS only.
- No functional/logic changes — search, ingest, auth, scoring, dedup untouched. Visual layer only. The one exception: the Dashboard adds a shortlists data fetch.
- No dark mode (light theme only).
- All existing Vitest tests must stay green. `Timeline.tsx`'s `buildTimeline` function and `Timeline.test.tsx` must remain behaviorally identical (restyle the JSX only).
- Server components stay server, client components stay client — do not add/remove `'use client'`.
- Colours/tokens are the exact values in Task U1; use the classes, avoid new inline styles.
- App/brand name shown in the nav: `Skouth`.

## File Structure

- Create `app/globals.css` — tokens + all reusable classes (U1).
- `app/layout.tsx` — import globals.css, metadata (U1).
- `app/(app)/layout.tsx` — nav shell (U2).
- `app/(app)/dashboard/page.tsx` — metrics + shortlist cards + recent (U3).
- `app/(app)/search/page.tsx`, `components/ScoreBadge.tsx`, `components/FilterChips.tsx`, `components/CoverageStrip.tsx` (U4).
- `app/(app)/candidates/[id]/page.tsx`, `components/Timeline.tsx`, `components/AnalyzePanel.tsx`, `components/AddToShortlist.tsx`, `app/(app)/jobs/page.tsx`, `app/(app)/jobs/[id]/page.tsx`, `components/JobMatches.tsx`, `components/CreateJobForm.tsx` (U5).
- `app/(app)/shortlists/page.tsx`, `app/(app)/import/page.tsx`, `app/(app)/admin/users/page.tsx`, `components/RoleSelect.tsx`, `app/(app)/settings/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/page.tsx` (U6).

---

### Task U1: Design system foundation (globals.css + root layout)

**Files:**
- Create: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: the CSS classes every later task uses — `.container .nav .nav-brand .nav-link .nav-link.active .nav-right .nav-avatar .card .btn .btn-primary .btn-ghost .input .textarea .select .chip .chip-x .chip-add .pill .pill-on .pill-off .badge-score .badge-score--ok|--warn|--bad .metric-grid .metric .metric-label .metric-value .list .list-row .avatar .tag .tag-accent .section-header .card-grid .shortlist-card .shortlist-icon .result-row .muted .faint .stack .row .auth-wrap`.

- [ ] **Step 1: Create `app/globals.css`**

```css
:root {
  --bg: #f7f8fa;
  --surface: #ffffff;
  --border: #e6e8eb;
  --border-hover: #d9dce1;
  --text: #1a1d21;
  --text-muted: #6b7280;
  --text-faint: #9299a2;
  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --accent-soft: #eef2ff;
  --accent-soft-text: #4338ca;
  --radius: 10px;
  --radius-card: 12px;
  --ok: #16a34a;
  --warn: #d97706;
  --bad: #dc2626;
  --success-bg: #ecfdf5;
  --success-text: #047857;
  --success-border: #a7f3d0;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.55;
}

h1 { font-size: 20px; font-weight: 500; margin: 0 0 16px; }
h2 { font-size: 15px; font-weight: 500; margin: 0; }
h3 { font-size: 14px; font-weight: 500; margin: 0 0 10px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
p { margin: 8px 0; }

.container { max-width: 960px; margin: 0 auto; padding: 24px; }

.nav { display: flex; align-items: center; gap: 20px; background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; }
.nav-brand { font-size: 16px; font-weight: 500; color: var(--accent); }
.nav-brand:hover { text-decoration: none; }
.nav-link { color: var(--text-faint); font-size: 14px; }
.nav-link:hover { color: var(--text); text-decoration: none; }
.nav-link.active { color: var(--text); font-weight: 500; }
.nav-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
.nav-avatar { width: 28px; height: 28px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-soft-text); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 18px; }

.btn { font-family: inherit; font-size: 14px; border-radius: var(--radius); padding: 8px 16px; cursor: pointer; border: 1px solid var(--border-hover); background: var(--surface); color: var(--text); }
.btn:hover { border-color: var(--text-faint); }
.btn:disabled { opacity: .5; cursor: default; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-ghost { border-color: transparent; color: var(--accent); background: transparent; }

.input, .textarea, .select { font-family: inherit; font-size: 14px; width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 9px 12px; color: var(--text); }
.input:focus, .textarea:focus, .select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.input::placeholder, .textarea::placeholder { color: var(--text-faint); }

.chip { display: inline-flex; align-items: center; gap: 6px; background: var(--accent-soft); color: var(--accent-soft-text); border-radius: 8px; padding: 5px 10px; font-size: 13px; }
.chip-x { border: none; background: none; cursor: pointer; color: var(--accent-soft-text); opacity: .6; font-size: 14px; padding: 0; line-height: 1; }
.chip-x:hover { opacity: 1; }
.chip-add { display: inline-flex; align-items: center; gap: 5px; border: 1px dashed var(--border-hover); color: var(--text-faint); border-radius: 8px; padding: 5px 10px; font-size: 13px; background: none; cursor: pointer; }

.pill { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 11px; font-size: 12px; border: 1px solid; }
.pill-on { background: var(--success-bg); color: var(--success-text); border-color: var(--success-border); }
.pill-off { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; }

.badge-score { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; padding: 0 8px; border-radius: 8px; color: #fff; font-size: 13px; font-weight: 500; }
.badge-score--ok { background: var(--ok); }
.badge-score--warn { background: var(--warn); }
.badge-score--bad { background: var(--bad); }

.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.metric { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 16px 18px; }
.metric-label { font-size: 12px; color: var(--text-faint); margin-bottom: 6px; }
.metric-value { font-size: 26px; font-weight: 500; }

.list { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); overflow: hidden; }
.list-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f0f2f4; }
.list-row:last-child { border-bottom: none; }
.list-row:hover { background: #fafbfc; }

.avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-soft-text); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 500; flex-shrink: 0; }
.tag { font-size: 11px; border-radius: 6px; padding: 3px 8px; background: #f1f3f5; color: var(--text-muted); }
.tag-accent { background: var(--accent-soft); color: var(--accent-soft-text); }

.section-header { display: flex; justify-content: space-between; align-items: baseline; margin: 22px 0 10px; }

.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.shortlist-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-card); padding: 15px 16px; display: flex; flex-direction: column; gap: 12px; scroll-margin-top: 80px; }
.shortlist-card:hover { border-color: var(--border-hover); }
.shortlist-icon { width: 30px; height: 30px; border-radius: 8px; background: var(--accent-soft); color: var(--accent-soft-text); display: inline-flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }

.result-row { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.result-row:hover { border-color: var(--border-hover); }

.muted { color: var(--text-muted); }
.faint { color: var(--text-faint); }
.stack { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; gap: 8px; align-items: center; }
.auth-wrap { max-width: 380px; margin: 72px auto; padding: 0 24px; }
```

- [ ] **Step 2: Wire it into the root layout**

Replace the ENTIRE contents of `app/layout.tsx` with:

```tsx
import './globals.css'

export const metadata = {
  title: 'Skouth',
  description: 'Internal candidate sourcing and evaluation platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: compiles with the new stylesheet (no visual change yet on most pages until they adopt classes).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat(ui): design system foundation (tokens + reusable classes)"
```

---

### Task U2: Nav shell

**Files:**
- Modify: `app/(app)/layout.tsx` (rewrite)

**Interfaces:**
- Consumes: `.nav*`, `.container` (U1).

- [ ] **Step 1: Rewrite the app layout**

Replace the ENTIRE contents of `app/(app)/layout.tsx` with:

```tsx
import Link from 'next/link'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="nav">
        <Link href="/dashboard" className="nav-brand">Skouth</Link>
        <Link href="/dashboard" className="nav-link">Dashboard</Link>
        <Link href="/search" className="nav-link">ค้นหา</Link>
        <Link href="/jobs" className="nav-link">งาน</Link>
        <Link href="/shortlists" className="nav-link">Shortlist</Link>
        <Link href="/import" className="nav-link">นำเข้า</Link>
        <Link href="/admin/users" className="nav-link">Admin</Link>
        <div className="nav-right">
          <Link href="/settings" className="nav-link">ตั้งค่า</Link>
        </div>
      </nav>
      <div className="container">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build + visual**

Run: `npm run build`
Then `npm run dev`, log in, confirm the new top nav renders on every app page (brand "Skouth" indigo, links, ตั้งค่า on the right).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(ui): redesigned top nav"
```

---

### Task U3: Dashboard (metrics + shortlist cards + recent)

**Files:**
- Modify: `app/(app)/dashboard/page.tsx` (rewrite)

**Interfaces:**
- Consumes: `getServerClient`, `getSession`, `.metric*`, `.section-header`, `.card-grid`, `.shortlist-card`, `.list*`, `.avatar`, `.tag`.

- [ ] **Step 1: Rewrite the dashboard**

Replace the ENTIRE contents of `app/(app)/dashboard/page.tsx` with:

```tsx
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default async function Dashboard() {
  const db = getServerClient()
  const session = await getSession()

  const { count } = await db.from('candidates').select('id', { count: 'exact', head: true })
  const { count: scraped } = await db
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'scraper')
  const { count: jobCount } = await db.from('jobs').select('id', { count: 'exact', head: true })

  const { data: recent } = await db
    .from('candidates')
    .select('id, full_name, headline, source')
    .order('created_at', { ascending: false })
    .limit(8)

  const { data: shortlists } = session
    ? await db
        .from('shortlists')
        .select('id, name, shortlist_candidates(count)')
        .eq('owner_id', session.userId)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <main>
      <h1>Dashboard</h1>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">ผู้สมัครทั้งหมด</div>
          <div className="metric-value">{count ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">จาก LinkedIn</div>
          <div className="metric-value">{scraped ?? 0}</div>
        </div>
        <div className="metric">
          <div className="metric-label">งานที่เปิด</div>
          <div className="metric-value">{jobCount ?? 0}</div>
        </div>
      </div>

      <div className="section-header">
        <h2>Shortlist ของคุณ</h2>
        <Link href="/shortlists">+ สร้างใหม่</Link>
      </div>
      {(shortlists ?? []).length === 0 ? (
        <p className="faint">ยังไม่มี shortlist</p>
      ) : (
        <div className="card-grid">
          {(shortlists ?? []).map((sl: any) => (
            <Link key={sl.id} href={`/shortlists#${sl.id}`} className="shortlist-card" style={{ color: 'inherit' }}>
              <div className="row">
                <span className="shortlist-icon">★</span>
                <span style={{ fontWeight: 500 }}>{sl.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 12 }}>
                  {sl.shortlist_candidates?.[0]?.count ?? 0} ผู้สมัคร
                </span>
                <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>เปิด →</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="section-header">
        <h2>ผู้สมัครล่าสุด</h2>
      </div>
      <div className="list">
        {(recent ?? []).map((c: any) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="list-row" style={{ color: 'inherit' }}>
            <span className="avatar">{initials(c.full_name)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{c.full_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{c.headline}</div>
            </div>
            <span className={`tag ${c.source === 'scraper' ? 'tag-accent' : ''}`}>
              {c.source === 'scraper' ? 'linkedin' : c.source}
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify build + visual**

Run: `npm run build`
Then `npm run dev` → `/dashboard`: three metric cards, a "Shortlist ของคุณ" grid (create a shortlist via `/shortlists` first to see a card; clicking it jumps to `/shortlists#<id>`), and a recent-candidates list with avatars + source tags.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat(ui): redesigned dashboard + your-shortlists cards"
```

---

### Task U4: Search experience (page + ScoreBadge + FilterChips + CoverageStrip)

**Files:**
- Modify: `components/ScoreBadge.tsx` (rewrite), `components/FilterChips.tsx` (rewrite), `components/CoverageStrip.tsx` (rewrite), `app/(app)/search/page.tsx` (rewrite)
- Test: `components/ScoreBadge.test.ts`

**Interfaces:**
- Produces: `scoreClass(score: number): 'ok' | 'warn' | 'bad'` (exported from ScoreBadge).
- Consumes: `.badge-score`, `.chip*`, `.pill*`, `.input`, `.btn*`, `.result-row`, `.card`, `.section-header`, `ChipFilters`.

- [ ] **Step 1: Write the ScoreBadge failing test**

Create `components/ScoreBadge.test.ts`:

```ts
import { scoreClass } from './ScoreBadge'

test('scoreClass picks the threshold band', () => {
  expect(scoreClass(90)).toBe('ok')
  expect(scoreClass(75)).toBe('ok')
  expect(scoreClass(60)).toBe('warn')
  expect(scoreClass(50)).toBe('warn')
  expect(scoreClass(40)).toBe('bad')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/ScoreBadge.test.ts`
Expected: FAIL ("scoreClass is not exported").

- [ ] **Step 3: Rewrite ScoreBadge**

Replace the ENTIRE contents of `components/ScoreBadge.tsx` with:

```tsx
export function scoreClass(score: number): 'ok' | 'warn' | 'bad' {
  return score >= 75 ? 'ok' : score >= 50 ? 'warn' : 'bad'
}

export default function ScoreBadge({ score }: { score: number }) {
  return <span className={`badge-score badge-score--${scoreClass(score)}`}>{score}</span>
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/ScoreBadge.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite FilterChips**

Replace the ENTIRE contents of `components/FilterChips.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import type { ChipFilters } from '@/lib/search/extractFilters'

export default function FilterChips({
  filters,
  onChange,
}: {
  filters: ChipFilters
  onChange: (f: ChipFilters) => void
}) {
  const [skill, setSkill] = useState('')
  const [field, setField] = useState('')

  const skills = filters.skills ?? []
  const fields = filters.fieldOrDegree ?? []

  return (
    <div className="stack" style={{ gap: 10, margin: '12px 0' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {skills.map((s) => (
          <span key={s} className="chip">
            สกิล: {s}
            <button className="chip-x" aria-label={`ลบ ${s}`} onClick={() => onChange({ ...filters, skills: skills.filter((x) => x !== s) })}>×</button>
          </span>
        ))}
        <input
          className="input"
          style={{ width: 110 }}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && skill.trim()) {
              onChange({ ...filters, skills: [...skills, skill.trim()] })
              setSkill('')
            }
          }}
          placeholder="+ สกิล"
        />
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        {fields.map((f) => (
          <span key={f} className="chip">
            สาขา: {f}
            <button className="chip-x" aria-label={`ลบ ${f}`} onClick={() => onChange({ ...filters, fieldOrDegree: fields.filter((x) => x !== f) })}>×</button>
          </span>
        ))}
        <input
          className="input"
          style={{ width: 140 }}
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && field.trim()) {
              onChange({ ...filters, fieldOrDegree: [...fields, field.trim()] })
              setField('')
            }
          }}
          placeholder="+ สาขา/ปริญญา"
        />
      </div>

      <div className="row" style={{ fontSize: 13 }}>
        <span className="faint">ประสบการณ์ขั้นต่ำ (ปี):</span>
        <input
          className="input"
          type="number"
          min={0}
          style={{ width: 80 }}
          value={filters.minYears ?? ''}
          onChange={(e) => onChange({ ...filters, minYears: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Rewrite CoverageStrip**

Replace the ENTIRE contents of `components/CoverageStrip.tsx` with:

```tsx
'use client'
import type { ChipFilters } from '@/lib/search/extractFilters'

export default function CoverageStrip({
  semanticQuery,
  filters,
}: {
  semanticQuery: string
  filters: ChipFilters
}) {
  const items: { label: string; on: boolean }[] = [
    { label: 'ตำแหน่ง', on: !!semanticQuery.trim() },
    { label: 'ประสบการณ์', on: filters.minYears != null },
    { label: 'สกิล', on: !!filters.skills?.length },
    { label: 'การศึกษา', on: !!filters.fieldOrDegree?.length },
  ]

  return (
    <div className="row" style={{ flexWrap: 'wrap', margin: '10px 0' }}>
      {items.map((it) => (
        <span key={it.label} className={`pill ${it.on ? 'pill-on' : 'pill-off'}`}>
          {it.on ? '✓' : '○'} {it.label}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Rewrite the search page**

Replace the ENTIRE contents of `app/(app)/search/page.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import ScoreBadge, { scoreClass } from '@/components/ScoreBadge'
import FilterChips from '@/components/FilterChips'
import CoverageStrip from '@/components/CoverageStrip'
import type { ChipFilters } from '@/lib/search/extractFilters'

export default function SearchPage() {
  const [nl, setNl] = useState('')
  const [semanticQuery, setSemanticQuery] = useState('')
  const [filters, setFilters] = useState<ChipFilters>({})
  const [res, setRes] = useState<any[]>([])
  const [parsing, setParsing] = useState(false)
  const [searching, setSearching] = useState(false)
  const [ran, setRan] = useState(false)

  const runSearch = async (sq: string, f: ChipFilters) => {
    if (!sq.trim()) return
    setSearching(true)
    setRan(true)
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ semanticQuery: sq, filters: f }),
    })
    const json = await r.json()
    setRes(Array.isArray(json) ? json : [])
    setSearching(false)
  }

  const parseAndSearch = async () => {
    if (!nl.trim() || parsing) return
    setParsing(true)
    let intent: any = {}
    try {
      const r = await fetch('/api/search/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: nl }),
      })
      if (r.ok) intent = await r.json()
    } catch {
      intent = {}
    }
    setParsing(false)
    const sq = intent.semanticQuery ?? nl
    const f = intent.filters ?? {}
    setSemanticQuery(sq)
    setFilters(f)
    await runSearch(sq, f)
  }

  const onFiltersChange = (f: ChipFilters) => {
    setFilters(f)
    runSearch(semanticQuery, f)
  }

  return (
    <main>
      <h1>ค้นหาผู้สมัคร</h1>

      <div className="row" style={{ margin: '12px 0' }}>
        <input
          className="input"
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && parseAndSearch()}
          placeholder="พิมพ์คำค้นหาทั่วไป เช่น data scientist สาย Python ที่จบจากอเมริกา 3 ปีขึ้นไป"
        />
        <button className="btn btn-primary" onClick={parseAndSearch} disabled={parsing || !nl}>
          {parsing ? 'กำลังอ่าน…' : 'ค้นหา'}
        </button>
      </div>

      <CoverageStrip semanticQuery={semanticQuery} filters={filters} />

      {semanticQuery && (
        <div className="card" style={{ margin: '4px 0 8px' }}>
          <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>คำอธิบายที่ค้นหา (แก้ได้)</div>
          <div className="row">
            <input
              className="input"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(semanticQuery, filters)}
            />
            <button className="btn" onClick={() => runSearch(semanticQuery, filters)} disabled={searching}>
              ค้นหาใหม่
            </button>
          </div>
          <FilterChips filters={filters} onChange={onFiltersChange} />
        </div>
      )}

      {res.length > 0 && (
        <div className="section-header">
          <h2>ผู้สมัคร {res.length} คน</h2>
          <span className="faint" style={{ fontSize: 12 }}>เรียงตามความใกล้เคียง</span>
        </div>
      )}
      <div className="stack">
        {res.map((c) => (
          <Link key={c.id} href={`/candidates/${c.id}`} className="result-row" style={{ color: 'inherit' }}>
            <ScoreBadge score={c.score} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{c.full_name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{c.headline}</div>
            </div>
            <span className="faint">›</span>
          </Link>
        ))}
      </div>
      {ran && !searching && res.length === 0 && <p className="faint">ไม่พบผู้สมัคร</p>}
    </main>
  )
}
```

- [ ] **Step 8: Verify build + full suite + visual**

Run: `npm run build`
Run: `npx vitest run components/ScoreBadge.test.ts lib/search/query.test.ts`
Expected: build compiles; tests pass.
Then visually check `/search`: input + primary button, coverage pills (green/gray), editable card with chips, result rows with rounded-square score badges.

- [ ] **Step 9: Commit**

```bash
git add components/ScoreBadge.tsx components/ScoreBadge.test.ts components/FilterChips.tsx components/CoverageStrip.tsx "app/(app)/search/page.tsx"
git commit -m "feat(ui): redesigned search page + score/chip/coverage components"
```

---

### Task U5: Candidate + Jobs

**Files:**
- Modify: `components/Timeline.tsx`, `components/AnalyzePanel.tsx`, `components/AddToShortlist.tsx`, `app/(app)/candidates/[id]/page.tsx`, `app/(app)/jobs/page.tsx`, `app/(app)/jobs/[id]/page.tsx`, `components/JobMatches.tsx`, `components/CreateJobForm.tsx`

**Interfaces:**
- Consumes: `.card`, `.chip`, `.btn*`, `.input`, `.select`, `.avatar`, `.list*`, `.result-row`, `ScoreBadge`.
- `Timeline`'s `buildTimeline` export is UNCHANGED (its test must keep passing).

- [ ] **Step 1: Restyle Timeline (keep buildTimeline identical)**

Replace the ENTIRE contents of `components/Timeline.tsx` with:

```tsx
export type TLItem = { year: number; label: string; kind: 'edu' | 'exp' }

// Merges education and experience into a single timeline, newest first.
export function buildTimeline(edu: any[] = [], exp: any[] = []): TLItem[] {
  const e: TLItem[] = edu.map((x) => ({
    year: x.start_year ?? 0,
    label: `${x.degree ?? ''} ${x.institution ?? ''}`.trim() + (x.country ? ` (${x.country})` : ''),
    kind: 'edu',
  }))
  const w: TLItem[] = exp.map((x) => ({
    year: x.start_date ? new Date(x.start_date).getFullYear() : 0,
    label: `${x.title ?? ''} @ ${x.company ?? ''}`.trim(),
    kind: 'exp',
  }))
  return [...e, ...w].sort((a, b) => b.year - a.year)
}

export default function Timeline({ edu, exp }: { edu?: any[]; exp?: any[] }) {
  const items = buildTimeline(edu, exp)
  if (!items.length) return <p className="faint">ไม่มีข้อมูลไทม์ไลน์</p>
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, borderLeft: '2px solid var(--border)' }}>
      {items.map((i, k) => (
        <li key={k} style={{ padding: '7px 0 7px 16px' }}>
          <span style={{ display: 'inline-block', minWidth: 46, fontWeight: 500, color: i.kind === 'edu' ? 'var(--accent)' : 'var(--ok)' }}>
            {i.year || '—'}
          </span>
          <span style={{ marginLeft: 8 }}>{i.label}</span>
          <span className="faint" style={{ marginLeft: 8, fontSize: 12 }}>
            {i.kind === 'edu' ? 'การศึกษา' : 'งาน'}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Restyle AnalyzePanel**

Replace the ENTIRE contents of `components/AnalyzePanel.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import ScoreBadge from './ScoreBadge'

export default function AnalyzePanel({ candidateId }: { candidateId: string }) {
  const [requirement, setRequirement] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ score: number; reasoning: string; cached?: boolean } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const db = getBrowserClient()
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const { data } = await db.from('profiles').select('settings').eq('id', user.id).maybeSingle()
      const def = (data as any)?.settings?.defaultRequirement
      if (def) setRequirement(def)
    })()
  }, [])

  const run = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ candidateId, requirement }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'error')
      setResult(json)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>ประเมินความเหมาะสม (AI)</h3>
      <div className="row">
        <input
          className="input"
          value={requirement}
          onChange={(e) => setRequirement(e.target.value)}
          placeholder="สกิล/ตำแหน่งที่ต้องการ เช่น Python data scientist"
        />
        <button className="btn btn-primary" onClick={run} disabled={loading || !requirement}>
          {loading ? 'กำลังประเมิน…' : 'ประเมิน'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {result && (
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
          <ScoreBadge score={result.score} />
          <div>
            {result.cached && <span className="faint" style={{ fontSize: 12 }}>(จาก cache)</span>}
            <p style={{ margin: 0 }}>{result.reasoning}</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Restyle AddToShortlist**

Replace the ENTIRE contents of `components/AddToShortlist.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export default function AddToShortlist({ candidateId }: { candidateId: string }) {
  const db = getBrowserClient()
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState('')
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState('')

  const load = async () => {
    const { data } = await db.from('shortlists').select('id, name').order('created_at')
    setLists(data ?? [])
    if (data?.length) setSelected(data[0].id)
  }
  useEffect(() => {
    load()
  }, [])

  const add = async () => {
    setMsg('')
    let listId = selected
    if (newName.trim()) {
      const { data: { user } } = await db.auth.getUser()
      const { data, error } = await db
        .from('shortlists')
        .insert({ name: newName.trim(), owner_id: user!.id })
        .select('id')
        .single()
      if (error) return setMsg(error.message)
      listId = (data as any).id
      setNewName('')
      await load()
    }
    if (!listId) return setMsg('เลือกหรือสร้าง shortlist ก่อน')
    const { error } = await db
      .from('shortlist_candidates')
      .upsert({ shortlist_id: listId, candidate_id: candidateId })
    setMsg(error ? error.message : 'เพิ่มเข้า shortlist แล้ว')
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3>เพิ่มเข้า Shortlist</h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select className="select" style={{ width: 'auto' }} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">— เลือก shortlist —</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <span className="faint">หรือสร้างใหม่:</span>
        <input className="input" style={{ width: 160 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ shortlist" />
        <button className="btn btn-primary" onClick={add}>เพิ่ม</button>
      </div>
      {msg && <p style={{ marginTop: 8, color: 'var(--ok)' }}>{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Restyle the candidate page**

Replace the ENTIRE contents of `app/(app)/candidates/[id]/page.tsx` with:

```tsx
import { getServerClient } from '@/lib/supabase/server'
import Timeline from '@/components/Timeline'
import AnalyzePanel from '@/components/AnalyzePanel'
import AddToShortlist from '@/components/AddToShortlist'

export const dynamic = 'force-dynamic'

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()

  const { data: c } = await db
    .from('candidates')
    .select('*, education(*), experience(*), candidate_skills(skills(name))')
    .eq('id', id)
    .single()

  if (!c) return <main><p className="faint">ไม่พบผู้สมัคร</p></main>

  const skills: string[] = (c as any).candidate_skills?.map((x: any) => x.skills?.name).filter(Boolean) ?? []

  return (
    <main>
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="avatar" style={{ width: 44, height: 44 }}>{initials((c as any).full_name)}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>{(c as any).full_name}</h1>
            <p className="muted" style={{ margin: '2px 0' }}>{(c as any).headline}</p>
            {(c as any).location && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{(c as any).location}</p>}
          </div>
          {(c as any).linkedin_url && (
            <a href={(c as any).linkedin_url} target="_blank" rel="noreferrer" className="btn">LinkedIn ↗</a>
          )}
        </div>
        {(c as any).summary && <p style={{ marginTop: 12 }}>{(c as any).summary}</p>}
        {skills.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 12 }}>
            {skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        )}
      </div>

      <div className="section-header"><h2>ไทม์ไลน์</h2></div>
      <div className="card">
        <Timeline edu={(c as any).education} exp={(c as any).experience} />
      </div>

      <AnalyzePanel candidateId={id} />
      <AddToShortlist candidateId={id} />
    </main>
  )
}
```

- [ ] **Step 5: Restyle CreateJobForm**

Replace the ENTIRE contents of `components/CreateJobForm.tsx` with:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CreateJobForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [skills, setSkills] = useState('')
  const [minExp, setMinExp] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!title.trim() || !description.trim() || saving) return
    setSaving(true)
    setMsg('')
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        company: company || undefined,
        description,
        required_skills: skills ? skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
        min_experience_years: minExp ? Number(minExp) : undefined,
        location: location || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setMsg('บันทึกไม่สำเร็จ')
      return
    }
    setTitle('')
    setCompany('')
    setSkills('')
    setMinExp('')
    setLocation('')
    setDescription('')
    setMsg('เพิ่มงานแล้ว')
    router.refresh()
  }

  return (
    <div className="card stack" style={{ maxWidth: 560, gap: 8, marginBottom: 24 }}>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ตำแหน่งงาน (เช่น Data Scientist)" />
      <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="บริษัท (ไม่บังคับ)" />
      <input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="สกิลที่ต้องการ คั่นด้วยจุลภาค เช่น Python, SQL" />
      <input className="input" value={minExp} onChange={(e) => setMinExp(e.target.value)} placeholder="ประสบการณ์ขั้นต่ำ (ปี)" type="number" />
      <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="สถานที่ (ไม่บังคับ)" />
      <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" rows={4} />
      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={saving || !title || !description}>
          {saving ? 'กำลังบันทึก…' : 'เพิ่มงาน'}
        </button>
        {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Restyle the jobs list page**

Replace the ENTIRE contents of `app/(app)/jobs/page.tsx` with:

```tsx
import Link from 'next/link'
import { getServerClient } from '@/lib/supabase/server'
import CreateJobForm from '@/components/CreateJobForm'

export const dynamic = 'force-dynamic'

export default async function JobsPage() {
  const db = getServerClient()
  const { data: jobs } = await db
    .from('jobs')
    .select('id, title, company, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <main>
      <h1>งาน</h1>
      <CreateJobForm />

      <div className="section-header"><h2>งานทั้งหมด</h2></div>
      {(jobs ?? []).length === 0 ? (
        <p className="faint">ยังไม่มีงาน เพิ่มงานด้านบนได้เลย</p>
      ) : (
        <div className="list">
          {(jobs ?? []).map((j: any) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="list-row" style={{ color: 'inherit' }}>
              <span style={{ fontWeight: 500 }}>{j.title}</span>
              {j.company && <span className="muted">{j.company}</span>}
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Restyle JobMatches**

Replace the ENTIRE contents of `components/JobMatches.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'

type Match = { id: string; full_name: string; headline?: string; score: number }
type Deep = { score: number; reasoning: string }

export default function JobMatches({ jobId }: { jobId: string }) {
  const [rows, setRows] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [deep, setDeep] = useState<Record<string, Deep | 'loading'>>({})

  useEffect(() => {
    ;(async () => {
      const r = await fetch(`/api/jobs/${jobId}/match`)
      const json = await r.json()
      setRows(Array.isArray(json) ? json : [])
      setLoading(false)
    })()
  }, [jobId])

  const analyze = async (candidateId: string) => {
    setDeep((d) => ({ ...d, [candidateId]: 'loading' }))
    const r = await fetch(`/api/jobs/${jobId}/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    })
    const json = await r.json()
    setDeep((d) => ({ ...d, [candidateId]: { score: json.score, reasoning: json.reasoning } }))
  }

  if (loading) return <p className="faint">กำลังจัดอันดับผู้สมัคร…</p>
  if (!rows.length) return <p className="faint">ยังไม่มีผู้สมัครที่เข้าเกณฑ์</p>

  return (
    <div className="stack">
      {rows.map((c) => {
        const d = deep[c.id]
        return (
          <div key={c.id} className="result-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="row">
              <ScoreBadge score={c.score} />
              <Link href={`/candidates/${c.id}`} style={{ fontWeight: 500 }}>{c.full_name}</Link>
              <span className="muted">{c.headline}</span>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => analyze(c.id)} disabled={d === 'loading'}>
                {d === 'loading' ? 'กำลังวิเคราะห์…' : 'วิเคราะห์เชิงลึก'}
              </button>
            </div>
            {d && d !== 'loading' && (
              <div className="row" style={{ marginTop: 8, marginLeft: 44, fontSize: 14, alignItems: 'flex-start' }}>
                <ScoreBadge score={d.score} />
                <span className="muted">{d.reasoning}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 8: Restyle the job detail page**

Replace the ENTIRE contents of `app/(app)/jobs/[id]/page.tsx` with:

```tsx
import { getServerClient } from '@/lib/supabase/server'
import JobMatches from '@/components/JobMatches'

export const dynamic = 'force-dynamic'

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getServerClient()
  const { data: j } = await db
    .from('jobs')
    .select('title, company, location, min_experience_years, required_skills, description')
    .eq('id', id)
    .single()

  if (!j) return <main><p className="faint">ไม่พบงานนี้</p></main>

  const skills: string[] = (j as any).required_skills ?? []

  return (
    <main>
      <div className="card">
        <h1 style={{ margin: 0 }}>{(j as any).title}</h1>
        {(j as any).company && <p className="muted" style={{ margin: '2px 0' }}>{(j as any).company}</p>}
        {(j as any).location && <p className="faint" style={{ margin: 0, fontSize: 13 }}>{(j as any).location}</p>}
        {(j as any).min_experience_years != null && (
          <p className="faint" style={{ fontSize: 13 }}>ประสบการณ์ขั้นต่ำ {(j as any).min_experience_years} ปี</p>
        )}
        {skills.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
            {skills.map((s) => <span key={s} className="chip">{s}</span>)}
          </div>
        )}
        {(j as any).description && <p>{(j as any).description}</p>}
      </div>

      <div className="section-header"><h2>ผู้สมัครที่เข้าเกณฑ์</h2></div>
      <JobMatches jobId={id} />
    </main>
  )
}
```

- [ ] **Step 9: Verify build + suite + visual**

Run: `npm run build`
Run: `npx vitest run components/Timeline.test.tsx`
Expected: build compiles; Timeline test still passes (buildTimeline unchanged).
Visually check `/candidates/[id]` (profile card + avatar + skills chips + timeline card + analyze/shortlist cards) and `/jobs` + `/jobs/[id]` (job card + ranked candidate rows).

- [ ] **Step 10: Commit**

```bash
git add components/Timeline.tsx components/AnalyzePanel.tsx components/AddToShortlist.tsx "app/(app)/candidates/[id]/page.tsx" components/CreateJobForm.tsx "app/(app)/jobs/page.tsx" components/JobMatches.tsx "app/(app)/jobs/[id]/page.tsx"
git commit -m "feat(ui): redesigned candidate + jobs pages/components"
```

---

### Task U6: Shortlists, import, admin, settings, auth

**Files:**
- Modify: `app/(app)/shortlists/page.tsx`, `app/(app)/import/page.tsx`, `app/(app)/admin/users/page.tsx`, `components/RoleSelect.tsx`, `app/(app)/settings/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `.card`, `.btn*`, `.input`, `.select`, `.list*`, `.auth-wrap`, `.section-header`.

- [ ] **Step 1: Restyle the shortlists page (add anchor ids)**

Replace the ENTIRE contents of `app/(app)/shortlists/page.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase/client'

export default function ShortlistsPage() {
  const db = getBrowserClient()
  const [data, setData] = useState<any[]>([])
  const [newName, setNewName] = useState('')

  const load = async () => {
    const { data } = await db
      .from('shortlists')
      .select('id, name, shortlist_candidates(candidate_id, candidates(id, full_name, headline))')
      .order('created_at')
    setData(data ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    const { data: { user } } = await db.auth.getUser()
    await db.from('shortlists').insert({ name: newName.trim(), owner_id: user!.id })
    setNewName('')
    load()
  }

  const removeCandidate = async (shortlistId: string, candidateId: string) => {
    await db.from('shortlist_candidates').delete().eq('shortlist_id', shortlistId).eq('candidate_id', candidateId)
    load()
  }

  return (
    <main>
      <h1>Shortlists</h1>
      <div className="row" style={{ margin: '12px 0' }}>
        <input className="input" style={{ maxWidth: 320 }} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ชื่อ shortlist ใหม่" />
        <button className="btn btn-primary" onClick={create}>สร้าง</button>
      </div>

      {data.length === 0 && <p className="faint">ยังไม่มี shortlist</p>}
      <div className="stack" style={{ gap: 12 }}>
        {data.map((sl) => (
          <div key={sl.id} id={sl.id} className="card shortlist-card" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>{sl.name}</h3>
            <div className="stack" style={{ gap: 4 }}>
              {(sl.shortlist_candidates ?? []).map((sc: any) => (
                <div key={sc.candidate_id} className="row">
                  <Link href={`/candidates/${sc.candidates?.id}`} style={{ fontWeight: 500 }}>
                    {sc.candidates?.full_name}
                  </Link>
                  <span className="muted">{sc.candidates?.headline}</span>
                  <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => removeCandidate(sl.id, sc.candidate_id)}>ลบ</button>
                </div>
              ))}
              {(sl.shortlist_candidates ?? []).length === 0 && <span className="faint">ยังไม่มีผู้สมัครในกลุ่มนี้</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Restyle the import page**

Replace the ENTIRE contents of `app/(app)/import/page.tsx` with:

```tsx
'use client'
import { useState } from 'react'

type Result = { imported: number; updated: number; errors: string[] }

export default function ImportPage() {
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setFileName(f.name)
    setResult(null)
    setCsv(await f.text())
  }

  const run = async () => {
    if (!csv || importing) return
    setImporting(true)
    setResult(null)
    const r = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'linkedin', csv }),
    })
    const json = await r.json()
    setImporting(false)
    setResult(json)
  }

  return (
    <main>
      <h1>นำเข้าข้อมูล LinkedIn (CSV)</h1>
      <p className="muted">อัปโหลดไฟล์ CSV ที่ export จาก PhantomBuster แล้วกดนำเข้า</p>

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="row">
          <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="btn btn-primary" onClick={run} disabled={!csv || importing}>
            {importing ? 'กำลังนำเข้า…' : 'นำเข้า'}
          </button>
        </div>
        {fileName && <p className="faint" style={{ fontSize: 13 }}>ไฟล์: {fileName}</p>}

        {result && (
          <div style={{ marginTop: 12 }}>
            <p>
              เพิ่มใหม่ <strong>{result.imported}</strong> · อัปเดต <strong>{result.updated}</strong> · ผิดพลาด <strong>{result.errors.length}</strong>
            </p>
            {result.errors.length > 0 && (
              <ul style={{ color: 'var(--bad)', fontSize: 13 }}>
                {result.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {result.imported + result.updated === 0 && result.errors.length === 0 && (
              <p className="faint">ไม่พบข้อมูลในไฟล์</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Restyle RoleSelect**

Replace the ENTIRE contents of `components/RoleSelect.tsx` with:

```tsx
'use client'
import { useState } from 'react'

export default function RoleSelect({
  userId,
  role,
}: {
  userId: string
  role: 'admin' | 'member'
}) {
  const [value, setValue] = useState(role)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const change = async (next: 'admin' | 'member') => {
    setSaving(true)
    setMsg('')
    setValue(next)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, role: next }),
    })
    setSaving(false)
    setMsg(res.ok ? 'บันทึกแล้ว' : 'ผิดพลาด')
  }

  return (
    <span className="row">
      <select className="select" style={{ width: 'auto' }} value={value} onChange={(e) => change(e.target.value as any)} disabled={saving}>
        <option value="member">member</option>
        <option value="admin">admin</option>
      </select>
      {msg && <span style={{ fontSize: 12, color: 'var(--ok)' }}>{msg}</span>}
    </span>
  )
}
```

- [ ] **Step 4: Restyle the admin page**

Replace the ENTIRE contents of `app/(app)/admin/users/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { getSession, hasRole } from '@/lib/auth/session'
import { getServerClient } from '@/lib/supabase/server'
import RoleSelect from '@/components/RoleSelect'

export const dynamic = 'force-dynamic'

export default async function AdminUsers() {
  const session = await getSession()
  if (!session || !hasRole(session.role, 'admin')) redirect('/dashboard')

  const { data: users } = await getServerClient()
    .from('profiles')
    .select('id, display_name, role, created_at')
    .order('created_at')

  return (
    <main>
      <h1>จัดการผู้ใช้</h1>
      <div className="list">
        {(users ?? []).map((u: any) => (
          <div key={u.id} className="list-row">
            <span style={{ flex: 1, fontWeight: 500 }}>{u.display_name ?? u.id}</span>
            <RoleSelect userId={u.id} role={u.role} />
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Restyle the settings page**

Replace the ENTIRE contents of `app/(app)/settings/page.tsx` with:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const db = getBrowserClient()
  const [defaultRequirement, setDefaultRequirement] = useState('')
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await db.auth.getUser()
      if (!user) return
      const { data } = await db.from('profiles').select('settings').eq('id', user.id).maybeSingle()
      setDefaultRequirement((data as any)?.settings?.defaultRequirement ?? '')
      setLoaded(true)
    })()
  }, [])

  const save = async () => {
    setMsg('')
    const { data: { user } } = await db.auth.getUser()
    if (!user) return
    const { error } = await db.from('profiles').update({ settings: { defaultRequirement } }).eq('id', user.id)
    setMsg(error ? error.message : 'บันทึกแล้ว')
  }

  const logout = async () => {
    await db.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <main style={{ maxWidth: 560 }}>
      <h1>ตั้งค่า</h1>

      <div className="card">
        <h3>ตำแหน่ง/สกิลที่มองหาบ่อย</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
          กรอกคุณสมบัติที่บริษัทคุณมองหาบ่อยที่สุด ระบบจะเติมข้อความนี้ให้อัตโนมัติในช่อง “ประเมินความเหมาะสม” ตอนเปิดดูโปรไฟล์ผู้สมัคร
        </p>
        <input
          className="input"
          value={defaultRequirement}
          onChange={(e) => setDefaultRequirement(e.target.value)}
          placeholder="เช่น Data scientist สาย Python ที่จบจากต่างประเทศ"
          disabled={!loaded}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={!loaded}>บันทึก</button>
          {msg && <span style={{ color: 'var(--ok)' }}>{msg}</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>บัญชี</h3>
        <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>ออกจากระบบบัญชีนี้บนอุปกรณ์นี้</p>
        <button className="btn" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={logout}>ออกจากระบบ</button>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Restyle login**

Replace the ENTIRE contents of `app/(auth)/login/page.tsx` with:

```tsx
'use client'
import { getBrowserClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  const submit = async () => {
    setMsg('')
    const { error } = await getBrowserClient().auth.signInWithPassword({ email, password: pw })
    if (error) return setMsg(error.message)
    window.location.href = '/dashboard'
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>เข้าสู่ระบบ</h1>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="รหัสผ่าน" />
        <button className="btn btn-primary" onClick={submit}>เข้าสู่ระบบ</button>
        {msg && <p style={{ color: 'var(--bad)', margin: 0 }}>{msg}</p>}
        <a href="/signup">ยังไม่มีบัญชี? สมัครสมาชิก</a>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Restyle signup**

Replace the ENTIRE contents of `app/(auth)/signup/page.tsx` with:

```tsx
'use client'
import { getBrowserClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')

  const submit = async () => {
    setMsg('')
    const { error } = await getBrowserClient().auth.signUp({ email, password: pw })
    if (error) return setMsg(error.message)
    window.location.href = '/dashboard'
  }

  return (
    <main className="auth-wrap">
      <div className="card stack">
        <h1 style={{ margin: 0 }}>สมัครสมาชิก</h1>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="อีเมล" />
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="รหัสผ่าน" />
        <button className="btn btn-primary" onClick={submit}>สมัคร</button>
        {msg && <p style={{ color: 'var(--bad)', margin: 0 }}>{msg}</p>}
        <a href="/login">มีบัญชีแล้ว? เข้าสู่ระบบ</a>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Restyle the landing page**

Replace the ENTIRE contents of `app/page.tsx` with:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getSession()
  if (session) redirect('/dashboard')

  return (
    <main className="auth-wrap" style={{ textAlign: 'center' }}>
      <h1 style={{ marginBottom: 8 }}>Skouth</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        ค้นหาและประเมินผู้สมัครคนไทยที่จบจากต่างประเทศ ด้วยการค้นหาแบบภาษาธรรมชาติและ AI
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link href="/login" className="btn btn-primary">เข้าสู่ระบบ</Link>
        <Link href="/signup" className="btn">สมัครสมาชิก</Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 9: Verify build + suite + visual**

Run: `npm run build`
Run: `npx vitest run`
Expected: build compiles; the full suite passes (no logic changed).
Visually check `/shortlists` (anchor jump from a dashboard card lands on the right one), `/import`, `/admin/users`, `/settings`, `/login`, `/signup`, `/` (landing).

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/shortlists/page.tsx" "app/(app)/import/page.tsx" "app/(app)/admin/users/page.tsx" components/RoleSelect.tsx "app/(app)/settings/page.tsx" "app/(auth)/login/page.tsx" "app/(auth)/signup/page.tsx" app/page.tsx
git commit -m "feat(ui): redesigned shortlists, import, admin, settings, auth pages"
```

---

## Self-Review

**Spec coverage:**
- Design tokens + reusable classes → U1 (globals.css).
- Root layout wiring + metadata "Skouth" → U1.
- Nav redesign → U2.
- Dashboard restyle + your-shortlists cards (query owner shortlists + count, link `/shortlists#<id>`) → U3.
- Search page + ScoreBadge (rounded-square) + FilterChips + CoverageStrip → U4.
- Candidate + Timeline + AnalyzePanel + AddToShortlist + Jobs (+JobMatches, CreateJobForm) → U5.
- Shortlists (anchor ids) + import + admin (+RoleSelect) + settings + auth → U6.
- No new deps, no logic change, Timeline test preserved, existing suite green → verification steps in every task.

**Placeholder scan:** none — every step is a complete file rewrite or exact CSS/commands.

**Type consistency:**
- `scoreClass(score) => 'ok'|'warn'|'bad'` defined in U4 (ScoreBadge), used by its own className; imported in the search page (U4) though only the default `ScoreBadge` is rendered.
- `ChipFilters` (skills, minYears, fieldOrDegree — no educationAbroad, already removed) consumed by FilterChips/CoverageStrip/search page (U4) — matches the current type.
- Class names used across tasks all exist in U1's globals.css (`.card .btn .btn-primary .input .textarea .select .chip .chip-x .pill .pill-on/off .badge-score--ok/warn/bad .list .list-row .avatar .tag .tag-accent .section-header .card-grid .shortlist-card .shortlist-icon .result-row .metric* .nav* .container .auth-wrap .stack .row .muted .faint`).
- `buildTimeline` unchanged in U5 (Timeline test stays green).

**Note for implementer:** every task is styling-only except U3 (adds the dashboard shortlist query) and U4 (adds the `scoreClass` unit test). No integration tests needed — verify by `npm run build` + the existing `vitest run` staying green + a visual pass. Run tasks in order (U1 foundation first; later tasks depend on its classes).
