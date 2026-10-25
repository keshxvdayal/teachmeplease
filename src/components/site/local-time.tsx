"use client";

import { useEffect, useState } from "react";

/** Renders a UTC timestamp in the viewer's local timezone (after hydration to avoid mismatches). */
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: "datetime" | "date" }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date(iso);
    setText(
      mode === "date"
        ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
        : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
    );
  }, [iso, mode]);
  return <time dateTime={iso}>{text ?? " "}</time>;
}
