import { useEffect, useState } from "react";
import { locale, translate } from "../i18n";

/** Re-renders every `intervalMs` — for "12 s ago" labels that must keep counting. */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function timeAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return translate("time.justNow");
  if (s < 60) return translate("time.secondsAgo", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return translate("time.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return translate("time.hoursAgo", { n: h });
  return new Date(iso).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" });
}
