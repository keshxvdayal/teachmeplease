import type { ComponentProps } from "react";

export const inputClass =
  "block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 transition-shadow disabled:opacity-60";

export function Label(props: ComponentProps<"label">) {
  return <label {...props} className={`mb-1.5 block text-sm font-medium text-ink-2 ${props.className ?? ""}`} />;
}

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {children}
    </p>
  );
}
