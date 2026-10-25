import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getActor } from "@/lib/auth/identity";
import { getLanguage } from "@/lib/config/languages";
import { limits } from "@/lib/config/limits";
import { AppError } from "@/lib/errors";
import { getSessionView } from "@/lib/sessions/service";
import { PracticeSession } from "@/components/practice/practice-session";

export const metadata: Metadata = { title: "Practice session", robots: { index: false } };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session;
  try {
    session = await getSessionView(await getActor(), id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  if (session.status !== "active") redirect(`/session/${id}/results`);

  const ttsLocale =
    session.language === "en" ? (session.speechLocale ?? "en-US") : (getLanguage(session.language)?.ttsLocale ?? "en-US");

  return <PracticeSession initial={session} ttsLocale={ttsLocale} maxChars={limits.maxUserMessageChars} />;
}
