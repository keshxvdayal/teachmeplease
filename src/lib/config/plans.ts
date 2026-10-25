// Plan catalogue. Payments are out of scope for the MVP: every account is on "free",
// and no checkout is shown. Prices are hypotheses for future testing, stored as
// minor units with ISO 4217 currency codes so localized pricing can be added later.

export type CurrencyCode = "USD" | "GBP" | "EUR" | "CAD" | "AUD" | "INR";

export interface PlanPrice {
  currency: CurrencyCode;
  amountMinor: number; // e.g. 999 = 9.99
  interval: "month";
}

export interface Plan {
  id: "free" | "plus" | "pro";
  name: string;
  available: boolean; // false = not purchasable yet
  prices: PlanPrice[];
  entitlements: {
    sessionsPerDay: number | null; // null = use the global default in limits.ts
    sessionHistory: boolean;
    progressTracking: boolean;
  };
}

export const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    available: true,
    prices: [{ currency: "USD", amountMinor: 0, interval: "month" }],
    entitlements: { sessionsPerDay: null, sessionHistory: true, progressTracking: false },
  },
  {
    id: "plus",
    name: "Plus",
    available: false,
    prices: [{ currency: "USD", amountMinor: 999, interval: "month" }],
    entitlements: { sessionsPerDay: 30, sessionHistory: true, progressTracking: true },
  },
  {
    id: "pro",
    name: "Pro",
    available: false,
    prices: [{ currency: "USD", amountMinor: 1999, interval: "month" }],
    entitlements: { sessionsPerDay: 60, sessionHistory: true, progressTracking: true },
  },
];

export function getPlan(id: string | null | undefined): Plan {
  return plans.find((p) => p.id === id) ?? plans[0];
}
