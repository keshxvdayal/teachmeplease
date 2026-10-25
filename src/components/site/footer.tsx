import Link from "next/link";
import { site } from "@/lib/config/site";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-night text-white/70">
      <div className="bg-dots-light absolute inset-0" aria-hidden />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 pt-14 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-xs">
          <Logo tone="light" />
          <p className="mt-3 text-sm">{site.tagline}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href="/about" className="hover:text-white">About</Link>
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-white">Terms of Service</Link>
          <a href={`mailto:${site.contactEmail}`} className="hover:text-white">Contact</a>
        </nav>
      </div>
      <p
        aria-hidden
        className="relative mx-auto mt-10 max-w-6xl select-none px-4 text-center font-display text-[17vw] font-extrabold leading-[0.8] tracking-tighter text-transparent sm:px-6 lg:text-[12rem]"
        style={{ WebkitTextStroke: "1px rgb(255 255 255 / 0.14)" }}
      >
        rehearse.
      </p>
      <div className="relative border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-white/50 sm:px-6">
          © {new Date().getUTCFullYear()} {site.name}. Practice conversations are simulated by AI and feedback is AI-generated.
        </p>
      </div>
    </footer>
  );
}
