import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, DoorOpen, Globe, KeyRound, MonitorSmartphone, Pencil, Plus, ShieldOff, Ticket, UserPlus, Users, X } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminGate, AdminTicketType, AdminUser, Device, EnrollmentCode, PendingEnrollment, TerminalStatus } from "../../lib/api/types";
import { formatDateTime, formatTime } from "../../lib/format";
import { UserFormModal } from "../../components/UserFormModal";
import { Modal, PageHeader, Pill, RefreshButton, SkeletonCards } from "../../components/ui";
import { GuideButton } from "../../components/SetupGuide";
import { useI18n } from "../../i18n";

/** "Porte Nord" → "PORTE-NORD": a code proposed from the name (still editable). */
function codeFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

type Data = {
  gates: AdminGate[];
  devices: Device[];
  terminals: TerminalStatus[];
  pending: PendingEnrollment[];
  users: AdminUser[];
  ticketTypes: AdminTicketType[];
};

/**
 * Portes & caisses: everything about each gate in one place — its tills
 * (who is using each one, its state, the ones waiting to be enrolled), its
 * cashiers, and the two actions that set a gate up: add a cashier, enroll
 * a till.
 */
export default function Gates() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<AdminGate | "new" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cashierFor, setCashierFor] = useState<AdminGate | null>(null);
  const [enrollFor, setEnrollFor] = useState<AdminGate | null>(null);
  const isSuperAdmin = session?.role === "SUPER_ADMIN";

  const load = useCallback(async () => {
    if (!session) return;
    const none = <T,>() => [] as T[];
    const [gates, devices, terminals, pending, users, ticketTypes] = await Promise.all([
      api.listGates(session.token),
      api.listDevices(session.token).catch(none<Device>),
      api.syncStatus(session.token).catch(none<TerminalStatus>),
      api.listPendingEnrollments(session.token).catch(none<PendingEnrollment>),
      api.listUsers(session.token).catch(none<AdminUser>),
      api.listTicketTypesAdmin(session.token).catch(none<AdminTicketType>),
    ]);
    setData({ gates, devices, terminals, pending, users, ticketTypes });
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["CATALOG_CHANGED", "TERMINAL_STATUS", "AUDIT"], load);

  if (!session) return null;

  const openCreate = () => {
    setName("");
    setCode("");
    setCodeTouched(false);
    setError(null);
    setEditing("new");
  };
  const openEdit = (g: AdminGate) => {
    setName(g.name);
    setCode(g.code);
    setError(null);
    setEditing(g);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const isNew = editing === "new";
    const ok = await confirm({
      title: isNew ? t("settings.gates.confirmCreateTitle") : t("settings.gates.confirmRenameTitle"),
      message: isNew
        ? t("settings.gates.confirmCreateMessage", { name, code })
        : t("settings.gates.confirmRenameMessage", { old: editing.name, name }),
      confirmLabel: isNew ? t("settings.create") : t("common.save"),
    });
    if (!ok) return;
    try {
      if (isNew) await api.createGate(session.token, name, code);
      else await api.updateGate(session.token, editing.id, name, editing.active);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, isNew ? t("settings.gates.createError") : t("settings.saveError")));
    }
  };

  const toggleActive = async (gate: AdminGate) => {
    const ok = await confirm({
      title: gate.active ? t("settings.deactivateNamed", { name: gate.name }) : t("settings.activateNamed", { name: gate.name }),
      message: gate.active ? t("settings.gates.deactivateMessage") : t("settings.gates.activateMessage"),
      confirmLabel: gate.active ? t("common.deactivate") : t("common.activate"),
      tone: gate.active ? "danger" : "default",
    });
    if (!ok) return;
    await api.updateGate(session.token, gate.id, gate.name, !gate.active);
    await load();
  };

  const revoke = async (d: Device) => {
    const ok = await confirm({
      title: t("settings.devices.revokeTitle"),
      message: t("settings.devices.revokeMessage", { label: d.label }),
      confirmLabel: t("settings.devices.revoke"),
      tone: "danger",
    });
    if (!ok) return;
    setActionError(null);
    try {
      await api.revokeDevice(session.token, d.id);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  const cancelPending = async (p: PendingEnrollment) => {
    const ok = await confirm({
      title: t("settings.gates.cancelCodeTitle"),
      message: t("settings.gates.cancelCodeMessage", { label: p.label || t("settings.gates.unnamedTill") }),
      confirmLabel: t("settings.gates.cancelCode"),
      tone: "danger",
    });
    if (!ok) return;
    setActionError(null);
    try {
      await api.cancelEnrollment(session.token, p.id);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={t("settings.gates.title")}
        subtitle={t("settings.gates.subtitle")}
        actions={
          <>
            <GuideButton here="gates" />
            <RefreshButton onRefresh={load} />
            {isSuperAdmin && (
              <button onClick={openCreate} className="btn-gold">
                <Plus className="h-4 w-4" /> {t("settings.gates.newGate")}
              </button>
            )}
          </>
        }
      />

      {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{actionError}</p>}

      {data === null ? (
        <SkeletonCards count={2} className="space-y-5" />
      ) : data.gates.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <DoorOpen className="h-10 w-10 text-royal/30" strokeWidth={1.5} />
          <p className="max-w-[48ch] text-sm text-muted-foreground">{t("settings.gates.empty")}</p>
          {isSuperAdmin && (
            <button onClick={openCreate} className="btn-gold">
              <Plus className="h-4 w-4" /> {t("settings.gates.newGate")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {data.gates.map((g) => (
            <GateSection
              key={g.id}
              gate={g}
              data={data}
              isSuperAdmin={isSuperAdmin}
              onEdit={() => openEdit(g)}
              onToggle={() => toggleActive(g)}
              onAddCashier={() => setCashierFor(g)}
              onEnroll={() => setEnrollFor(g)}
              onRevoke={revoke}
              onCancelPending={cancelPending}
            />
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? t("settings.gates.newGate") : t("settings.editNamed", { name: editing.name })}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit} className="space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
            <div>
              <label className="field-label">{t("settings.name")}</label>
              <input
                required
                autoFocus
                maxLength={200}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (editing === "new" && !codeTouched) setCode(codeFromName(e.target.value));
                }}
                className="field"
                placeholder={t("settings.gates.namePlaceholder")}
              />
            </div>
            <div>
              <label className="field-label">{t("settings.gates.code")}</label>
              <input
                required
                disabled={editing !== "new"}
                maxLength={50}
                value={code}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(e.target.value.toUpperCase());
                }}
                className="field font-mono disabled:bg-muted disabled:text-muted-foreground"
                placeholder="GATE-C"
              />
              {editing !== "new" && <p className="mt-1 text-[11px] text-muted-foreground">{t("settings.gates.codeLocked")}</p>}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-outline flex-1">
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn-gold flex-1">
                {editing === "new" ? t("settings.gates.createGate") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {cashierFor && data && (
        <UserFormModal
          editing="new"
          gates={data.gates}
          presetGateId={cashierFor.id}
          onClose={() => setCashierFor(null)}
          onSaved={() => {
            setCashierFor(null);
            load();
          }}
        />
      )}

      {enrollFor && data && (
        <EnrollTillModal gate={enrollFor} nextNo={nextTillNo(enrollFor.id, data)} onClose={() => setEnrollFor(null)} onCreated={load} />
      )}
    </>
  );
}

/** The number the next till of this gate will most likely get. */
function nextTillNo(gateId: string, data: Data): number {
  const max = data.devices.filter((d) => d.gateId === gateId).reduce((m, d) => Math.max(m, d.deviceNo), 0);
  return max + 1 + data.pending.filter((p) => p.gateId === gateId).length;
}

function GateSection({
  gate,
  data,
  isSuperAdmin,
  onEdit,
  onToggle,
  onAddCashier,
  onEnroll,
  onRevoke,
  onCancelPending,
}: {
  gate: AdminGate;
  data: Data;
  isSuperAdmin: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onAddCashier: () => void;
  onEnroll: () => void;
  onRevoke: (d: Device) => void;
  onCancelPending: (p: PendingEnrollment) => void;
}) {
  const { t } = useI18n();
  const presence = new Map(data.terminals.map((term) => [term.terminalId, term]));
  const tills = data.devices.filter((d) => d.gateId === gate.id && d.status === "ACTIVE").sort((a, b) => a.deviceNo - b.deviceNo);
  const revokedCount = data.devices.filter((d) => d.gateId === gate.id && d.status === "REVOKED").length;
  const pending = data.pending.filter((p) => p.gateId === gate.id);
  const deviceIds = new Set(data.devices.map((d) => d.id));
  // Browser tills (the web version) currently connected to this gate.
  const browserTills = data.terminals.filter((term) => term.gateId === gate.id && term.online && !deviceIds.has(term.terminalId));
  const cashiers = data.users.filter((u) => u.active && u.role !== "SUPER_ADMIN" && u.assignedGateId === gate.id);
  const types = data.ticketTypes.filter((tt) => tt.active && (tt.gateId === gate.id || tt.gateId === null)).length;
  const onlineCount = tills.filter((d) => presence.get(d.id)?.online ?? d.online).length;
  // Who is signed in where, to show it next to each cashier too.
  const tillOfUser = new Map<string, string>();
  for (const d of tills) {
    const p = presence.get(d.id);
    if (p?.online && p.currentUserId) tillOfUser.set(p.currentUserId, d.label);
  }
  for (const b of browserTills) if (b.currentUserId) tillOfUser.set(b.currentUserId, b.deviceLabel ?? t("settings.gates.browserTill"));

  return (
    <section className={`card overflow-hidden ${gate.active ? "" : "opacity-75"}`} aria-labelledby={`gate-${gate.id}`}>
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-4">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${
            gate.active
              ? "bg-gradient-to-br from-royal to-secondary text-white shadow-md shadow-secondary/30"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <DoorOpen className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`gate-${gate.id}`} className="font-display text-lg font-bold text-foreground">
              {gate.name}
            </h2>
            <span className="font-mono text-xs text-muted-foreground">{gate.code}</span>
            {gate.active ? (
              <Pill tone="success">{t("common.activeFem")}</Pill>
            ) : (
              <Pill tone="warning">{t("settings.gates.deactivated")}</Pill>
            )}
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MonitorSmartphone className="h-3.5 w-3.5" /> {t("settings.gates.tillsSummary", { online: onlineCount, count: tills.length })}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> {t("settings.gates.cashierCount", { count: cashiers.length })}
            </span>
            <span className="flex items-center gap-1.5">
              <Ticket className="h-3.5 w-3.5" /> {t("settings.gates.typeCount", { count: types })}
            </span>
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex gap-2">
            <button onClick={onEdit} className="btn-outline px-3 py-1.5 text-xs">
              <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
            </button>
            <button onClick={onToggle} className={`btn-outline px-3 py-1.5 text-xs ${gate.active ? "text-destructive" : "text-success"}`}>
              {gate.active ? t("common.deactivate") : t("common.activate")}
            </button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        {/* Tills */}
        <div className="min-w-0 lg:border-r lg:border-border">
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("settings.gates.tills")}</h3>
            {isSuperAdmin && gate.active && (
              <button onClick={onEnroll} className="btn-blue px-3 py-1.5 text-xs">
                <KeyRound className="h-3.5 w-3.5" /> {t("settings.gates.enrollTill")}
              </button>
            )}
          </div>
          {tills.length === 0 && pending.length === 0 && browserTills.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{t("settings.gates.noTill")}</p>
          ) : (
            <ul className="divide-y divide-border/60 pb-1">
              {tills.map((d) => {
                const p = presence.get(d.id);
                const online = p?.online ?? d.online;
                const user = online && p?.loggedIn ? p.currentUserName : null;
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <Link to={`/admin/sync-status/${d.id}`} className="group min-w-[9rem] flex-1">
                      <p className="font-semibold text-foreground group-hover:text-secondary">{d.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.devices.number", { n: d.deviceNo })}
                        {d.appVersion ? ` · v${d.appVersion}` : ""}
                      </p>
                    </Link>
                    <div className="w-28">
                      {online ? (
                        <Pill tone="success" dot>
                          {t("common.online")}
                        </Pill>
                      ) : (
                        <Pill tone="neutral" dot>
                          {t("common.offline")}
                        </Pill>
                      )}
                    </div>
                    <div className="min-w-[10rem] flex-1 text-sm">
                      {user ? (
                        <span className="font-semibold text-foreground">{t("settings.gates.usedBy", { name: user })}</span>
                      ) : online ? (
                        <span className="text-muted-foreground">{t("settings.gates.nobodySignedIn")}</span>
                      ) : (
                        <span className="text-muted-foreground">
                          {d.lastSeenAt
                            ? t("settings.gates.lastSeen", { time: formatDateTime(d.lastSeenAt) })
                            : t("settings.gates.neverSeen")}
                        </span>
                      )}
                      {(p?.localPendingCount ?? 0) > 0 && (
                        <span className="ml-2 align-middle">
                          <Pill tone="warning">{t("reports.tills.pendingCount", { n: p!.localPendingCount })}</Pill>
                        </span>
                      )}
                    </div>
                    {isSuperAdmin && (
                      <button
                        onClick={() => onRevoke(d)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                        title={t("settings.devices.revoke")}
                        aria-label={`${t("settings.devices.revoke")} — ${d.label}`}
                      >
                        <ShieldOff className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
              {browserTills.map((b) => (
                <li key={b.terminalId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="min-w-[9rem] flex-1">
                    <p className="font-semibold text-foreground">{b.deviceLabel ?? t("settings.gates.browserTill")}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" /> {t("settings.gates.browserTill")}
                    </p>
                  </div>
                  <div className="w-28">
                    <Pill tone="success" dot>
                      {t("common.online")}
                    </Pill>
                  </div>
                  <div className="min-w-[10rem] flex-1 text-sm">
                    {b.loggedIn && b.currentUserName ? (
                      <span className="font-semibold text-foreground">{t("settings.gates.usedBy", { name: b.currentUserName })}</span>
                    ) : (
                      <span className="text-muted-foreground">{t("settings.gates.nobodySignedIn")}</span>
                    )}
                  </div>
                  {isSuperAdmin && <span className="w-7" />}
                </li>
              ))}
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-amber-50/50 px-5 py-3">
                  <div className="min-w-[9rem] flex-1">
                    <p className="font-semibold text-foreground">{p.label || t("settings.gates.unnamedTill")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.gates.waitingEnrollment")}</p>
                  </div>
                  <div className="w-28">
                    <Pill tone="warning">
                      <Clock className="h-3 w-3" /> {t("settings.gates.codeIssued")}
                    </Pill>
                  </div>
                  <div className="min-w-[10rem] flex-1 text-sm text-muted-foreground">
                    {t("settings.gates.codeValidUntil", { time: formatTime(p.expiresAt) })}
                  </div>
                  {isSuperAdmin && (
                    <button
                      onClick={() => onCancelPending(p)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-destructive"
                      title={t("settings.gates.cancelCode")}
                      aria-label={t("settings.gates.cancelCode")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {revokedCount > 0 && (
            <p className="px-5 pb-4 text-[11px] text-muted-foreground">
              {t("settings.gates.revokedCount", { count: revokedCount })}{" "}
              <Link to="/admin/devices" className="font-semibold text-secondary hover:underline">
                {t("settings.gates.seeAllTills")}
              </Link>
            </p>
          )}
        </div>

        {/* Cashiers */}
        <div className="border-t border-border lg:border-t-0">
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("settings.gates.cashiers")}</h3>
            {isSuperAdmin && gate.active && (
              <button onClick={onAddCashier} className="btn-outline px-3 py-1.5 text-xs">
                <UserPlus className="h-3.5 w-3.5" /> {t("settings.gates.addCashierShort")}
              </button>
            )}
          </div>
          {cashiers.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">{t("settings.gates.noCashier")}</p>
          ) : (
            <ul className="space-y-1 px-3 pb-4">
              {cashiers.map((u) => {
                const at = tillOfUser.get(u.id);
                return (
                  <li key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${at ? "bg-emerald-500" : "bg-border"}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{u.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {at ? t("settings.gates.signedInAt", { till: at }) : `@${u.username}`}
                        {u.role === "COORDINATOR" ? ` · ${t("role.COORDINATOR")}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** Names the till about to be enrolled, then shows its one-time code. */
function EnrollTillModal({
  gate,
  nextNo,
  onClose,
  onCreated,
}: {
  gate: AdminGate;
  nextNo: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const { session } = useSession();
  const suggested = t("settings.gates.tillNo", { n: nextNo });
  const [label, setLabel] = useState(suggested);
  const [code, setCode] = useState<EnrollmentCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!session) return null;

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCode(await api.createEnrollmentCode(session.token, gate.id, label.trim()));
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("settings.gates.enrollCodeTitle", { gate: gate.name })} onClose={onClose}>
      {code ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t("settings.gates.codeFor", { label: code.label || suggested, gate: gate.name })}
          </p>
          <p className="select-all font-mono text-4xl font-extrabold tracking-widest text-royal">{code.code}</p>
          <p className="mx-auto max-w-[46ch] text-sm text-muted-foreground">
            {t("settings.gates.enrollCodeHint", { time: formatDateTime(code.expiresAt) })}
          </p>
          <button onClick={onClose} className="btn-gold w-full">
            {t("common.close")}
          </button>
        </div>
      ) : (
        <form onSubmit={generate} className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("settings.gates.enrollIntro", { gate: gate.name })}</p>
          <div>
            <label className="field-label">{t("settings.devices.label")}</label>
            <input autoFocus maxLength={200} value={label} onChange={(e) => setLabel(e.target.value)} className="field" />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
          <button type="submit" disabled={busy} className="btn-gold w-full">
            <KeyRound className="h-4 w-4" /> {t("settings.devices.generate")}
          </button>
        </form>
      )}
    </Modal>
  );
}
