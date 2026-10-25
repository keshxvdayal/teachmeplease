import { SiteHeader } from "@/components/site/header";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="relative mx-auto max-w-lg px-4 py-24 text-center">
        <p
          className="font-display text-[9rem] font-extrabold leading-none tracking-tighter text-transparent"
          style={{ WebkitTextStroke: "2px var(--color-brand)" }}
          aria-hidden
        >
          404
        </p>
        <h1 className="mt-2 text-3xl font-extrabold">
          Page not <span className="font-serif font-normal italic text-gradient">found.</span>
        </h1>
        <p className="mt-3 text-ink-2">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <ButtonLink href="/" className="mt-8">
          Go home
        </ButtonLink>
      </main>
    </>
  );
}
