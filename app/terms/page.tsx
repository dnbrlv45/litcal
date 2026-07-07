import type { Metadata } from "next";
import LegalPageShell, { LegalH2, LegalList, LegalP } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = { title: "Terms of Service - LitCal" };

const EFFECTIVE_DATE = "July 6, 2026";
const CONTACT_EMAIL = "litcalai@gmail.com";

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" effectiveDate={EFFECTIVE_DATE}>
      <section>
        <LegalP>
          These Terms of Service (&quot;Terms&quot;) govern your use of LitCal, a calendar and deadline-management
          platform for litigation teams. By creating an account or using LitCal, you agree to these Terms.
        </LegalP>
      </section>

      <section>
        <LegalH2>1. Description of Service</LegalH2>
        <LegalP>
          LitCal helps litigation teams organize cases, calendar events, court deadlines, discovery tracking, and
          tasks, and can optionally mirror that information to a connected Google Calendar and surface AI-assisted
          suggestions extracted from Gmail.
        </LegalP>
      </section>

      <section>
        <LegalH2>2. Not Legal Advice — No Guarantee of Accuracy</LegalH2>
        <LegalP>
          <strong>LitCal is a tool, not a substitute for professional legal judgment.</strong> LitCal does not provide
          legal advice, and nothing in the service constitutes legal advice. Deadline calculations, court-rule
          matching, and AI-extracted suggestions (including anything surfaced through &quot;AI Inbox&quot; or
          &quot;Ask LitCal&quot;) may be incomplete, outdated, or incorrect. You and your firm are solely responsible
          for independently verifying every deadline, filing requirement, and court rule against the governing
          statutes, local rules, and standing orders before relying on it. LitCal is not responsible for missed
          deadlines, sanctions, or other consequences arising from reliance on information in the service.
        </LegalP>
      </section>

      <section>
        <LegalH2>3. Accounts &amp; Eligibility</LegalH2>
        <LegalP>
          You must sign in with a Google account to use LitCal. You are responsible for maintaining the
          confidentiality of your account and for all activity under it. You represent that you are authorized to
          use LitCal on behalf of your firm or organization.
        </LegalP>
      </section>

      <section>
        <LegalH2>4. AI-Assisted Features</LegalH2>
        <LegalP>
          AI Inbox and Ask LitCal use AI models to extract or draft litigation details from email or natural-language
          requests. These are suggestions only — LitCal never creates, updates, or cancels a case, event, or deadline
          automatically. A human must review and approve every suggestion before it is applied, and you remain solely
          responsible for verifying its accuracy.
        </LegalP>
      </section>

      <section>
        <LegalH2>5. Acceptable Use</LegalH2>
        <LegalList>
          <li>Use LitCal only for lawful litigation calendar and case management purposes.</li>
          <li>Do not attempt to access another workspace&rsquo;s data without authorization.</li>
          <li>Do not use LitCal to store or process data you are not legally permitted to hold.</li>
          <li>Do not interfere with or disrupt the service, or attempt to reverse-engineer it.</li>
        </LegalList>
      </section>

      <section>
        <LegalH2>6. Your Content</LegalH2>
        <LegalP>
          You retain ownership of the case, calendar, and workspace data you or your team enter into LitCal. You
          grant LitCal a license to store, process, and display that data solely to provide the service to you and
          your workspace.
        </LegalP>
      </section>

      <section>
        <LegalH2>7. Third-Party Services</LegalH2>
        <LegalP>
          LitCal relies on third-party services — including Google (Calendar, Gmail, and Gemini AI), Supabase
          (database hosting), and Vercel (application hosting) — to operate. Your use of those integrations is also
          subject to the applicable third party&rsquo;s own terms.
        </LegalP>
      </section>

      <section>
        <LegalH2>8. Disclaimer of Warranties</LegalH2>
        <LegalP>
          LitCal is provided &quot;as is&quot; and &quot;as available,&quot; without warranties of any kind, express
          or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not
          warrant that the service will be uninterrupted, error-free, or that any calculated deadline or AI-extracted
          detail will be accurate or complete.
        </LegalP>
      </section>

      <section>
        <LegalH2>9. Limitation of Liability</LegalH2>
        <LegalP>
          To the fullest extent permitted by law, LitCal and its operators will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or any loss of data, revenue, or missed legal
          deadlines, arising from your use of the service, even if advised of the possibility of such damages.
        </LegalP>
      </section>

      <section>
        <LegalH2>10. Termination</LegalH2>
        <LegalP>
          You may stop using LitCal and disconnect any connected accounts at any time. We may suspend or terminate
          access to the service for conduct that violates these Terms or poses a risk to other users.
        </LegalP>
      </section>

      <section>
        <LegalH2>11. Changes to These Terms</LegalH2>
        <LegalP>
          We may update these Terms from time to time. Material changes will be reflected by updating the effective
          date above. Continued use of LitCal after a change constitutes acceptance of the updated Terms.
        </LegalP>
      </section>

      <section>
        <LegalH2>12. Governing Law</LegalH2>
        <LegalP>These Terms are governed by the laws of the State of California, without regard to conflict-of-law principles.</LegalP>
      </section>

      <section>
        <LegalH2>13. Contact Us</LegalH2>
        <LegalP>
          Questions about these Terms? Contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-teal-700 underline hover:text-teal-900">{CONTACT_EMAIL}</a>.
        </LegalP>
      </section>
    </LegalPageShell>
  );
}
