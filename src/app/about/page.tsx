import type { Metadata } from "next";
import { ProsePage } from "@/components/site/prose-page";
import { ButtonLink } from "@/components/ui/button";
import { site } from "@/lib/config/site";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <ProsePage title="About TeachMePlease">
      <p>
        Most people know roughly what they want to say in a difficult conversation. The hard part is saying it well when a client
        pushes back on price, gets frustrated, or keeps delaying a payment.
      </p>
      <p>
        Reading advice helps a little. Practice helps much more. TeachMePlease gives you a low-pressure place to rehearse these
        conversations with realistic AI clients, make mistakes, and get specific feedback on what to change next time.
      </p>
      <h2>What we focus on</h2>
      <ul>
        <li>Realistic roleplay: AI clients with their own goals who push back and respond to what you actually say.</li>
        <li>Actionable feedback tied to specific moments in your conversation.</li>
        <li>Communication effectiveness, not accent, grammar or language choice.</li>
      </ul>
      <h2>Where we are</h2>
      <p>
        We&apos;re starting with client communication for freelancers, consultants and agency owners. Career readiness and
        hospitality &amp; aviation tracks are in development.
      </p>
      <p>
        Questions or feedback? Email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
      </p>
      <div className="pt-4">
        <ButtonLink href="/practice">Start practicing</ButtonLink>
      </div>
    </ProsePage>
  );
}
