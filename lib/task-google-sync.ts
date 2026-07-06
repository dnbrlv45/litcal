import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar, GoogleReauthRequiredError } from "@/lib/google-calendar";
import { getGoogleColorId } from "@/lib/google-calendar-payload";

async function deactivateOnReauth(err: unknown, connectionId: string) {
  if (err instanceof GoogleReauthRequiredError) {
    await prisma.userCalendarConnection.update({ where: { id: connectionId }, data: { isActive: false } });
  }
}

/**
 * Push a task as an all-day event to the user's own LitCal Google Calendar.
 * Sync state is tracked per (task, user) in UserTaskGoogleSync — pushing for
 * one user must never make the task look synced for anyone else.
 */
export async function pushTaskToGoogle(
  userId: string,
  task: { id: string; title: string; dueDate: Date; priority: string; caseRef?: { title: string } | null }
): Promise<void> {
  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId, provider: "GOOGLE", isActive: true },
  });
  if (!connection) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);

    let litCalId = connection.providerCalendarId;
    if (litCalId) {
      const check = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(litCalId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!check.ok) litCalId = null;
    }
    if (!litCalId) {
      litCalId = await createLitCalCalendar(accessToken);
      await prisma.userCalendarConnection.update({
        where: { id: connection.id },
        data: { providerCalendarId: litCalId },
      });
    }

    const dateStr = task.dueDate.toISOString().slice(0, 10);
    const endDateStr = new Date(task.dueDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const summary = task.caseRef?.title
      ? `${task.caseRef.title} — ${task.title}`
      : task.title;

    const gEvent = await createGoogleEvent(
      accessToken,
      {
        summary,
        colorId: getGoogleColorId("DEADLINE"),
        start: dateStr,
        end: endDateStr,
        allDay: true,
        timeZone: "UTC",
      },
      litCalId
    );

    await prisma.userTaskGoogleSync.upsert({
      where: { taskId_userId: { taskId: task.id, userId } },
      create: {
        taskId: task.id,
        userId,
        googleEventId: gEvent.id,
        googleCalendarId: litCalId,
        syncStatus: "SYNCED",
      },
      update: {
        googleEventId: gEvent.id,
        googleCalendarId: litCalId,
        syncStatus: "SYNCED",
        lastError: null,
      },
    });
  } catch (err) {
    await deactivateOnReauth(err, connection.id);
    console.error(`Google Calendar push failed for task ${task.id}:`, err);
  }
}

/** Delete a task's Google Calendar event from this user's own calendar. */
export async function deleteTaskFromGoogle(userId: string, taskId: string): Promise<void> {
  const sync = await prisma.userTaskGoogleSync.findUnique({
    where: { taskId_userId: { taskId, userId } },
  });
  if (!sync) return;

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId, provider: "GOOGLE", isActive: true },
  });
  if (!connection) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(sync.googleCalendarId)}/events/${encodeURIComponent(sync.googleEventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    await prisma.userTaskGoogleSync.delete({ where: { id: sync.id } });
  } catch (err) {
    await deactivateOnReauth(err, connection.id);
    console.error(`Google Calendar delete failed for task ${taskId}:`, err);
  }
}
