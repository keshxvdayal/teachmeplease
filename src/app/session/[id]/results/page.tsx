import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { getSessionView } from "@/lib/sessions/service";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { ResultsView } from "@/components/scorecard/results-view";

export const metadata: Metadata = { title: "Your feedback", robots: { index: false } };

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  let session;
  try {
    session = await getSessionView(actor, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <ResultsView initial={session} isAnonymous={actor?.type !== "user"} />
      </main>
      <SiteFooter />
    </>
  );
}
