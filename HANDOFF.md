# LitCal — Handoff Document

## Live App
**https://litcal.vercel.app**

## Repositories & Services

| Service | URL / Info |
|---|---|
| GitHub | https://github.com/dnbrlv45/litcal (private) |
| Vercel | https://vercel.com/dnbrlv45s-projects/litcal |
| Supabase | https://supabase.com/dashboard/project/ozbxvcrynseqygyknvnz |

---

## Stack

- **Framework**: Next.js 16.2.6 — App Router, Turbopack, TypeScript
- **Auth**: First-party LitCal Google OAuth + database-backed sessions
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

### Authentication Flow
```
Sign in button → Google OAuth → /api/auth/google/sign-in/callback
→ upsert User → create AuthSession → set litcal_session cookie
```

LitCal no longer uses Clerk. The middleware-style gate in `proxy.ts` only checks for the `litcal_session` cookie before allowing protected pages/API routes through. Server routes still validate the session against the `AuthSession` table through `lib/auth.ts`.

### Database Schema (Supabase)
| Table | Purpose |
|---|---|
| `User` | LitCal account created/updated from Google identity (`googleSub`, email, name). |
| `AuthSession` | Hashed opaque session tokens for the `litcal_session` cookie. |
| `Workspace` | First-party LitCal team/workspace. |
| `WorkspaceMember` | Workspace membership and role. |
| `WorkspaceInvitation` | Pending team invites by email. Auto-accepted when that email signs in. |
| `UserCalendarConnection` | OAuth tokens per provider (Google, future: Outlook, Apple) |
| `Event` | All calendar events — source of truth |
| `GoogleCalendarSync` | Tracks sync state between LitCal events and Google Calendar copies |

### Prisma v7 Config
Prisma v7 removed `url`/`directUrl` from `schema.prisma`. Connection URLs now live in:
- **`prisma.config.ts`** — CLI/migrations use `DIRECT_URL` (session pooler, port 5432)
- **`lib/prisma.ts`** — Runtime uses `DATABASE_URL` via `PrismaPg` adapter (transaction pooler, port 6543)

---

## Google / Vercel Setup Required

### 1. OAuth Client Redirect URIs
Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → the OAuth client matching Vercel's `GOOGLE_CLIENT_ID` → **Authorized redirect URIs** → add:
```
https://litcal.vercel.app/api/auth/google/sign-in/callback
https://litcal.vercel.app/api/auth/google/callback
```

### 2. OAuth Client JavaScript Origin
Under **Authorized JavaScript origins**, add:
```
https://litcal.vercel.app
```

### 3. Enable APIs
Enable both APIs in Google Cloud:
- Google Calendar API
- Gmail API

### 4. OAuth Consent Scopes
The Google Calendar reconnect flow requests:
```
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/gmail.send
```

`gmail.send` is a sensitive scope. For testing, keep the app in **Testing** mode and add `dnbrlv45@gmail.com` as a test user. For broader public use, Google may require OAuth verification.

### 5. Vercel Environment
Vercel Production has `GOOGLE_AUTH_REDIRECT_URI` set to:
```
https://litcal.vercel.app/api/auth/google/sign-in/callback
```

Production was redeployed after this env var was added.

---

## Environment Variables

All set in Vercel. For local dev, copy to `.env.local`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_AUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/sign-in/callback
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Supabase / Prisma
DATABASE_URL=postgresql://postgres.ozbxvcrynseqygyknvnz:...@aws-1-us-west-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.ozbxvcrynseqygyknvnz:...@aws-1-us-west-1.pooler.supabase.com:5432/postgres

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Key Files

```
proxy.ts                              # LitCal session-cookie gate
prisma.config.ts                      # Prisma v7 CLI config (loads .env via dotenv)
prisma/schema.prisma                  # Database schema
prisma/migrations/0001_init/          # Baseline migration (tables created via Supabase MCP)
prisma/migrations/0002_litcal_workspaces/ # Workspace/team tables
prisma/migrations/0003_workspace_invitations/ # Pending invitations
prisma/migrations/0004_litcal_google_auth/ # AuthSession + User.googleSub
lib/auth.ts                           # Google identity upsert + LitCal session helpers
lib/prisma.ts                         # PrismaClient singleton with PrismaPg adapter
lib/google-calendar.ts                # Google Calendar API helpers
lib/google-mail.ts                    # Gmail API helper for branded HTML team invites

app/api/auth/google/sign-in/route.ts  # Starts first-party Google sign-in
app/api/auth/google/sign-in/callback/route.ts # Handles sign-in callback, creates session
app/api/auth/sign-out/route.ts        # Clears LitCal session

app/api/auth/google/route.ts          # Starts Google Calendar/Gmail connect flow
app/api/auth/google/callback/route.ts # Handles connect callback, stores refresh token in DB
app/api/auth/google/disconnect/route.ts # Soft-deletes UserCalendarConnection
app/api/calendar/events/route.ts      # GET (list) + POST (create) events
app/api/calendar/events/[id]/route.ts # PATCH (edit) + DELETE events
app/api/calendar/debug/route.ts       # Debug endpoint — tests Google token/calendar
app/api/workspaces/current/route.ts   # Current team read/update
app/api/workspaces/members/route.ts   # Add member/create invite/send invite email

components/calendar/CalendarView.tsx  # Main calendar shell — month/week/day switcher
components/calendar/MonthView.tsx     # Month grid
components/calendar/WeekView.tsx      # Week grid (7-column)
components/calendar/DayView.tsx       # Day column view
components/calendar/EventModal.tsx    # Create event modal
components/calendar/EventDetailModal.tsx # View/edit/delete event modal
components/nav/TopNav.tsx             # Top navigation bar
components/settings/CalendarConnections.tsx # Google/Outlook/Apple connect UI
components/auth/LitCalGoogleAuth.tsx  # Custom LitCal Google sign-in/sign-up UI
app/settings/team/TeamClient.tsx      # Team members, pending invites, invite form
```

