# LitCal — Handoff Document

## Live App
**https://litcal.vercel.app**

## Repositories & Services

| Service | URL / Info |
|---|---|
| GitHub | https://github.com/dnbrlv45/litcal (private) |
| Vercel | https://vercel.com/dnbrlv45s-projects/litcal |
| Supabase | https://supabase.com/dashboard/project/ozbxvcrynseqygyknvnz |
| Clerk | https://dashboard.clerk.com |

---

## Stack

- **Framework**: Next.js 16.2.6 — App Router, Turbopack, TypeScript
- **Auth**: Clerk (`@clerk/nextjs` v7) — `proxy.ts` replaces `middleware.ts`
- **Database**: Supabase (PostgreSQL) + Prisma v7.8.0 (source of truth)
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Deployment**: Vercel (auto-deploys on push to `main`)

---

## Architecture

### Core Principle
**LitCal is the source of truth. Google Calendar is an output only.**
Events are always created/edited/deleted in Supabase first, then mirrored to Google. Never the reverse.

### Data Flow
```
User action → API route → Supabase (Event table) → Google Calendar push
```

### Database Schema (Supabase)
| Table | Purpose |
|---|---|
| `User` | Shadow record of Clerk user. Created lazily on first API call. |
| `UserCalendarConnection` | OAuth tokens per provider (Google, future: Outlook, Apple) |
| `Event` | All calendar events — source of truth |
| `GoogleCalendarSync` | Tracks sync state between LitCal events and Google Calendar copies |

### Prisma v7 Config
Prisma v7 removed `url`/`directUrl` from `schema.prisma`. Connection URLs now live in:
- **`prisma.config.ts`** — CLI/migrations use `DIRECT_URL` (session pooler, port 5432)
- **`lib/prisma.ts`** — Runtime uses `DATABASE_URL` via `PrismaPg` adapter (transaction pooler, port 6543)

---

## Two-Action Setup Required After Deployment

### 1. Google OAuth — Add Production Redirect URI
Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth client → **Authorized redirect URIs** → add:
```
https://litcal.vercel.app/api/auth/google/callback
```

### 2. Clerk — Add Production Domain
Go to [Clerk Dashboard](https://dashboard.clerk.com) → your app → **Domains** → add:
```
litcal.vercel.app
```

Until these are done, sign-in and Google Calendar connect will redirect to `localhost`.

---

## Environment Variables

All set in Vercel. For local dev, copy to `.env.local`:

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback  # change for prod

# Supabase / Prisma
DATABASE_URL=postgresql://postgres.ozbxvcrynseqygyknvnz:...@aws-1-us-west-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.ozbxvcrynseqygyknvnz:...@aws-1-us-west-1.pooler.supabase.com:5432/postgres

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000  # change for prod
```

---

## Key Files

```
proxy.ts                              # Clerk auth proxy (replaces middleware.ts)
prisma.config.ts                      # Prisma v7 CLI config (loads .env via dotenv)
prisma/schema.prisma                  # Database schema
prisma/migrations/0001_init/          # Baseline migration (tables created via Supabase MCP)
lib/prisma.ts                         # PrismaClient singleton with PrismaPg adapter
lib/google-calendar.ts                # Google Calendar API helpers

app/api/auth/google/route.ts          # Starts OAuth flow
app/api/auth/google/callback/route.ts # Handles OAuth callback, stores refresh token in DB
app/api/auth/google/disconnect/route.ts # Soft-deletes UserCalendarConnection
app/api/calendar/events/route.ts      # GET (list) + POST (create) events
app/api/calendar/events/[id]/route.ts # PATCH (edit) + DELETE events
app/api/calendar/debug/route.ts       # Debug endpoint — tests Google token/calendar

components/calendar/CalendarView.tsx  # Main calendar shell — month/week/day switcher
components/calendar/MonthView.tsx     # Month grid
components/calendar/WeekView.tsx      # Week grid (7-column)
components/calendar/DayView.tsx       # Day column view
components/calendar/EventModal.tsx    # Create event modal
components/calendar/EventDetailModal.tsx # View/edit/delete event modal
components/nav/TopNav.tsx             # Top navigation bar
components/settings/CalendarConnections.tsx # Google/Outlook/Apple connect UI
```

---

## Google Calendar Sync

- On connect: OAuth token stored in `UserCalendarConnection`. On first event push, a dedicated **"LitCal"** calendar is created in the user's Google account and its ID stored in `providerCalendarId`.
- On event create: Event saved to Supabase → pushed to Google → `GoogleCalendarSync` record created.
- On event delete: Deleted from Supabase (cascades to `GoogleCalendarSync`) → mirrored to Google.
- On disconnect: `isActive = false`, `disconnectedAt` set (soft delete, row preserved for audit).
- On reconnect: `providerCalendarId` cleared — forces a fresh LitCal calendar lookup on next push.

---

## Running Locally

```bash
cd ~/Desktop/LitCal
npm run dev
# → http://localhost:3000
```

After first run, disconnect and reconnect Google Calendar in Settings → Calendar to migrate the OAuth token from the old Clerk metadata storage into Supabase.

---

## Planned Next Features (not yet built)

- Cases management (schema stubs already in `schema.prisma` comments)
- Attorney assignments + conflict detection
- Inbox processing (email → event/case)
- Outlook + Apple Calendar sync
- AI features (deadline detection, scheduling suggestions)
- Organizations / multi-tenant (schema stubs ready)
