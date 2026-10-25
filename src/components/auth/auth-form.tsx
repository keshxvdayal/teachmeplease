"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormError, inputClass, Label } from "@/components/ui/field";
import { api, ApiRequestError } from "@/lib/client/api";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: { email, password } });
      const next = params.get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/history");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="email">Email</Label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          aria-describedby={isSignup ? "pw-hint" : undefined}
        />
        {isSignup && (
          <p id="pw-hint" className="mt-1.5 text-xs text-muted">
            At least 8 characters.
          </p>
        )}
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
      </Button>
      {isSignup && (
        <p className="text-xs text-muted">
          Any practice sessions on this device will be saved to your account. By creating an account you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
      )}
      <p className="text-center text-sm text-ink-2">
        {isSignup ? "Already have an account? " : "New to TeachMePlease? "}
        <Link href={isSignup ? "/signin" : "/signup"} className="font-medium text-brand hover:underline">
          {isSignup ? "Sign in" : "Create a free account"}
        </Link>
      </p>
    </form>
  );
}
