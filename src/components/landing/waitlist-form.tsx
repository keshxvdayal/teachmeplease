"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, inputClass, Label } from "@/components/ui/field";
import { api, ApiRequestError } from "@/lib/client/api";

export function WaitlistForm({ tracks }: { tracks: { id: string; title: string }[] }) {
  const [email, setEmail] = useState("");
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "already">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setError(null);
    setState("sending");
    try {
      const { data } = await api<{ alreadyJoined: boolean }>("/api/waitlist", {
        method: "POST",
        json: { email, trackId, consent },
      });
      setState(data.alreadyJoined ? "already" : "done");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      setState("idle");
    }
  }

  if (state === "done" || state === "already") {
    const track = tracks.find((t) => t.id === trackId)?.title;
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-soft p-4 text-sm">
        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <p className="text-ink">
          {state === "already" ? "You're already on the list" : "You're on the list"} for <strong>{track}</strong>. We'll email{" "}
          {email} when it launches.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div>
          <Label htmlFor="wl-email">Email</Label>
          <input
            id="wl-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <Label htmlFor="wl-track">Track</Label>
          <select id="wl-track" value={trackId} onChange={(e) => setTrackId(e.target.value)} className={`${inputClass} sm:w-72`}>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 rounded border-line-strong accent-brand"
        />
        <span>Also send me occasional product updates. (Optional — we'll always email you when your track launches.)</span>
      </label>
      <FormError>{error}</FormError>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          We only use your email for this. See our <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>.
        </p>
        <Button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Joining…" : "Join the waitlist"}
        </Button>
      </div>
    </form>
  );
}
