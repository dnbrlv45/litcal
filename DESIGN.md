# LitCal Design System

The visual language for LitCal, codified from the calendar redesign. Tokens live in
[`app/globals.css`](app/globals.css) (Tailwind v4 `@theme` + `:root`); this doc is the
human reference for what they mean and how to use them.

> **Status note.** Some of this system is a *target* the shipped app hasn't fully adopted
> yet. The token layer is in place and safe (nothing re-renders until a component opts in).
> The three deltas from the current live UI are called out under **Not yet wired** at the end.

---

## Typography

| Role | Family | Weights | Token |
|------|--------|---------|-------|
| Body / UI | **Plus Jakarta Sans** | 400, 500, 600, 700, 800 | `--font-sans` |
| Display headings | **Serif** (page titles like "June 28 – July 4, 2026") | 500–600 | `--font-heading` → *currently sans; see below* |
| Mono | SF Mono / Roboto Mono | 400 | `--font-mono` |

The redesign uses a **serif** for large date/page headings against the sans body. To wire it,
add a display face in `app/layout.tsx` and point `--font-heading` at it:

```ts
import { Fraunces } from "next/font/google"; // or Source Serif 4 / Lora
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], weight: ["500","600"] });
// then in globals.css @theme:  --font-heading: var(--font-display);
```

Use `font-heading` for h1/page titles; everything else stays `font-sans`.

---

## Color

### Base surfaces & neutrals (unchanged, already in `:root`)
Cool blue-gray neutrals with a **teal** accent. Key tokens: `--background`, `--foreground`,
`--card`, `--primary` (deep slate-blue), `--accent` (pale teal), `--muted`, `--border`,
`--ring` (teal). Selection highlight is teal. These carry the app's calm, professional base.

### Brand
| Token | Hex | Use |
|-------|-----|-----|
| `--brand-gold` / `bg-brand-gold` | `#caa14e` | Logo tile, brand accents, highlights |

### Dark navigation rail
The sidebar is a near-black rail with light text.

| Token | Hex | Use |
|-------|-----|-----|
| `--nav` / `bg-nav` | `#1c1c1f` | Sidebar background |
| `--nav-foreground` / `text-nav-foreground` | `#d6d6da` | Nav labels |
| `--nav-muted-foreground` | `#8a8a90` | Section labels ("WORKSPACE"), inactive icons |
| `--nav-accent` / `bg-nav-accent` | `#2c2c30` | Hover/active item, "Ask LitCal" button |
| `--nav-border` | `#35353a` | Dividers within the rail |

### Event palette
Solid, muted **jewel** fills with white text (`--event-foreground` / `text-event-foreground`).
Keyed by the legend subtype, with base-type fallbacks. Utilities: `bg-event-cmc`, etc.

| Legend | Meaning | Token | Hex |
|--------|---------|-------|-----|
| CMC 🔵 | Case Management Conference | `--event-cmc` | `#3b5b92` |
| TSC 🟡 | Trial Setting Conference | `--event-tsc` | `#b0851f` |
| OSC 🔴 | Order to Show Cause | `--event-osc` | `#8c3330` |
| Deposition 🟣 | Deposition | `--event-deposition` | `#5a4a8a` |
| — | Trial | `--event-trial` | `#2f6b57` |
| — | Hearing | `--event-hearing` | `#b0642a` |
| — | Mediation | `--event-mediation` | `#6a4a8a` |
| — | Other / fallback | `--event-other` | `#55606f` |

---

## Radius & spacing

Base `--radius: 0.5rem`, scaled: `sm 0.3rem · md 0.4rem · lg 0.5rem · xl 0.7rem · 2xl 0.9rem`.
Event blocks and cards use `lg`; pills/filters and the logo tile use `xl`+. Calendar grid uses
1px `--border` hairlines. Comfortable padding: event chips `px-2.5 py-2`, cards `p-4`+.

## Elevation

`.panel-shadow` — soft, low, tinted with `--foreground` (`0 16px 42px` at ~8% opacity). Use for
floating panels/modals. Event chips use a lighter `shadow-sm` that lifts on hover.

---

## Component patterns

- **Event chip** (week/day/month): solid `bg-event-*` fill, `text-event-foreground`, `rounded-lg`,
  small time label at 80% opacity above a `font-semibold` title, optional location/link line.
  Hover: `-translate-y-0.5` + `shadow-md`.
- **Filter pills** ("All Attorneys ▾"): white, `border`, `rounded-xl`, muted label.
- **Primary button** ("+ New Event"): `bg-primary` deep slate, white text, `rounded-lg`.
- **Segmented control** (Day/Week/Month/Team): pill group, active segment filled.
- **Sidebar item**: icon + label; active/hover = `bg-nav-accent`; count badges in `brand-gold`
  or a red dot for alerts.

---

## Adopting the tokens

1. **Event colors** — replace the light-chip map `EVENT_TYPE_COLORS` in
   [`lib/google-calendar.ts`](lib/google-calendar.ts) (currently `bg-*-50` + dark text; Deposition
   is cyan) with the solid `bg-event-*` + `text-event-foreground` tokens above, and key it by
   subtype (CMC/TSC/OSC) rather than base type only.
2. **Dark sidebar** — restyle [`components/nav/Sidebar.tsx`](components/nav/Sidebar.tsx) with
   `bg-nav` / `text-nav-foreground` / `bg-nav-accent` (today it's light).
3. **Serif headings** — load a display face and repoint `--font-heading` (snippet above).

## Not yet wired (deltas from the live UI)

The shipped app still uses a **light sidebar**, **sans-serif headings**, and **light-tinted event
chips keyed by base type**. The tokens for the redesign exist; the three changes above turn them on.
