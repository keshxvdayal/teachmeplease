"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { formatPrice, plans, type Billing, type Currency } from "@/lib/config/pricing";

const CURRENCY_KEY = "tmp_currency";

export function PricingTable({ detected, contactEmail }: { detected: Currency | null; contactEmail: string }) {
  const [currency, setCurrency] = useState<Currency>(detected ?? "USD");
  const [billing, setBilling] = useState<Billing>("yearly");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENCY_KEY);
      if (saved === "INR" || saved === "USD") return setCurrency(saved);
    } catch {
      /* ignore */
    }
    // No country from the server: an Indian time zone is a good enough sign.
    if (!detected) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") setCurrency("INR");
    }
  }, [detected]);

  const pickCurrency = (c: Currency) => {
    setCurrency(c);
    try {
      localStorage.setItem(CURRENCY_KEY, c);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
        <Toggle
          label="Billing"
          value={billing}
          onChange={setBilling}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly", extra: "save 33%" },
          ]}
        />
        <Toggle
          label="Currency"
          value={currency}
          onChange={pickCurrency}
          options={[
            { value: "INR", label: "₹ India" },
            { value: "USD", label: "$ International" },
          ]}
        />
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3 lg:items-stretch">
        {plans.map((plan) => {
          const monthly = plan.price[currency][billing];
          const yearlyTotal = plan.price[currency].yearly * 12;
          const href = plan.cta.href === "mailto:" ? `mailto:${contactEmail}?subject=${encodeURIComponent("TeachMePlease for teams")}` : plan.cta.href;
          return (
            <section
              key={plan.id}
              aria-labelledby={`plan-${plan.id}`}
              className={`relative flex flex-col rounded-[28px] p-7 ${
                plan.highlight ? "bg-night text-white shadow-lift ring-1 ring-night" : "border border-line bg-surface shadow-card"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-7 rounded-full bg-lime px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                  Most popular
                </span>
              )}
              <h2 id={`plan-${plan.id}`} className="text-xl font-bold">
                {plan.name}
              </h2>
              <p className={`mt-1 text-sm ${plan.highlight ? "text-white/70" : "text-muted"}`}>{plan.blurb}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-5xl font-extrabold tabular-nums tracking-tight">{formatPrice(monthly, currency)}</span>
                <span className={`text-sm ${plan.highlight ? "text-white/60" : "text-muted"}`}>
                  {monthly === 0 ? "forever" : plan.perSeat ? "/ seat / month" : "/ month"}
                </span>
              </p>
              <p className={`mt-1 h-5 text-xs ${plan.highlight ? "text-white/60" : "text-muted"}`}>
                {monthly > 0 && billing === "yearly" ? `${formatPrice(yearlyTotal, currency)} billed yearly${plan.perSeat ? " per seat" : ""}` : monthly > 0 ? "Billed monthly, cancel anytime" : ""}
              </p>

              <a
                href={href}
                className={`mt-6 w-full ${buttonClass(plan.highlight ? "inverse" : plan.id === "free" ? "primary" : "secondary", "md")}`}
              >
                {plan.cta.label}
              </a>

              <ul className="mt-7 space-y-3 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className={`mt-0.5 size-4 shrink-0 ${plan.highlight ? "text-lime" : "text-brand"}`} aria-hidden />
                    <span className={plan.highlight ? "text-white/85" : "text-ink-2"}>{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        {currency === "INR"
          ? "Prices in Indian rupees, inclusive of GST. Pay with UPI, cards or net banking."
          : "Prices in US dollars. Local taxes may apply at checkout."}
      </p>
    </div>
  );
}

function Toggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; extra?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line bg-surface p-1 shadow-card">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-ink text-white" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
            {o.extra && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${active ? "bg-lime text-ink" : "bg-lime-soft text-ink"}`}>
                {o.extra}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
