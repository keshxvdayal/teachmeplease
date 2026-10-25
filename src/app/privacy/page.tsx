import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { retention } from "@/lib/config/limits";
import { site } from "@/lib/config/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <ProsePage title="Privacy Policy" updated="25 October 2026">
      <p>
        This policy explains what {site.name} collects, why, and what you can do about it. We aim to collect as little as possible.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Practice conversations.</strong> The messages you type or dictate in a session, the AI client&apos;s replies, and
          the scorecard generated at the end.
        </li>
        <li>
          <strong>Account details</strong> (if you create an account): your email address and a securely hashed password.
        </li>
        <li>
          <strong>Waitlist details</strong> (if you join): your email, the track you chose, and whether you agreed to product
          updates.
        </li>
        <li>
          <strong>Technical data:</strong> a random identifier stored in a cookie so we can show your history and apply fair usage
          limits, and a one-way hash of your IP address used only for abuse prevention.
        </li>
        <li>
          <strong>Usage counts:</strong> anonymous events such as &ldquo;session started&rdquo; or &ldquo;voice input failed&rdquo;.
          These don&apos;t contain your messages.
        </li>
      </ul>

      <h2>What we don&apos;t collect</h2>
      <ul>
        <li>We do not record or store audio. Voice input is converted to text by your browser.</li>
        <li>We don&apos;t sell your data or use advertising trackers.</li>
      </ul>

      <h2>AI processing</h2>
      <p>
        To generate the client&apos;s replies and your feedback, your practice messages are sent to our AI provider, currently
        Google (Gemini API). Depending on the service tier we use, the provider may retain or review this content under its own
        terms. <strong>Please don&apos;t enter real client names, contact details, or confidential business information.</strong>{" "}
        The scenarios are fictional and work without them.
      </p>
      <p>
        Voice input uses your browser&apos;s built-in speech recognition. In some browsers (including Chrome), audio is processed by
        the browser vendor&apos;s speech service under the browser&apos;s own privacy terms.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Practice sessions without an account: up to {retention.anonymousDays} days.</li>
        <li>Practice sessions in an account: up to {retention.userDays} days, or until you delete them.</li>
        <li>Waitlist entries: until the track launches and we&apos;ve notified you, or until you ask us to remove them.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>Delete your practice history or your whole account at any time from the Account page.</li>
        <li>Clearing your browser&apos;s cookies removes the link between your browser and any anonymous sessions.</li>
        <li>
          To access, correct or delete other data — such as a waitlist entry — email{" "}
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use only essential cookies: one to keep you signed in and one to identify your anonymous practice history. We don&apos;t
        use analytics or advertising cookies.
      </p>

      <h2>Security</h2>
      <p>
        Data is transmitted over HTTPS. Passwords are hashed. Your sessions are accessible only to you. API credentials are kept on
        our servers and never sent to your browser.
      </p>

      <h2>Children</h2>
      <p>{site.name} is intended for people aged 16 and over.</p>

      <h2>Changes and contact</h2>
      <p>
        We&apos;ll update this page if our practices change. Questions: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
      </p>
    </ProsePage>
  );
}
