import { SiteHeader } from "@/components/site/header";

/** Split layout for sign-in / sign-up: form on the left, a decorative panel on the right. */
export function AuthShell({ title, accent, subtitle, children }: { title: string; accent: string; subtitle: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader minimal />
      <main id="main" className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16">
        <div className="mx-auto w-full max-w-sm animate-rise">
          <h1 className="text-4xl font-extrabold">
            {title} <span className="font-serif font-normal italic text-gradient">{accent}</span>
          </h1>
          <p className="mb-8 mt-3 text-ink-2">{subtitle}</p>
          {children}
        </div>

        <div
          className="grain relative hidden min-h-[520px] overflow-hidden rounded-[36px] bg-linear-to-br from-brand via-[#7c3df2] to-[#c03df0] p-10 text-white lg:block"
          aria-hidden
        >
          <div className="bg-dots-light absolute inset-0" />
          <div className="absolute -right-16 -top-16 size-72 rounded-full bg-accent/50 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 size-72 rounded-full bg-lime/40 blur-3xl" />
          <div className="relative flex h-full flex-col justify-between gap-10">
            <p className="font-serif text-4xl italic leading-tight">
              “The best time to practice a hard conversation is before you have it.”
            </p>
            <div className="space-y-3">
              <p className="w-fit max-w-[80%] rounded-3xl rounded-bl-md bg-white/95 px-4 py-3 text-sm text-ink shadow-xl">
                Another freelancer quoted half. Why should we pay more?
              </p>
              <p className="ml-auto w-fit max-w-[80%] rounded-3xl rounded-br-md bg-night px-4 py-3 text-sm shadow-xl">
                Fair question — let&apos;s compare what each quote actually includes.
              </p>
              <p className="w-fit rounded-full bg-lime px-3 py-1.5 text-xs font-bold text-ink shadow-lg">✦ Strong reframe</p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
