import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getActor } from "@/lib/auth/identity";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "./logo";

const navLink = "whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-ink/5 hover:text-ink";

export async function SiteHeader({ minimal = false }: { minimal?: boolean }) {
  const actor = await getActor();
  const signedIn = actor?.type === "user";

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 rounded-full border border-line/80 bg-surface/75 pl-4 pr-2 shadow-card backdrop-blur-xl supports-backdrop-filter:bg-surface/65 sm:pl-5">
        <Logo />
        {!minimal && (
          <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
            <Link href="/practice" className={`hidden sm:block ${navLink}`}>
              Scenarios
            </Link>
            <Link href="/history" className={navLink}>
              History
            </Link>
            <Link href={signedIn ? "/account" : "/signin"} className={navLink}>
              {signedIn ? "Account" : "Sign in"}
            </Link>
            <span className="ml-1 hidden sm:block">
              <ButtonLink href="/practice" size="sm">
                Start practicing <ArrowRight className="size-3.5" aria-hidden />
              </ButtonLink>
            </span>
          </nav>
        )}
      </div>
    </header>
  );
}
