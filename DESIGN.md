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
Keyed by **category** (`getEventCategory`), not subtype — every hearing/conference type and
all their subtypes (CMC, TSC, OSC, MSC, …) share the one Hearing color so the calendar reads
calmly. These six are the legend. Utilities: `bg-event-hearing`, etc.

| Legend | Covers | Token | Hex |
|--------|--------|-------|-----|
| Deadline 🔴 | DEADLINE | `--event-deadline` | `#8c3330` |
| Hearing 🟠 | HEARING, CONFERENCE, COURT_CALL, CMC, and all hearing subtypes | `--event-hearing` | `#b0642a` |
| Deposition 🟣 | DEPOSITION | `--event-deposition` | `#5a4a8a` |
| Trial 🟢 | TRIAL | `--event-trial` | `#2f6b57` |
| Mediation 🟣 | MEDIATION | `--event-mediation` | `#6a4a8a` |
| Meeting / Other ⚫ | MEETING, REMINDER, OTHER | `--event-other` | `#55606f` |

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

## Where it's wired

The redesign is live, so these are the source-of-truth spots to change:

- **Event colors** — [`lib/google-calendar.ts`](lib/google-calendar.ts): `eventColors()` resolves
  a chip's color from its `EventType` via the `--event-*` tokens. Colors are grouped by category
  (see `getEventCategory` in [`lib/google-calendar-payload.ts`](lib/google-calendar-payload.ts)),
  so all hearing/conference subtypes share the Hearing color. To recolor, edit the `--event-*`
  values in `globals.css`; to regroup, change the `fill(...)` mapping in `EVENT_TYPE_COLORS`.
- **Legend** — the category legend row lives in
  [`components/calendar/CalendarView.tsx`](components/calendar/CalendarView.tsx) (just below the
  filter bar) and must stay in sync with the six categories above.
- **Dark sidebar** — [`components/nav/Sidebar.tsx`](components/nav/Sidebar.tsx) plus the Inbox and
  Deadlines nav items, using `bg-nav` / `text-nav-foreground` / `bg-nav-accent`.
- **Serif headings** — Fraunces is loaded in [`app/layout.tsx`](app/layout.tsx) and
  `--font-heading` points at it; apply `font-heading` to page/date titles.
