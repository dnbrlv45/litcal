import { prisma } from "@/lib/prisma";
import { getAccessToken, createGoogleEvent, createLitCalCalendar } from "@/lib/google-calendar";
import { getGoogleColorId } from "@/lib/google-calendar-payload";

/** Push a task as an all-day event to the user's LitCal Google Calendar. */
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
    const summary = task.caseRef?.title
      ? `${task.caseRef.title} — ${task.title}`
      : task.title;

    const gEvent = await createGoogleEvent(
      accessToken,
      {
        summary,
        colorId: getGoogleColorId("DEADLINE"),
        start: dateStr,
        end: dateStr,
        allDay: true,
        timeZone: "UTC",
      },
      litCalId
    );

    await prisma.task.update({
      where: { id: task.id },
      data: { googleEventId: gEvent.id, googleCalendarId: litCalId },
    });
  } catch (err) {
    console.error(`Google Calendar push failed for task ${task.id}:`, err);
  }
}

/** Delete a task's Google Calendar event. */
export async function deleteTaskFromGoogle(
  userId: string,
  task: { id: string; googleEventId: string | null; googleCalendarId: string | null }
): Promise<void> {
  if (!task.googleEventId || !task.googleCalendarId) return;

  const connection = await prisma.userCalendarConnection.findFirst({
    where: { userId, provider: "GOOGLE", isActive: true },
  });
  if (!connection) return;

  try {
    const accessToken = await getAccessToken(connection.refreshToken);
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(task.googleCalendarId)}/events/${encodeURIComponent(task.googleEventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    await prisma.task.update({
      where: { id: task.id },
      data: { googleEventId: null, googleCalendarId: null },
    });
  } catch (err) {
    console.error(`Google Calendar delete failed for task ${task.id}:`, err);
  }
}
