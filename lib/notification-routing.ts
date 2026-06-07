export interface NotificationTarget {
  taskRef: { id: string; title: string } | null;
  caseRef: { id: string; title: string; caseNumber: string | null } | null;
  eventRef: { id: string; title: string } | null;
}

export function notificationHref(notification: NotificationTarget) {
  if (notification.taskRef) return `/tasks?taskId=${notification.taskRef.id}`;
  if (notification.caseRef) return `/cases/${notification.caseRef.id}`;
  if (notification.eventRef) return "/";
  return "/notifications";
}

export function notificationTargetLabel(notification: NotificationTarget) {
  if (notification.taskRef) return `Open task: ${notification.taskRef.title}`;
  if (notification.caseRef) {
    return notification.caseRef.caseNumber
      ? `Open case #${notification.caseRef.caseNumber}`
      : `Open case: ${notification.caseRef.title}`;
  }
  if (notification.eventRef) return `Open calendar: ${notification.eventRef.title}`;
  return "Open notifications";
}
