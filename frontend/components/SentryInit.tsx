"use client";

import { useEffect } from "react";

/**
 * Optional browser Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
 */
export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    let cancelled = false;
    import("@sentry/react").then((Sentry) => {
      if (cancelled) return;
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