---

## Recent Changes Completed

### Frontend polish / branding
- Replaced the old "V" branding with LitCal branding and logo asset.
- Removed purple-heavy AI-style colors and moved to a more professional slate/teal palette.
- Removed fake sidebar counts for Tasks and Inbox.

### Clerk removed
- Removed Clerk provider, Clerk middleware, Clerk callback page, and Clerk packages.
- Added first-party Google sign-in and sign-out routes.
- Added LitCal-owned `AuthSession` persistence.
- Updated all protected pages and API routes to use `getCurrentUser()` / `requireUser()`.

### First-party teams
- Added `Workspace`, `WorkspaceMember`, and `WorkspaceInvitation`.
- Team invites can be created before the recipient has an account.
- Pending invites are accepted automatically when a user signs in with the invited email.

### Gmail-powered invite emails
- Added `lib/google-mail.ts`.
- Team invite creation now attempts to send a branded HTML email through the inviter's connected Gmail account.
- If Google is not connected or Gmail permissions are missing, the invite is still created and the UI tells the admin to reconnect Google.
- `components/settings/CalendarConnections.tsx` now includes a **Reconnect** button so users can grant the new `gmail.send` scope.

---

## Google Calendar Sync

- On connect: OAuth token stored in `UserCalendarConnection`. On first event push, a dedicated **"LitCal"** calendar is created in the user's Google account and its ID stored in `providerCalendarId`.
- On event create: Event saved to Supabase → pushed to Google → `GoogleCalendarSync` record created.
- On event delete: Deleted from Supabase (cascades to `GoogleCalendarSync`) → mirrored to Google.
- On disconnect: `isActive = false`, `disconnectedAt` set (soft delete, row preserved for audit).
- On reconnect: `providerCalendarId` cleared — forces a fresh LitCal calendar lookup on next push.
- The same reconnect flow now also requests Gmail send permission for invite emails.

---

## Team Invite Email Flow

1. Admin enters an email on Settings → Team.
2. `/api/workspaces/members` creates or updates a `WorkspaceInvitation`.
3. LitCal attempts to send a branded HTML email through Gmail API using the admin's `UserCalendarConnection.refreshToken`.
4. Recipient clicks the invite link and signs in with Google.
5. `getCurrentWorkspace()` auto-accepts any pending invitation matching the user's email.

Important limitations:
- Gmail sending only works after the admin reconnects Google with the new `gmail.send` scope.
- Gmail API must be enabled in Google Cloud.
- Google OAuth testing/verification rules apply to `gmail.send`.

---

## Running Locally

```bash
cd ~/Desktop/LitCal
npm run dev
# → http://localhost:3000
```

For local Google OAuth, add these redirect URIs to the same OAuth client:
```
http://localhost:3000/api/auth/google/sign-in/callback
http://localhost:3000/api/auth/google/callback
```

---

## Important Operational Notes

- The production database migration `0004_litcal_google_auth` has been applied successfully.
- Vercel production was manually redeployed after `GOOGLE_AUTH_REDIRECT_URI` was added.
- No local app server was run during the Clerk removal/Gmail invite work per owner instruction.
- Remote Vercel build passed after the Clerk removal deployment.
- Latest relevant commits:
  - `4a05ac2` — Replace Clerk with LitCal Google auth
  - `2f3d971` — Send team invites with Gmail

---

## Planned Next Features / Follow-ups

- Attorney assignments + conflict detection
- Inbox processing (email → event/case)
- Outlook + Apple Calendar sync
- AI features (deadline detection, scheduling suggestions)
- Remove old Clerk env vars from Vercel once confirmed unused
- Add better invite status detail in UI, e.g. "email sent", "Gmail permission missing", or "Google not connected"
