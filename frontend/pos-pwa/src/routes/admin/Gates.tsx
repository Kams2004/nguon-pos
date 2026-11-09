import { useCallback, useEffect, useState } from "react";
import { DoorOpen, KeyRound, MonitorSmartphone, Pencil, Plus, Ticket, UserPlus, Users } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminGate, AdminTicketType, AdminUser, EnrollmentCode, TerminalStatus } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { UserFormModal } from "../../components/UserFormModal";
import { Loading, Modal, PageHeader, Pill, RefreshButton } from "../../components/ui";
import { GuideButton } from "../../components/SetupGuide";
import { useI18n } from "../../i18n";

/** "Porte Nord" → "PORTE-NORD": a code proposed from the name (still editable). */
function codeFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export default function Gates() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [gates, setGates] = useState<AdminGate[] | null>(null);
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const [ticketTypes, setTicketTypes] = useState<AdminTicketType[]>([]);
  const [editing, setEditing] = useState<AdminGate | "new" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cashierFor, setCashierFor] = useState<AdminGate | null>(null);
  const [enrollment, setEnrollment] = useState<{ gate: AdminGate; code: EnrollmentCode } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [g, t, tt, u] = await Promise.all([
      api.listGates(session.token),
      api.syncStatus(session.token).catch(() => [] as TerminalStatus[]),
      api.listTicketTypesAdmin(session.token).catch(() => [] as AdminTicketType[]),
      api.listUsers(session.token).catch(() => [] as AdminUser[]),
    ]);
    setGates(g);
    setTerminals(t);
    setTicketTypes(tt);
    setUsers(u);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["CATALOG_CHANGED", "TERMINAL_STATUS"], load);

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

  // One click: a code for this gate, to type into the till's "Enrôler cette caisse".
  const enrollTill = async (gate: AdminGate) => {
    setActionError(null);
    try {
      setEnrollment({ gate, code: await api.createEnrollmentCode(session.token, gate.id, "") });
    } catch (err) {
      setActionError(errorMessage(err));
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

  return (
    <>
      <PageHeader
        title={t("settings.gates.title")}
        subtitle={t("settings.gates.subtitle")}
        actions={
          <>
            <GuideButton here="gates" />
            <RefreshButton onRefresh={load} />
            <button onClick={openCreate} className="btn-blue">
              <Plus className="h-4 w-4" /> {t("settings.gates.newGate")}
            </button>
          </>
        }
      />

      {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{actionError}</p>}

      {gates === null ? (
        <Loading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gates.map((g) => {
            const tills = terminals.filter((t) => t.gateId === g.id);
            const online = tills.filter((t) => t.online).length;
            // Sold at this gate: its own ticket types plus the ones sold at every gate.
            const types = ticketTypes.filter((t) => t.active && (t.gateId === g.id || t.gateId === null)).length;
            const cashiers = users.filter((u) => u.active && u.role === "CASHIER" && u.assignedGateId === g.id).length;
            return (
              <div key={g.id} className={`card p-5 ${g.active ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${
                      g.active
                        ? "bg-gradient-to-br from-royal to-secondary text-white shadow-md shadow-secondary/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <DoorOpen className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-lg font-bold text-foreground">{g.name}</p>
                      {g.active ? (
                        <Pill tone="success">{t("common.activeFem")}</Pill>
                      ) : (
                        <Pill tone="warning">{t("settings.gates.deactivated")}</Pill>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{g.code}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-muted/60 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <MonitorSmartphone className="h-3.5 w-3.5" /> {t("settings.gates.tillsOnline")}
                    </p>
                    <p className="font-display text-base font-bold text-foreground">
                      {online} / {tills.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/60 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Ticket className="h-3.5 w-3.5" /> {t("settings.gates.ticketsSoldHere")}
                    </p>
                    <p className="font-display text-base font-bold text-foreground">{t("settings.gates.typeCount", { count: types })}</p>
                  </div>
                  <div className="rounded-xl bg-muted/60 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> {t("settings.gates.cashiers")}
                    </p>
                    <p className="font-display text-base font-bold text-foreground">{cashiers}</p>
                  </div>
                </div>
                {g.active && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => setCashierFor(g)} className="btn-blue py-2 text-xs">
                      <UserPlus className="h-3.5 w-3.5" /> {t("settings.gates.addCashier")}
                    </button>
                    <button onClick={() => enrollTill(g)} className="btn-blue py-2 text-xs">
                      <KeyRound className="h-3.5 w-3.5" /> {t("settings.gates.enrollTill")}
                    </button>
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <button onClick={() => openEdit(g)} className="btn-outline flex-1 py-2 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                  </button>
                  <button
                    onClick={() => toggleActive(g)}
                    className={`btn-outline flex-1 py-2 text-xs ${g.active ? "text-destructive" : "text-success"}`}
                  >
                    {g.active ? t("common.deactivate") : t("common.activate")}
                  </button>
                </div>
              </div>
            );
          })}
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
                value={code}
                maxLength={50}
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

      {cashierFor && (
        <UserFormModal
          editing="new"
          gates={gates ?? []}
          presetGateId={cashierFor.id}
          onClose={() => setCashierFor(null)}
          onSaved={() => {
            setCashierFor(null);
            load();
          }}
        />
      )}

      {enrollment && (
        <Modal title={t("settings.gates.enrollCodeTitle", { gate: enrollment.gate.name })} onClose={() => setEnrollment(null)}>
          <div className="space-y-4 text-center">
            <p className="select-all font-mono text-4xl font-extrabold tracking-widest text-royal">{enrollment.code.code}</p>
            <p className="mx-auto max-w-[46ch] text-sm text-muted-foreground">
              {t("settings.gates.enrollCodeHint", { time: formatDateTime(enrollment.code.expiresAt) })}
            </p>
            <button onClick={() => setEnrollment(null)} className="btn-gold w-full">
              {t("common.close")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
