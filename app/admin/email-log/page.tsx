import { prisma } from "@/lib/prisma";

export default async function EmailLogPage() {
  const logs = await prisma.emailNotificationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { email: true, firstName: true, lastName: true } },
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Email Delivery Log</h1>
        <p className="mt-1 text-sm text-slate-500">Recent LitCal email notification delivery attempts.</p>
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-slate-700">{log.recipientEmail}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{log.emailType}</td>
                  <td className="px-4 py-3 text-slate-700">{log.subject}</td>
                  <td className="px-4 py-3 text-slate-500">{log.relatedEntityType} · {log.reminderKey}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      log.status === "SENT"
                        ? "bg-teal-100 text-teal-700"
                        : log.status === "FAILED"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                      {log.status}
                    </span>
                    {log.error && <p className="mt-1 max-w-xs truncate text-xs text-rose-600">{log.error}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {log.sentAt ? log.sentAt.toLocaleString("en-US") : "-"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No email delivery attempts yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
