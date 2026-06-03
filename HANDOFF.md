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

- **Framework**: Next.js 16 — App Router, Turbopack, TypeScript
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

LitCal no longer uses Clerk. The middleware-style gate in `proxy.ts` only checks for the `litcal_session` cookie. Server routes validate the session against `AuthSession` via `lib/auth.ts`.

### Database Schema (Supabase)

| Table | Purpose |
|---|---|
| `User` | LitCal account created/updated from Google identity. |
| `AuthSession` | Hashed session tokens for the `litcal_session` cookie. |
| `Workspace` | First-party LitCal team. |
| `WorkspaceMember` | Membership, workspace role, and job title (`ATTORNEY / PARALEGAL / ASSISTANT / STAFF`). |
| `WorkspaceInvitation` | Pending team invites by email. Auto-accepted on sign-in. |
| `UserCalendarConnection` | OAuth tokens per provider. Google row stores both `refreshToken` (calendar) and `gmailRefreshToken` (Gmail send). |
| `Case` | PI case — title, number, county, court, case type, defense info, assignment IDs, status. |
| `CaseParty` | Named parties (plaintiff, defendant, etc.) attached to a case. |
| `Event` | All calendar events — source of truth. Inherits `assignedAttorneyId` from linked case on creation. |
| `GoogleCalendarSync` | 1:1 with Event. Tracks sync state to Google Calendar. |

### Prisma v7 Config
Prisma v7 removed `url`/`directUrl` from `schema.prisma`. Connection URLs live in:
- **`prisma.config.ts`** — CLI/migrations use `DIRECT_URL` (session pooler, port 5432)
- **`lib/prisma.ts`** — Runtime uses `DATABASE_URL` via `PrismaPg` adapter (transaction pooler, port 6543)

---

## Google / Vercel Setup Required

### 1. OAuth Client Redirect URIs
Go to Google Cloud Console → APIs & Services → Credentials → the OAuth client → **Authorized redirect URIs** → ensure all four are present:
```
https://litcal.vercel.app/api/auth/google/sign-in/callback
https://litcal.vercel.app/api/auth/google/callback
https://litcal.vercel.app/api/auth/google/gmail/callback
```
And for local dev:
```
http://localhost:3000/api/auth/google/sign-in/callback
http://localhost:3000/api/auth/google/callback
http://localhost:3000/api/auth/google/gmail/callback
```

### 2. OAuth Client JavaScript Origin
```
https://litcal.vercel.app
```

### 3. Enable APIs
- Google Calendar API
- Gmail API

### 4. OAuth Consent Scopes
Two separate OAuth flows — each requests only what it needs:

| Flow | Scope | Redirect |
|---|---|---|
| Calendar | `https://www.googleapis.com/auth/calendar` | `/api/auth/google/callback` |
| Gmail | `https://www.googleapis.com/auth/gmail.send` | `/api/auth/google/gmail/callback` |

`gmail.send` is a sensitive scope. Keep the app in **Testing** mode and add test users for development. Public use requires OAuth verification from Google.

---

## Environment Variables

All set in Vercel. For local dev, copy to `.env.local`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_AUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/sign-in/callback
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
# GOOGLE_GMAIL_REDIRECT_URI is optional — code constructs it from NEXT_PUBLIC_APP_URL if unset

# Supabase / Prisma
DATABASE_URL=postgresql://postgres.ozbxvcrynseqygyknvnz:...@aws-1-us-west-1.pooler.supabase.com:6543/postgres
DIRECT_URL=postgresql://postgres.ozbxvcrynseqygyknvnz:...@aws-1-us-west-1.pooler.supabase.com:5432/postgres

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Key Files

```
proxy.ts                                        # Session-cookie gate (middleware)
prisma.config.ts                                # Prisma v7 CLI config
prisma/schema.prisma                            # Full database schema
prisma/migrations/                              # Applied migrations 0001–0009

lib/auth.ts                                     # Google identity upsert + session helpers
lib/prisma.ts                                   # PrismaClient singleton with PrismaPg adapter
lib/google-calendar.ts                          # Google Calendar API helpers
lib/google-mail.ts                              # Gmail API — sends branded team invite emails
lib/workspaces.ts                               # getCurrentWorkspace(), canManageWorkspace()

app/api/auth/google/sign-in/route.ts            # Starts Google sign-in OAuth
app/api/auth/google/sign-in/callback/route.ts   # Completes sign-in, creates session
app/api/auth/sign-out/route.ts                  # Clears session cookie

app/api/auth/google/route.ts                    # Starts Google Calendar connect (calendar scope only)
app/api/auth/google/callback/route.ts           # Calendar connect callback — stores refreshToken
app/api/auth/google/disconnect/route.ts         # Disconnects Google Calendar

app/api/auth/google/gmail/route.ts              # Starts Gmail connect (gmail.send scope)
app/api/auth/google/gmail/callback/route.ts     # Gmail connect callback — stores gmailRefreshToken
app/api/auth/google/gmail/disconnect/route.ts   # Disconnects Gmail

app/api/calendar/events/route.ts                # GET (list) + POST (create + Google push) events
app/api/calendar/events/[id]/route.ts           # PATCH + DELETE events
app/api/cases/route.ts                          # GET (list) + POST (create) cases
app/api/cases/[id]/route.ts                     # GET + PATCH + DELETE cases
app/api/workspaces/current/route.ts             # GET + PATCH + DELETE workspace
app/api/workspaces/members/route.ts             # GET (list) + POST (add/invite) members
app/api/workspaces/members/[id]/route.ts        # PATCH (set jobTitle) + DELETE (remove) member
app/api/workspaces/invitations/[id]/route.ts    # DELETE (cancel) pending invitation

components/calendar/CalendarView.tsx            # Main calendar shell
components/calendar/EventModal.tsx              # Create event modal
components/calendar/EventDetailModal.tsx        # View/edit/delete event
components/settings/CalendarConnections.tsx     # Google Calendar + Gmail connect UI (separate rows)
components/auth/LitCalGoogleAuth.tsx            # Google sign-in/sign-up UI

app/cases/CasesClient.tsx                       # Case list page
app/cases/CreateCaseModal.tsx                   # Create case modal
app/cases/[id]/CaseDetailClient.tsx             # Case detail — info, assignments, events
app/settings/team/TeamClient.tsx                # Team management (admin view + member read-only view)
app/settings/calendar/page.tsx                  # Calendar/integrations settings page
```

