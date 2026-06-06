# LitCal — Handoff Document

## Live App
**https://litcal.vercel.app**

## Repositories & Services

| Service | URL / Info |
|---|---|
| GitHub | https://github.com/dnbrlv45/litcal (private) |
| Vercel | https://vercel.com/dnbrlv45s-projects/litcal |
| Supabase | https://supabase.com/dashboard/project/ozbxvcrynseqygyknvnz |
| cron-job.org | Job ID 7742268 — fires `/api/cron/send-reminders` every 5 min |

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
| `UserCalendarConnection` | OAuth tokens per provider. Google row stores both `refreshToken` (calendar) and `gmailRefreshToken` (reading Gmail). |
| `Case` | PI case — title, number, county, court, case type, defense info, status. |
| `CaseStaff` | Many-to-many: users assigned to a case with a role (ATTORNEY / PARALEGAL / ASSISTANT). |
| `CaseParty` | Named parties (plaintiff, defendant, etc.) attached to a case. |
| `Event` | All calendar events — source of truth. Inherits `assignedAttorneyId` from first attorney on linked case. |
| `GoogleCalendarSync` | 1:1 with Event. Tracks sync state to Google Calendar. |
| `EventReminder` | Scheduled reminder times per event (computed from event type). Processed by cron. |
| `Notification` | In-app notifications (TASK_ASSIGNED, CASE_ASSIGNED, EVENT_REMINDER). |
| `Task` | Tasks linked to cases/events. |
| `TaskAssignee` | Many-to-many: workspace members assigned to a task. |

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
| Gmail (read) | `https://www.googleapis.com/auth/gmail.readonly` | `/api/auth/google/gmail/callback` |

Gmail read is a sensitive scope. Keep the app in **Testing** mode and add test users for development. Public use requires OAuth verification from Google.

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

# App Gmail sender — refresh token for litcalai@gmail.com
GMAIL_REFRESH_TOKEN=...
```

---

## Key Files

```
proxy.ts                                        # Session-cookie gate (middleware)
prisma.config.ts                                # Prisma v7 CLI config
prisma/schema.prisma                            # Full database schema
prisma/migrations/                              # Applied migrations 0001–0014

lib/auth.ts                                     # Google identity upsert + session helpers
lib/prisma.ts                                   # PrismaClient singleton with PrismaPg adapter
lib/google-calendar.ts                          # Google Calendar API helpers
lib/google-mail.ts                              # Gmail API — sends branded team invite emails from app account
lib/workspaces.ts                               # getCurrentWorkspace(), canManageWorkspace()
lib/reminders.ts                                # Reminder schedule per event type

app/api/auth/google/sign-in/route.ts            # Starts Google sign-in OAuth
app/api/auth/google/sign-in/callback/route.ts   # Completes sign-in, creates session
app/api/auth/sign-out/route.ts                  # Clears session cookie

app/api/auth/google/route.ts                    # Starts Google Calendar connect (calendar scope only)
app/api/auth/google/callback/route.ts           # Calendar connect callback — stores refreshToken
app/api/auth/google/disconnect/route.ts         # Disconnects Google Calendar

app/api/auth/google/gmail/route.ts              # Starts Gmail connect (read scope)
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
app/api/notifications/route.ts                  # GET + PATCH (mark read) + DELETE notifications
app/api/tasks/route.ts                          # GET + POST tasks
app/api/tasks/[id]/route.ts                     # PATCH + DELETE tasks
app/api/cron/send-reminders/route.ts            # Cron endpoint — delivers due EventReminder rows as notifications

components/calendar/CalendarView.tsx            # Main calendar shell
components/calendar/EventModal.tsx              # Create event modal
components/calendar/EventDetailModal.tsx        # View/edit/delete event
components/nav/NotificationBell.tsx             # Bell dropdown in sidebar
components/settings/CalendarConnections.tsx     # Google Calendar + Gmail connect UI
components/auth/LitCalGoogleAuth.tsx            # Google sign-in/sign-up UI

