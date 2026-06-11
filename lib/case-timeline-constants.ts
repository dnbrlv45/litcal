// Shared constants importable by both server and client code.
// No prisma or Node.js imports here.

export const TIMELINE_FILTERS = [
  { key: "all",         label: "All" },
  { key: "events",      label: "Events" },
  { key: "tasks",       label: "Tasks" },
  { key: "deadlines",   label: "Deadlines" },
  { key: "discovery",   label: "Discovery" },
  { key: "assignments", label: "Assignments" },
  { key: "status",      label: "Status Changes" },
  { key: "court_rules", label: "Court Rules" },
  { key: "google_sync", label: "Google Sync" },
] as const;

export type TimelineFilter = typeof TIMELINE_FILTERS[number]["key"];

export const FILTER_TYPES: Record<TimelineFilter, string[] | null> = {
  all:         null,
  events:      ["event.created", "event.edited", "event.deleted"],
  tasks:       ["task.created", "task.completed"],
  deadlines:   ["event.trial_deadlines_generated", "event.cmc_task_generated", "event.remote_task_generated"],
  discovery:   ["discovery.created", "discovery.deadline_generated", "discovery.extension_granted", "discovery.responses_received", "discovery.completed"],
  assignments: ["case.staff_added", "case.staff_removed"],
  status:      ["case.status_changed", "case.created", "case.edited"],
  court_rules: ["event.rule_applied", "event.rule_backfilled"],
  google_sync: ["event.google_synced"],
};
