import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <AuthShell title="Welcome" accent="back." subtitle="Sign in and pick up where you left off.">
      <Suspense>
        <AuthForm mode="signin" />
      </Suspense>
    </AuthShell>
  );
}