---

## Migrations

| # | Name | What it does |
|---|---|---|
| 0001 | `init` | Baseline — all core tables |
| 0002 | `litcal_workspaces` | Workspace + WorkspaceMember |
| 0003 | `workspace_invitations` | WorkspaceInvitation |
| 0004 | `litcal_google_auth` | AuthSession, User.googleSub |
| 0005 | `microsoft_auth` | User.microsoftSub (unused UI, schema only) |
| 0006 | `pi_case_fields` | County, defendant/firm/attorney, PI CaseType enum |
| 0007 | `attorney_assignments` | assignedAttorneyId/ParalegalId/AssistantId on Case; assignedAttorneyId on Event |
| 0008 | `job_titles` | JobTitle enum + WorkspaceMember.jobTitle |
| 0009 | `gmail_token` | gmailRefreshToken + gmailConnectedAt on UserCalendarConnection |

---

## Feature Summary

### Cases
- Create, view, edit, delete PI cases
- Fields: name, case number, county, court, case type (PI-specific), defendant, defense firm, defense attorney, notes
- Case types: Auto Accident, Slip & Fall, Government Claim, Dog Bite, Premises Liability, Medical Malpractice, Wrongful Death, Product Liability, Other
- Statuses: Active, Pending, Closed, Archived
- Closing/archiving a case deletes all its calendar events (DB + Google Calendar)
- Cannot create events on closed/archived cases

### Attorney Assignments
- Cases have `assignedAttorneyId`, `assignedParalegalId`, `assignedAssistantId`
- Inline dropdowns on case detail — always visible, save on change
- Only available when case status is Active
- Each dropdown only shows workspace members with the matching job title
- Events inherit `assignedAttorneyId` from the linked case on creation

### Calendar
- Month/week/day views
- Create events: type, date, time (defaults 9 AM, auto-adjusts end, prevents impossible times), location, notes, case link
- Events sync to Google Calendar if connected (dedicated "LitCal" calendar)

### Team / Workspace
- Workspace shared across cases and events
- Admin/Owner view: rename workspace, set job titles per member, invite, remove members, cancel invitations, delete workspace
- Member view: read-only member list only
- Job titles: Attorney, Paralegal, Assistant, Staff — controls which members appear in assignment dropdowns
- Workspace deletion requires typing the workspace name to confirm

### Google Integrations (separate)
- **Google Calendar**: calendar scope only — pushes events to Google Calendar
- **Gmail**: gmail.send scope only — sends team invite emails from the user's Gmail
- Each can be connected/disconnected independently

---

## Google Calendar Sync

- On connect: OAuth token stored in `UserCalendarConnection`. On first event push, a dedicated **"LitCal"** calendar is created and its ID stored in `providerCalendarId`.
- On event create: saved to Supabase → pushed to Google → `GoogleCalendarSync` row created.
- On event delete: deleted from Supabase → mirrored to Google.
- On case close/archive: all case events deleted from Supabase and Google.
- On disconnect: `isActive = false`, soft delete (row kept for audit). `providerCalendarId` cleared on reconnect.

---

## Team Invite Email Flow

1. Admin enters email on Settings → Team.
2. `/api/workspaces/members` POST creates a `WorkspaceInvitation` (or adds direct member if email is already a user).
3. LitCal sends a branded HTML email via Gmail API using the admin's `gmailRefreshToken`.
4. Recipient signs in with Google → `getCurrentWorkspace()` auto-accepts matching pending invitation.

Gmail sending requires the admin to have connected Gmail separately in Settings → Integrations.

---

## Running Locally

```bash
cd ~/Desktop/LitCal
npm run dev
# → http://localhost:3000
```

---

## Planned Next Features

- Inbox processing (email → event/case)
- Outlook + Apple Calendar sync
- AI features (deadline detection, scheduling suggestions)
- Conflict detection across attorney assignments
- Better invite status UI ("email sent" / "Gmail not connected")
- Remove old Microsoft auth UI (schema exists, no sign-in UI built)
