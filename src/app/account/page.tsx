import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { AccountActions } from "@/components/auth/account-actions";
import { getActor } from "@/lib/auth/identity";
import { getPlan } from "@/lib/config/plans";
import { retention } from "@/lib/config/limits";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const actor = await getActor();
  if (actor?.type !== "user") redirect("/signin?next=/account");

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-4xl font-extrabold sm:text-5xl">
          Your <span className="font-serif font-normal italic text-gradient">account</span>
        </h1>
        <dl className="mt-8 divide-y divide-line rounded-3xl border border-line bg-surface shadow-card">
          <div className="flex justify-between gap-4 px-6 py-4">
            <dt className="text-sm text-muted">Email</dt>
            <dd className="text-sm font-medium">{actor.email}</dd>
          </div>
          <div className="flex justify-between gap-4 px-6 py-4">
            <dt className="text-sm text-muted">Plan</dt>
            <dd className="text-sm font-medium">{getPlan(actor.planId).name}</dd>
          </div>
          <div className="flex justify-between gap-4 px-6 py-4">
            <dt className="text-sm text-muted">Transcript retention</dt>
            <dd className="text-right text-sm">{retention.userDays} days, or until you delete them</dd>
          </div>
        </dl>
        <AccountActions />
      </main>
      <SiteFooter />
    </>
  );
}
