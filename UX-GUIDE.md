# Global UX & Design Instructions

These rules apply to every project. They are extracted from the John Web Dev
reference (https://github.com/Valx01P/john-web-dev) and apply to any web UI,
whether the stack is Next.js + Tailwind, vanilla HTML/CSS, or anything else.

When the user asks for "design", "UI", "layout", "styling", or anything
user-facing, follow these defaults unless the user overrides them.

---

## Core UX principles

- **Compact UX over long scrolls.** Reach for dropdowns, tabs, popovers, and
  modals before stacking sections vertically. If a section is repeating the
  same shape (settings, related views, filter sets), use tabs.
- **Take inspiration from modern UIs.** Vercel (monochrome + vivid accent,
  sharp typography, subtle gradients), Linear (keyboard-first, micro-
  interactions), Robinhood (generous whitespace, clean financial layouts),
  Reddit (density, dark mode, threaded content). When in doubt, copy their
  layout patterns rather than inventing.
- **Confirm destructive actions.** Any delete / drop / overwrite / permanent
  action needs an "Are you sure?" confirmation step. In React: use shadcn/ui
  `AlertDialog`. In vanilla: a `<dialog>` element or a custom modal — never
  a `window.confirm()` which is jarring.
- **Brand-aligned visuals only.** No random stock photos. Use npm icon
  packages (`lucide-react`, `@iconify/react`), custom SVGs with
  `currentColor`, or curated image sources. Gradients are fine but must use
  the brand palette — never random colors.
- **Respect reduced motion.** Wrap non-essential animations in
  `if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;`.

---

## Theming: 3 colors + dark mode via CSS variables

One source of truth. Define **3 brand colors** + bg/fg in CSS variables.
Changing them re-skins the whole app.

```css
:root {
  --primary:   #0ea5e9;   /* main brand action color */
  --secondary: #f43f5e;   /* accent / contrast */
  --neutral:   #64748b;   /* muted text, borders */

  --bg: #ffffff;
  --fg: #0f172a;
}

.dark, [data-theme="dark"] {
  --bg: #0a0a0a;
  --fg: #e5e7eb;
}

html, body { background: var(--bg); color: var(--fg); }
```

In Tailwind projects, wire the vars into `tailwind.config.js` so utility
classes like `bg-primary`, `text-secondary` work:

```js
theme: { extend: { colors: {
  primary: "var(--primary)", secondary: "var(--secondary)",
  neutral: "var(--neutral)", bg: "var(--bg)", fg: "var(--fg)",
}}}
```

**Dark mode default on.** Toggle via `document.documentElement.classList`
and persist to `localStorage`. Prevent the white flash by setting the class
in an inline `<script>` in `<head>` before the framework hydrates.

**Never use more than 3 saturated colors in one view.** Grays and tonal
shifts of the bg don't count. If a design has 10 colored badges, unify them
to a single accent tint (`rgba(--accent, 0.15)` background + accent text).

---

## Layout & responsive

- **Mobile-first.** Default classes for mobile, prefixed (`md:`, `lg:`) for
  larger.
- Tailwind breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.
- Use **`clamp(min, preferred, max)`** for fluid type and spacing — kills
  most media queries:
  ```html
  <h1 style="font-size: clamp(2rem, 5vw, 4.5rem);">Heading</h1>
  <section style="padding: clamp(1rem, 5vw, 4rem);">…</section>
  ```
- Grid for galleries: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`.

---

## Compact UX patterns (use these before adding scroll)

| Need | Pattern | Notes |
|---|---|---|
| Account / settings menu | Dropdown menu | Click-triggered, anchored |
| Switch between related views | Tabs | Replaces multiple pages or long scroll |
| Filter / share / info click | Popover | Lightweight, click-outside dismisses |
| Form / detail view | Modal / Dialog | |
| **Destructive confirm** | AlertDialog | "Are you sure?" — required for deletes |
| Mobile menu / cart / side panel | Sheet (slide-in) | |

In React projects, install shadcn/ui:
```bash
npx shadcn@latest init
npx shadcn@latest add dropdown-menu tabs popover dialog alert-dialog sheet
```

---

## Visuals

- **Icons:** `lucide-react` (primary), `@iconify/react` (long tail),
  `simple-icons` (brand logos).
- **SVGs:** paste inline, use `currentColor` so theme colors flow through.
- **Images:** in Next.js, always `next/image` (auto WebP/AVIF + lazy). For
  placeholders during dev: `https://picsum.photos/seed/X/800/600` or
  `https://placehold.co/800x600`.
- **3D (only if it adds real value):** React Three Fiber + Drei. Free `.glb`
  models from Poly Haven (CC0).
- **Gradients** (brand-aligned, used intelligently):
  ```css
  /* Vercel-style radial spotlight on dark */
  background: radial-gradient(circle at 50% 0%, var(--primary) 0%, transparent 50%);

  /* Conic orb (Linear/Stripe vibe) */
  background: conic-gradient(from 180deg at 50% 50%, var(--primary), var(--secondary), var(--primary));
  filter: blur(60px); opacity: 0.4;

  /* Mesh gradient (soft, modern) */
  background:
    radial-gradient(at 20% 20%, var(--primary) 0, transparent 50%),
    radial-gradient(at 80% 80%, var(--secondary) 0, transparent 50%);
  ```
  Rules: use for backgrounds/accents, never long text. On dark themes,
  prefer radial gradients with high blur and low opacity behind content.

---

## Animation

- **One library only.** Default to GSAP (`gsap` + `@gsap/react`'s `useGSAP`)
  for sequenced or scroll-driven animations.
- Reserve plain CSS / Tailwind transitions (`transition-all hover:scale-105`)
  for tiny hover/focus states.
- Always respect `prefers-reduced-motion`.

---

## Typography & fonts

- In Next.js: `next/font/google` or `next/font/local` (auto-optimized,
  zero layout shift).
- Local fonts: prefer `.woff2` (~50% smaller than `.woff`). Convert with
  Transfonter (https://transfonter.org/).
- Default to one display font + one body font, no more.

---

## Favicons & metadata (don't ship without them)

- Every site needs: `favicon.svg` (or `.ico`), `apple-touch-icon.png`
  (180×180), and an Open Graph image (1200×630) for social previews.
- In Next.js App Router, drop these in `src/app/` and they're auto-wired.
- In other stacks, add `<link rel="icon">`, `<link rel="apple-touch-icon">`,
  and `<meta property="og:image">` tags explicitly.

---

## Gotchas to watch for

- **`{0 && <X />}` renders `0`** in JSX — use `count > 0 && …`.
- **Browser APIs in render** (`window`, `localStorage`, `IntersectionObserver`)
  must go in `useEffect` or event handlers, not the render body. Server-side
  rendering breaks otherwise.
- **Dark mode flash** on load → set the `dark` class via inline script in
  `<head>` before framework hydration.
- **Hydration mismatch** from `Date.now()` / `Math.random()` /
  `localStorage` in render → move to `useEffect`.

---

## Legal pages — only when actually needed

Add `/terms`, `/privacy`, `/cookies` only when the site:
- has user accounts / auth
- collects form data, emails, or any PII
- takes payments
- uses non-essential cookies or third-party tracking

A pure marketing or portfolio site does not need them. Use Termly or a
lawyer for the text — never write your own from scratch.

---

## When to ignore this file

If the user explicitly chooses a different convention (e.g. "no Tailwind",
"use Bootstrap", "stick with vanilla CSS"), follow their preference. These
defaults exist for greenfield decisions, not to override stated choices.
