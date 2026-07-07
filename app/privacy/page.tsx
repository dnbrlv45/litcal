import type { Metadata } from "next";
import LegalPageShell, { LegalH2, LegalList, LegalP } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = { title: "Privacy Policy - LitCal" };

const EFFECTIVE_DATE = "July 6, 2026";
const CONTACT_EMAIL = "litcalai@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" effectiveDate={EFFECTIVE_DATE}>
      <section>
        <LegalP>
          LitCal (&quot;LitCal,&quot; &quot;we,&quot; &quot;us&quot;) provides a calendar and deadline-management
          platform for litigation teams. This policy explains what information we collect, how we use it, and the
          choices you have. By using LitCal, you agree to the practices described here.
        </LegalP>
      </section>

      <section>
        <LegalH2>1. Information We Collect</LegalH2>
        <LegalList>
          <li><strong>Account information.</strong> Your name and email address, provided when you sign in with Google.</li>
          <li><strong>Workspace data.</strong> Case names, case numbers, court/county/department, calendar events, deadlines, discovery items, tasks, and notes that you or your teammates enter into LitCal.</li>
          <li><strong>Google Calendar data (optional).</strong> If you connect Google Calendar, LitCal creates and maintains a dedicated &quot;LitCal&quot; calendar in your Google account and pushes litigation events, deadlines, and tasks to it. LitCal does not read or import events already on your personal Google Calendar.</li>
          <li><strong>Gmail data (optional, &quot;AI Inbox&quot;).</strong> If you connect Gmail read access, LitCal scans incoming mail in your inbox to detect litigation-relevant messages (e.g. discovery served, hearing notices, deadline extensions) and uses Google&rsquo;s Gemini AI to extract structured details such as dates, case numbers, and parties. These are shown to you as suggestions for manual review — LitCal never creates or changes a case, event, or deadline without your approval.</li>
          <li><strong>Gmail send access (optional).</strong> If you connect Gmail to send mail, LitCal uses it only to send workspace invitation emails on your behalf, from your own Gmail account.</li>
          <li><strong>Usage data.</strong> Standard technical logs (IP address, browser type, pages visited) collected automatically for security and reliability.</li>
        </LegalList>
      </section>

      <section>
        <LegalH2>2. How We Use Information</LegalH2>
        <LegalList>
          <li>To provide LitCal&rsquo;s core service: calendaring, deadline tracking, case management, and team collaboration.</li>
          <li>To mirror litigation events, deadlines, and tasks to your connected Google Calendar.</li>
          <li>To detect and suggest litigation-relevant calendar events and deadlines from your Gmail inbox (AI Inbox), always subject to your review and approval before anything is created or changed.</li>
          <li>To send transactional email, such as workspace invitations and deadline reminders.</li>
          <li>To maintain, secure, and improve the service.</li>
        </LegalList>
      </section>

      <section>
        <LegalH2>3. Google User Data &amp; Limited Use</LegalH2>
        <LegalP>
          LitCal&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-teal-700 underline hover:text-teal-900" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>, including the Limited Use requirements. We only use Google Calendar and Gmail data to provide the
          features described in this policy. We do not use that data for advertising, and we do not sell it.
        </LegalP>
      </section>

      <section>
        <LegalH2>4. Sharing of Information</LegalH2>
        <LegalP>We do not sell your personal information. We share information only with:</LegalP>
        <LegalList>
          <li>Service providers who help us operate LitCal — Supabase (database hosting), Vercel (application hosting), and Google (AI processing of email content you choose to scan, and Calendar/Gmail delivery).</li>
          <li>Other members of your LitCal workspace, to the extent case, calendar, and task data is shared within your firm&rsquo;s workspace.</li>
          <li>As required by law, or to protect the rights, property, or safety of LitCal, our users, or others.</li>
        </LegalList>
      </section>

      <section>
        <LegalH2>5. Data Retention &amp; Deletion</LegalH2>
        <LegalP>
          We retain workspace data for as long as your workspace is active. You can delete individual cases, events,
          tasks, and discovery items at any time from within LitCal. You may disconnect Google Calendar or Gmail
          access at any time from Settings → Calendar, and you may revoke LitCal&rsquo;s access entirely from your{" "}
          <a href="https://myaccount.google.com/permissions" className="text-teal-700 underline hover:text-teal-900" target="_blank" rel="noreferrer">
            Google Account permissions page
          </a>. To request deletion of your account or workspace data, contact us at the address below.
        </LegalP>
      </section>

      <section>
        <LegalH2>6. Security</LegalH2>
        <LegalP>
          We use industry-standard safeguards — including encrypted connections (TLS) and access-controlled cloud
          infrastructure — to protect your data. No system is completely secure, and we cannot guarantee absolute
          security.
        </LegalP>
      </section>

      <section>
        <LegalH2>7. Children&rsquo;s Privacy</LegalH2>
        <LegalP>LitCal is intended for use by legal professionals and is not directed to children under 18.</LegalP>
      </section>

      <section>
        <LegalH2>8. Changes to This Policy</LegalH2>
        <LegalP>
          We may update this policy from time to time. Material changes will be reflected by updating the effective
          date above.
        </LegalP>
      </section>

      <section>
        <LegalH2>9. Contact Us</LegalH2>
        <LegalP>
          Questions about this policy? Contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-teal-700 underline hover:text-teal-900">{CONTACT_EMAIL}</a>.
        </LegalP>
      </section>
    </LegalPageShell>
  );
}
