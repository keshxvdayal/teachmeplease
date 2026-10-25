"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { api, ApiRequestError } from "@/lib/client/api";

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "signout" | "history" | "account") {
    const confirmText = {
      signout: null,
      history: "Delete all your practice sessions and scorecards? This can't be undone.",
      account: "Delete your account and all your practice data? This can't be undone.",
    }[kind];
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === "signout") await api("/api/auth/signout", { method: "POST" });
      if (kind === "history") {
        const { data } = await api<{ deleted: number }>("/api/sessions", { method: "DELETE" });
        setMessage(`Deleted ${data.deleted} ${data.deleted === 1 ? "session" : "sessions"}.`);
      }
      if (kind === "account") await api("/api/account", { method: "DELETE" });
      if (kind !== "history") {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <Button variant="secondary" onClick={() => run("signout")} disabled={busy !== null}>
        {busy === "signout" ? "Signing out…" : "Sign out"}
      </Button>

      <section className="rounded-3xl border border-danger/20 bg-surface p-6 shadow-card">
        <h2 className="text-xl font-bold">Your data</h2>
        <p className="mt-1 text-sm text-ink-2">Delete your practice history, or your whole account including all transcripts and scorecards.</p>
        {message && (
          <p role="status" className="mt-3 text-sm text-success">
            {message}
          </p>
        )}
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="danger" onClick={() => run("history")} disabled={busy !== null}>
            {busy === "history" ? "Deleting…" : "Delete practice history"}
          </Button>
          <Button variant="danger" onClick={() => run("account")} disabled={busy !== null}>
            {busy === "account" ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </section>
    </div>
  );
}
