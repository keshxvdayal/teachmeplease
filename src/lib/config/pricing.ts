// Plans shown on /pricing. India sees rupees, everyone else US dollars.
// Edit prices here; nothing else needs to change.

export type Currency = "INR" | "USD";
export type Billing = "monthly" | "yearly";

export interface Plan {
  id: "free" | "pro" | "team";
  name: string;
  blurb: string;
  /** Price per month (per seat for Team). Yearly is billed once a year. */
  price: Record<Currency, Record<Billing, number>>;
  perSeat?: boolean;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
}

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "Try real conversations and see how you sound.",
    price: { USD: { monthly: 0, yearly: 0 }, INR: { monthly: 0, yearly: 0 } },
    features: [
      "3 practice calls a day",
      "Every client scenario",
      "Voice calls with realistic AI clients",
      "Scorecard after every call",
      "2 coach hints per call",
      "30 days of history",
    ],
    cta: { label: "Start practicing", href: "/practice" },
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For freelancers and consultants who talk to clients every week.",
    price: { USD: { monthly: 12, yearly: 8 }, INR: { monthly: 499, yearly: 333 } },
    features: [
      "30 practice calls a day",
      "All 12 languages, including Hindi & Hinglish",
      "5 coach hints per call",
      "Detailed feedback with better phrasings",
      "Progress insights across calls",
      "1 year of history",
    ],
    cta: { label: "Get Pro", href: "/signup?plan=pro" },
    highlight: true,
  },
  {
    id: "team",
    name: "Team",
    blurb: "For agencies and teams that want everyone client-ready.",
    price: { USD: { monthly: 25, yearly: 20 }, INR: { monthly: 999, yearly: 799 } },
    perSeat: true,
    features: [
      "Everything in Pro, for every seat",
      "Custom scenarios from your real clients",
      "Team progress dashboard",
      "Central billing and invoices",
      "Priority support",
    ],
    cta: { label: "Talk to us", href: "mailto:" },
  },
];

export function formatPrice(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** India by the visitor's country (from the hosting edge) or, failing that, their browser language. */
export function currencyFor(country: string | null, acceptLanguage: string | null): Currency | null {
  if (country) return country.toUpperCase() === "IN" ? "INR" : "USD";
  if (acceptLanguage && /(^|,)\s*[a-z]{2,3}-IN\b|(^|,)\s*hi\b/i.test(acceptLanguage)) return "INR";
  return null;
}
