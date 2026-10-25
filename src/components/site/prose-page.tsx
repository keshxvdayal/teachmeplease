import { SiteHeader } from "./header";
import { SiteFooter } from "./footer";

export function ProsePage({ title, updated, children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-4xl font-extrabold sm:text-5xl">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-ink-2 [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:marker:text-brand [&_strong]:text-ink [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
