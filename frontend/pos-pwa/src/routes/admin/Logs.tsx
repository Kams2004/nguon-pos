import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  BadgeCheck,
  Image as ImageIcon,
  KeyRound,
  MonitorSmartphone,
  ScanLine,
  Settings,
  ShoppingCart,
  Tags,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useLiveEvents, useSession } from "../../context/SessionContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AuditCategory, AuditEntry } from "../../lib/api/types";
import { Pagination } from "../../components/Pagination";
import { Loading, PageHeader, RefreshButton, SearchInput } from "../../components/ui";

const CATEGORIES: { value: AuditCategory; label: string; icon: LucideIcon; tone: string }[] = [
  { value: "AUTH", label: "Connexions", icon: KeyRound, tone: "bg-slate-100 text-slate-700" },
  { value: "TERMINAL", label: "Caisses", icon: MonitorSmartphone, tone: "bg-blue-50 text-secondary" },
  { value: "SALE", label: "Ventes", icon: ShoppingCart, tone: "bg-emerald-50 text-emerald-700" },
  { value: "SCAN", label: "Contrôle d'entrée", icon: ScanLine, tone: "bg-teal-50 text-teal-700" },
  { value: "VOID", label: "Annulations", icon: Ban, tone: "bg-red-50 text-destructive" },
  { value: "CATALOG", label: "Billetterie & portes", icon: Tags, tone: "bg-amber-50 text-amber-700" },
  { value: "USER", label: "Utilisateurs", icon: UserCog, tone: "bg-violet-50 text-violet-700" },
  { value: "SETTINGS", label: "Paramètres", icon: Settings, tone: "bg-orange-50 text-orange-700" },
  { value: "MEDIA", label: "Médiathèque", icon: ImageIcon, tone: "bg-pink-50 text-pink-700" },
  { value: "SUBSCRIPTION", label: "Abonnement", icon: BadgeCheck, tone: "bg-indigo-50 text-indigo-700" },
];

// Everything that happened, across all services, newest first — and new
// entries appear on their own as they happen.
export default function Logs() {
  const { session } = useSession();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await api.listAudit(session.token, { page, size, category, q: debounced });
      setEntries(res.content);
      setTotal(res.totalElements);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setEntries([]);
    }
  }, [session, page, size, category, debounced]);

  useEffect(() => {
    load();
  }, [load]);
  // A new search or category starts again from the newest entries.
  useEffect(() => setPage(0), [category, debounced, size]);


  useLiveEvents(["AUDIT"], (e) => {
    const entry = e.data as AuditEntry;
    if (category && entry.category !== category) return;
    const q = debounced.toLowerCase();
    if (q && !`${entry.summary} ${entry.actorName ?? ""}`.toLowerCase().includes(q)) return;
    setTotal((t) => t + 1);
    // Live entries slide in on the first page only; on later pages they'd shift what you're reading.
    if (page !== 0) return;
    setEntries((prev) => (prev && !prev.some((p) => p.id === entry.id) ? [entry, ...prev].slice(0, size) : prev));
    setFresh((prev) => new Set(prev).add(entry.id));
    setTimeout(() => setFresh((prev) => {
      const next = new Set(prev);
      next.delete(entry.id);
      return next;
    }), 4_000);
  });
  // After a reconnect, refetch: entries written while the stream was down never arrived live.
  useLiveEvents(["HELLO"], () => load());

  if (!session) return null;

  return (
    <>
      <PageHeader
        title="Journal d'activité"
        subtitle="Toutes les actions : connexions, ventes, scans, caisses en ligne/hors-ligne, modifications de la configuration."
        actions={
          <>
            <RefreshButton onRefresh={load} />
          </>
        }
      />

      <div className="card space-y-3 p-4">
        <SearchInput value={query} onChange={setQuery} placeholder="Rechercher (nom, référence, billet…)" />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory("")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${category === "" ? "bg-secondary text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            Tout
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                category === c.value ? "bg-secondary text-white" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        {error && <p className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
        {entries === null ? (
          <Loading />
        ) : entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Aucune activité pour ces critères.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => {
              const c = CATEGORIES.find((x) => x.value === e.category);
              const Icon = c?.icon ?? Settings;
              const d = new Date(e.occurredAt);
              return (
                <li
                  key={e.id}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors duration-1000 ${fresh.has(e.id) ? "bg-amber-50" : ""}`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${c?.tone ?? "bg-muted"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{e.summary}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {e.actorName ?? "Système"} · {c?.label ?? e.category}
                    </p>
                  </div>
                  <time className="flex-shrink-0 text-right text-[11px] leading-tight text-muted-foreground" dateTime={e.occurredAt}>
                    {d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    <br />
                    <span className="font-semibold text-foreground">{d.toLocaleTimeString("fr-FR")}</span>
                  </time>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pages={Math.max(1, Math.ceil(total / size))} total={total} size={size} onPage={setPage} onSize={setSize} unit="entrées" />
      </div>
    </>
  );
}
