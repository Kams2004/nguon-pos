import { useEffect, useState } from "react";
import { Network } from "lucide-react";
import { useI18n } from "../i18n";
import { isEdgeMode } from "../lib/platform";
import { edge } from "../lib/till/edgeClient";

/**
 * Desktop tills: how many tills of the gate this one reaches over the local
 * network. With central down they still share sales and entries — the badge
 * tells the cashier they are covered.
 */
export function LanPeersBadge() {
  const { t } = useI18n();
  const [peers, setPeers] = useState<{ connected: number; known: number } | null>(null);

  useEffect(() => {
    if (!isEdgeMode()) return;
    let stopped = false;
    const load = () =>
      edge
        .status()
        .then((s) => {
          if (!stopped) setPeers({ connected: s.peers.filter((p) => p.connected).length, known: s.peers.length });
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 10_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  if (!peers || peers.known === 0) return null;
  const label = t("gate.lan.peers", { count: peers.connected });
  return (
    <span
      className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold sm:flex ${
        peers.connected > 0 ? "bg-white/15 text-white" : "bg-white/5 text-white/60"
      }`}
      title={t("gate.lan.hint", { connected: peers.connected, known: peers.known })}
      aria-label={label}
    >
      <Network className="h-3.5 w-3.5" /> {label}
    </span>
  );
}
