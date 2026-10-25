import Link from "next/link";

export function Logo({ tone = "ink" }: { tone?: "ink" | "light" }) {
  return (
    <Link
      href="/"
      className={`group inline-flex items-center gap-2 font-display text-[17px] font-bold tracking-tight ${tone === "light" ? "text-white" : "text-ink"}`}
      aria-label="TeachMePlease home"
    >
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden className="transition-transform duration-300 group-hover:-rotate-6">
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6b4ff7" />
            <stop offset="1" stopColor="#a13df5" />
          </linearGradient>
        </defs>
        <rect width="30" height="30" rx="9" fill="url(#logo-grad)" />
        <path d="M7.5 10.5h10a3 3 0 0 1 3 3v.5a3 3 0 0 1-3 3H14l-3.5 3v-3h-3z" fill="#fff" />
        <circle cx="22" cy="8.5" r="2.4" fill="var(--color-lime)" />
      </svg>
      <span>
        TeachMe<span className="font-serif text-[1.15em] font-normal italic text-brand">Please</span>
      </span>
    </Link>
  );
}