app/cases/CasesClient.tsx                       # Case list page
app/cases/CreateCaseModal.tsx                   # Create case modal
app/cases/[id]/CaseDetailClient.tsx             # Case detail — info, staff assignments, events, tasks
app/notifications/NotificationsClient.tsx       # Full notifications page
app/settings/team/TeamClient.tsx                # Team management
app/settings/calendar/page.tsx                  # Calendar/integrations settings page
app/tasks/TasksClient.tsx                       # Tasks page
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
| 0007 | `attorney_assignments` | assignedAttorneyId on Event; original single-assignment fields on Case (superseded by 0014) |
| 0008 | `job_titles` | JobTitle enum + WorkspaceMember.jobTitle |
| 0009 | `gmail_token` | gmailRefreshToken + gmailConnectedAt on UserCalendarConnection |
| 0010 | `county_court` | County + Court lookup tables |
| 0011 | `add_tasks` | Task + TaskAssignee tables |
| 0012 | `tasks_notifications_reminders` | Notification + EventReminder tables; NotificationType enum |
| 0013 | `case_assigned_notification` | Add CASE_ASSIGNED to NotificationType enum |
| 0014 | `case_multi_staff` | Replace single assignedAttorneyId/ParalegalId/AssistantId on Case with CaseStaff join table |

---

## Feature Summary

### Cases
- Create, view, edit, delete PI cases
- Fields: name, case number, county, court, case type (PI-specific), defendant, defense firm, defense attorney, notes
- Case types: Auto Accident, Slip & Fall, Government Claim, Dog Bite, Premises Liability, Medical Malpractice, Wrongful Death, Product Liability, Other
- Statuses: Active, Pending, Closed, Archived
- Closing/archiving a case deletes all its calendar events (DB + Google Calendar)
- Cannot create events on closed/archived cases

### Case Staff Assignments
- Cases support **multiple** attorneys, paralegals, and assistants via `CaseStaff` join table
- Assigned staff shown as chips with X to remove; dropdown to add more
- Only available when case status is Active
- Dropdowns only show workspace members with matching job title
- Events inherit `assignedAttorneyId` from the first attorney on the case on creation
- All assigned staff receive `CASE_ASSIGNED` in-app notification when added
- All assigned staff receive `EVENT_REMINDER` notifications for case events

### Notifications
- In-app notification bell in sidebar (polls every 30 seconds)
- Full `/notifications` page with mark-read, bulk select, delete per item, clear all
- Types: `TASK_ASSIGNED`, `CASE_ASSIGNED`, `EVENT_REMINDER`
- Event reminders delivered by cron (see below)

### Event Reminders (Cron)
- `EventReminder` rows created per event based on type (e.g. Hearing: 7d, 1d, 1h before)
- cron-job.org job (ID: 7742268) hits `/api/cron/send-reminders` every 5 minutes
- Cron finds due unsent reminders, creates `Notification` rows for event owner + all case staff, marks reminders sent
- Reminder schedule defined in `lib/reminders.ts`

### Tasks
- Tasks linked to cases or events
- Assignable to workspace members
- `TASK_ASSIGNED` notification sent to each assignee on creation or reassignment

### Calendar
- Month/week/day views
- Create events: type, date, time, location, notes, case link
- Events sync to Google Calendar if connected (dedicated "LitCal" calendar)

### Team / Workspace
- Workspace shared across cases, events, tasks, and notifications
- Admin/Owner: rename workspace, set job titles, invite, remove members, cancel invitations, delete workspace
- Member view: read-only member list
- Job titles: Attorney, Paralegal, Assistant, Staff

### Google Integrations (separate)
- **Google Calendar**: calendar scope — pushes events to Google Calendar
- **Gmail (read)**: gmail.readonly scope — for reading user's inbox (future inbox features)
- Each can be connected/disconnected independently in Settings → Calendar

### Team Invite Emails
- Sent automatically from `litcalai@gmail.com` via `GMAIL_REFRESH_TOKEN` env var
- No per-user Gmail setup required
- Branded HTML email with accept button
- Recipient signs in → `getCurrentWorkspace()` auto-accepts pending invitation

---

## Google Calendar Sync

- On connect: OAuth token stored in `UserCalendarConnection`. On first event push, a dedicated **"LitCal"** calendar is created and its ID stored in `providerCalendarId`.
- On event create: saved to Supabase → pushed to Google → `GoogleCalendarSync` row created.
- On event delete: deleted from Supabase → mirrored to Google.
- On case close/archive: all case events deleted from Supabase and Google.
- On disconnect: `isActive = false`, soft delete (row kept for audit). `providerCalendarId` cleared on reconnect.

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
- Remove old Microsoft auth UI (schema exists, no sign-in UI built)
