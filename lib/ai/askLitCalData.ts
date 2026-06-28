import { prisma } from "@/lib/prisma";

function formatDate(d: Date | null | undefined): string {
  if (!d) return "N/A";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "N/A";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
  });
}

function staffName(user: { firstName: string | null; lastName: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || "Unknown";
}

// ── Case-specific tools ──────────────────────────────────────────────────────

export async function getCaseSummary(caseId: string, workspaceId: string): Promise<string> {
  const c = await prisma.case.findFirst({
    where: { id: caseId, workspaceId },
    include: {
      parties: true,
      staff: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
  if (!c) return "Case not found.";

  const parties = c.parties.map((p) => `${p.role}: ${p.name}`).join(", ") || "None listed";
  const staff = c.staff.map((s) => `${s.role}: ${staffName(s.user)}`).join(", ") || "None assigned";

  return [
    `CASE: ${c.title}`,
    `Case Number: ${c.caseNumber ?? "N/A"}`,
    `Status: ${c.status}`,
    `County: ${c.county ?? "N/A"} | Court: ${c.court ?? "N/A"} | Judge: ${c.judge ?? "N/A"}`,
    `Case Type: ${c.caseType} | Track: ${c.caseTrack}`,
    `Defendant: ${c.defendant ?? "N/A"} | Defense Firm: ${c.defenseFirm ?? "N/A"} | Defense Attorney: ${c.defenseAttorney ?? "N/A"}`,
    `Filing Date: ${formatDate(c.filingDate)} | Date of Loss: ${formatDate(c.dateOfLoss)}`,
    `Parties: ${parties}`,
    `Staff: ${staff}`,
    `Case ID: ${c.id}`,
  ].join("\n");
}

export async function getCaseEvents(caseId: string, workspaceId: string): Promise<string> {
  const events = await prisma.event.findMany({
    where: { caseId, workspaceId, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    select: { id: true, title: true, eventType: true, startTime: true, department: true, location: true, allDay: true },
    orderBy: { startTime: "asc" },
    take: 20,
  });
  if (events.length === 0) return "UPCOMING EVENTS: None";

  const lines = events.map((e) => {
    const time = e.allDay ? formatDate(e.startTime) : formatDateTime(e.startTime);
    return `- ${e.title} | ${e.eventType} | ${time}${e.department ? ` | Dept: ${e.department}` : ""}${e.location ? ` | ${e.location}` : ""} [eventId:${e.id}]`;
  });
  return `UPCOMING EVENTS:\n${lines.join("\n")}`;
}

export async function getCaseDeadlines(caseId: string, workspaceId: string): Promise<string> {
  const deadlineEvents = await prisma.event.findMany({
    where: { caseId, workspaceId, eventType: "DEADLINE", status: { notIn: ["CANCELLED", "COMPLETED"] } },
    select: { id: true, title: true, startTime: true },
    orderBy: { startTime: "asc" },
  });
  const tasks = await prisma.task.findMany({
    where: { caseId, workspaceId, dueDate: { not: null }, status: { not: "DONE" } },
    select: { id: true, title: true, dueDate: true, priority: true, status: true },
    orderBy: { dueDate: "asc" },
  });

  const lines: string[] = [];
  for (const e of deadlineEvents) lines.push(`- ${e.title} | Due: ${formatDate(e.startTime)} [eventId:${e.id}]`);
  for (const t of tasks) lines.push(`- ${t.title} | Due: ${formatDate(t.dueDate)} | ${t.priority} | ${t.status} [taskId:${t.id}]`);

  return lines.length > 0 ? `DEADLINES:\n${lines.join("\n")}` : "DEADLINES: None";
}

export async function getCaseDiscovery(caseId: string, workspaceId: string): Promise<string> {
  const items = await prisma.discoveryItem.findMany({
    where: { caseId, workspaceId },
    include: { extensions: { select: { id: true, newDueDate: true, grantedDate: true } } },
    orderBy: { currentDueDate: "asc" },
  });
  if (items.length === 0) return "DISCOVERY: None";

  const lines = items.map((d) => {
    const extCount = d.extensions.length;
    return `- ${d.discoveryType} | Direction: ${d.direction} | Status: ${d.status} | Due: ${formatDate(d.currentDueDate)} | Extensions: ${extCount} [discoveryId:${d.id}]`;
  });
  return `DISCOVERY:\n${lines.join("\n")}`;
}

export async function getCaseTasks(caseId: string, workspaceId: string): Promise<string> {
  const tasks = await prisma.task.findMany({
    where: { caseId, workspaceId },
    include: { assignees: { include: { member: { include: { user: { select: { firstName: true, lastName: true } } } } } } },
    orderBy: { dueDate: "asc" },
    take: 20,
  });
  if (tasks.length === 0) return "TASKS: None";

  const lines = tasks.map((t) => {
    const assignees = t.assignees.map((a) => staffName(a.member.user)).join(", ") || "Unassigned";
    return `- ${t.title} | ${t.status} | ${t.priority} | Due: ${formatDate(t.dueDate)} | Assigned: ${assignees} [taskId:${t.id}]`;
  });
  return `TASKS:\n${lines.join("\n")}`;
}

export async function getCaseTimeline(caseId: string, workspaceId: string): Promise<string> {
  const entries = await prisma.caseTimeline.findMany({
    where: { caseId, workspaceId },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { title: true, description: true, type: true, createdAt: true },
  });
  if (entries.length === 0) return "RECENT ACTIVITY: None";

  const lines = entries.map((e) =>
    `- ${formatDate(e.createdAt)}: ${e.title}${e.description ? ` — ${e.description}` : ""}`
  );
  return `RECENT ACTIVITY:\n${lines.join("\n")}`;
}

export async function getCaseCourtRules(caseId: string, workspaceId: string): Promise<string> {
  const events = await prisma.event.findMany({
    where: { caseId, workspaceId, courtHearingRuleId: { not: null } },
    select: {
      id: true, title: true, eventType: true,
      appearanceType: true, remoteLink: true, phoneNumber: true,
      requestRequired: true, requestContactEmail: true,
    },
    take: 10,
  });
  if (events.length === 0) return "COURT RULES: No court rules applied to events in this case.";

  const lines = events.map((e) => {
    const parts = [`- ${e.title}: ${e.appearanceType ?? "Unknown"} appearance`];
    if (e.remoteLink) parts.push(`Link: ${e.remoteLink}`);
    if (e.requestRequired) parts.push("Remote appearance request required");
    return parts.join(" | ");
  });
  return `COURT RULES APPLIED:\n${lines.join("\n")}`;
}

export async function getFullCaseContext(caseId: string, workspaceId: string): Promise<string> {
  const parts = await Promise.all([
    getCaseSummary(caseId, workspaceId),
    getCaseEvents(caseId, workspaceId),
    getCaseDeadlines(caseId, workspaceId),
    getCaseDiscovery(caseId, workspaceId),
    getCaseTasks(caseId, workspaceId),
    getCaseTimeline(caseId, workspaceId),
    getCaseCourtRules(caseId, workspaceId),
  ]);
  return parts.join("\n\n");
}

// ── Workspace-wide tools ─────────────────────────────────────────────────────

export async function searchCases(query: string, workspaceId: string): Promise<{ id: string; title: string; caseNumber: string | null }[]> {
  const allCases = await prisma.case.findMany({
    where: { workspaceId, status: { notIn: ["ARCHIVED", "CLOSED"] } },
    include: { parties: { select: { name: true } } },
  });

  const q = query.toLowerCase().trim();
  const qParts = q.split(/\s+/).filter((p) => p.length >= 2);

  return allCases.filter((c) => {
    if (c.caseNumber?.toLowerCase().includes(q)) return true;
    const titleLower = c.title.toLowerCase();
    if (titleLower.includes(q)) return true;
    if (qParts.length > 0 && qParts.every((p) => titleLower.includes(p))) return true;
    if (c.parties.some((p) => {
      const pLower = p.name.toLowerCase();
      return pLower.includes(q) || qParts.every((part) => pLower.includes(part));
    })) return true;
    // Last name match
    const lastName = qParts[qParts.length - 1];
    if (lastName && lastName.length >= 3) {
      if (titleLower.includes(lastName)) return true;
      if (c.parties.some((p) => p.name.toLowerCase().includes(lastName))) return true;
    }
    return false;
  }).map((c) => ({ id: c.id, title: c.title, caseNumber: c.caseNumber }));
}

export async function getWorkspaceDeadlines(workspaceId: string, range: "today" | "week" | "month"): Promise<string> {
  const now = new Date();
  const end = new Date(now);
  if (range === "today") end.setUTCDate(end.getUTCDate() + 1);
  else if (range === "week") end.setUTCDate(end.getUTCDate() + 7);
  else end.setUTCMonth(end.getUTCMonth() + 1);

  const deadlines = await prisma.event.findMany({
    where: {
      workspaceId, eventType: "DEADLINE",
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      startTime: { gte: now, lte: end },
      caseRef: { status: { notIn: ["CLOSED", "ARCHIVED"] } },
    },
    include: { caseRef: { select: { title: true, caseNumber: true, id: true } } },
    orderBy: { startTime: "asc" },
    take: 30,
  });

  const tasks = await prisma.task.findMany({
    where: {
      workspaceId, status: { not: "DONE" },
      dueDate: { gte: now, lte: end },
      caseRef: { status: { notIn: ["CLOSED", "ARCHIVED"] } },
    },
    include: { caseRef: { select: { title: true, caseNumber: true, id: true } } },
    orderBy: { dueDate: "asc" },
    take: 30,
  });

  const lines: string[] = [];
  for (const e of deadlines) {
    lines.push(`- ${e.title} | Due: ${formatDate(e.startTime)} | Case: ${e.caseRef?.title ?? "N/A"} [caseId:${e.caseRef?.id ?? ""}]`);
  }
  for (const t of tasks) {
    lines.push(`- ${t.title} | Due: ${formatDate(t.dueDate)} | Case: ${t.caseRef?.title ?? "N/A"} [caseId:${t.caseRef?.id ?? ""}]`);
  }

  return lines.length > 0
    ? `DEADLINES DUE (${range.toUpperCase()}):\n${lines.join("\n")}`
    : `No deadlines due ${range}.`;
}

export async function getWorkspaceTasks(workspaceId: string): Promise<string> {
  const now = new Date();
  const overdue = await prisma.task.findMany({
    where: { workspaceId, status: { not: "DONE" }, dueDate: { lt: now, not: null } },
    include: { caseRef: { select: { title: true, id: true } } },
    orderBy: { dueDate: "asc" },
    take: 20,
  });

  const lines = overdue.map((t) =>
    `- ${t.title} | Due: ${formatDate(t.dueDate)} | ${t.priority} | Case: ${t.caseRef?.title ?? "N/A"} [caseId:${t.caseRef?.id ?? ""}]`
  );
  return lines.length > 0 ? `OVERDUE TASKS:\n${lines.join("\n")}` : "No overdue tasks.";
}

export async function getUpcomingTrials(workspaceId: string): Promise<string> {
  const now = new Date();
  const ninetyDays = new Date(now);
  ninetyDays.setUTCDate(ninetyDays.getUTCDate() + 90);

  const trials = await prisma.event.findMany({
    where: {
      workspaceId, eventType: "TRIAL",
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      startTime: { gte: now, lte: ninetyDays },
    },
    include: {
      caseRef: { select: { id: true, title: true, caseNumber: true } },
      assignedAttorney: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startTime: "asc" },
  });

  if (trials.length === 0) return "No trials in the next 90 days.";

  const lines = trials.map((t) => {
    const atty = t.assignedAttorney ? staffName(t.assignedAttorney) : "Unassigned";
    return `- ${t.caseRef?.title ?? t.title} | ${formatDate(t.startTime)} | Attorney: ${atty} [caseId:${t.caseRef?.id ?? ""}]`;
  });
  return `UPCOMING TRIALS:\n${lines.join("\n")}`;
}

export async function getUpcomingEvents(workspaceId: string, days: number): Promise<string> {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + days);

  const events = await prisma.event.findMany({
    where: {
      workspaceId,
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      startTime: { gte: now, lte: end },
      eventType: { notIn: ["DEADLINE"] },
    },
    include: { caseRef: { select: { id: true, title: true } } },
    orderBy: { startTime: "asc" },
    take: 30,
  });

  if (events.length === 0) return `No events in the next ${days} days.`;

  const lines = events.map((e) => {
    const time = e.allDay ? formatDate(e.startTime) : formatDateTime(e.startTime);
    return `- ${e.title} | ${e.eventType} | ${time} | Case: ${e.caseRef?.title ?? "N/A"} [caseId:${e.caseRef?.id ?? ""}]`;
  });
  return `UPCOMING EVENTS (next ${days} days):\n${lines.join("\n")}`;
}

export async function getGlobalContext(workspaceId: string): Promise<string> {
  const parts = await Promise.all([
    getUpcomingEvents(workspaceId, 7),
    getWorkspaceDeadlines(workspaceId, "week"),
    getWorkspaceTasks(workspaceId),
    getUpcomingTrials(workspaceId),
  ]);
  return parts.join("\n\n");
}
