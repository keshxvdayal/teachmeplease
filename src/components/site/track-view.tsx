"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/client/api";

export function TrackView({ name, props }: { name: "landing_view" | "scorecard_view"; props?: Record<string, string> }) {
  useEffect(() => {
    const key = `tmp_tracked:${name}:${JSON.stringify(props ?? {})}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage unavailable: track anyway */
    }
    trackEvent(name, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
