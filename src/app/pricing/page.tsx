import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { PricingTable } from "@/components/pricing/pricing-table";
import { currencyFor } from "@/lib/config/pricing";
import { site } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free. Upgrade when you practice every week. Prices in rupees for India and US dollars everywhere else.",
};

const faqs = [
  {
    q: "Why do I see rupees (or dollars)?",
    a: "Visitors from India see prices in Indian rupees; everyone else sees US dollars. You can switch currency with the toggle at any time.",
  },
  {
    q: "Do I need a card to start?",
    a: "No. The Free plan needs no card and no account. Sign up only when you want to keep your history across devices.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Monthly plans stop at the end of the current month. Yearly plans run until the end of the year you paid for.",
  },
  {
    q: "Is my conversation private?",
    a: "Your practice calls are only used to give you feedback. We don't sell your data or use it for advertising.",
  },
];

export default async function PricingPage() {
  const h = await headers();
  const detected = currencyFor(h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry"), h.get("accept-language"));

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[460px] overflow-hidden" aria-hidden>
          <div className="bg-dots mask-fade-y absolute inset-0" />
          <div className="absolute -left-20 top-0 size-80 rounded-full bg-brand/20 glow" />
          <div className="absolute right-0 top-10 size-72 rounded-full bg-lime/30 glow" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              <span className="h-px w-6 bg-brand" aria-hidden />
              Pricing
              <span className="h-px w-6 bg-brand" aria-hidden />
            </p>
            <h1 className="mt-4 text-4xl font-extrabold text-balance sm:text-6xl">
              Practice now. <span className="font-serif font-normal italic text-gradient">Pay when it sticks.</span>
            </h1>
            <p className="mt-4 text-lg text-ink-2">Start free with no card. Upgrade when you&apos;re rehearsing every week.</p>
          </div>

          <div className="mt-12">
            <PricingTable detected={detected} contactEmail={site.contactEmail} />
          </div>

          <section aria-labelledby="faq" className="mx-auto mt-24 max-w-3xl">
            <h2 id="faq" className="text-center text-3xl font-extrabold">
              Questions
            </h2>
            <dl className="mt-8 divide-y divide-line rounded-3xl border border-line bg-surface shadow-card">
              {faqs.map((f) => (
                <div key={f.q} className="px-6 py-5">
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-1.5 text-sm text-ink-2">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
