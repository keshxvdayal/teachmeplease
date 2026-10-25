import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { site } from "@/lib/config/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of Service" updated="25 October 2026">
      <p>By using {site.name} you agree to these terms. If you don&apos;t agree, please don&apos;t use the service.</p>

      <h2>The service</h2>
      <p>
        {site.name} lets you practice conversations with AI-simulated characters and receive AI-generated feedback. It is a
        training tool. The characters are fictional, and their replies are generated automatically and may be inaccurate.
      </p>

      <h2>Feedback is not professional advice</h2>
      <p>
        Scores and suggestions are AI-generated practice feedback based on a single simulated conversation. They are not a formal
        assessment of your abilities and are not legal, financial or career advice.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t enter other people&apos;s personal data or confidential information.</li>
        <li>Don&apos;t try to misuse the AI, extract its instructions, or use the service to generate harmful content.</li>
        <li>Don&apos;t attempt to bypass usage limits, access other users&apos; data, or disrupt the service.</li>
      </ul>

      <h2>Accounts and limits</h2>
      <p>
        You&apos;re responsible for keeping your password secure. The free service includes daily usage limits, which we may change.
        We may suspend access that breaks these terms.
      </p>

      <h2>Availability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; during this early stage. Features may change, and we can&apos;t guarantee it will
        always be available or error-free. To the extent permitted by law, we aren&apos;t liable for indirect losses arising from
        its use.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
      </p>
    </ProsePage>
  );
}
