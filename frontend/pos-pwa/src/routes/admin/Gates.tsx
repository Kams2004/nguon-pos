import { useCallback, useEffect, useState } from "react";
import { DoorOpen, MonitorSmartphone, Pencil, Plus, Ticket } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminGate, AdminTicketType, TerminalStatus } from "../../lib/api/types";
import { Loading, Modal, PageHeader, Pill, RefreshButton } from "../../components/ui";

export default function Gates() {
  const { session } = useSession();
  const confirm = useConfirm();
  const [gates, setGates] = useState<AdminGate[] | null>(null);
  const [terminals, setTerminals] = useState<TerminalStatus[]>([]);
  const [ticketTypes, setTicketTypes] = useState<AdminTicketType[]>([]);
  const [editing, setEditing] = useState<AdminGate | "new" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [g, t, tt] = await Promise.all([
      api.listGates(session.token),
      api.syncStatus(session.token).catch(() => [] as TerminalStatus[]),
      api.listTicketTypesAdmin(session.token).catch(() => [] as AdminTicketType[]),
    ]);
    setGates(g);
    setTerminals(t);
    setTicketTypes(tt);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["CATALOG_CHANGED", "TERMINAL_STATUS"], load);

  if (!session) return null;

  const openCreate = () => {
    setName("");
    setCode("");
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
      title: isNew ? "Créer cette porte ?" : "Renommer cette porte ?",
      message: isNew ? (
        <>
          La porte « {name} » ({code}) recevra sa propre clé de signature des QR codes. Le code ne pourra plus être modifié.
        </>
      ) : (
        <>
          « {editing.name} » deviendra « {name} ». Le nouveau nom apparaîtra sur les prochains billets imprimés.
        </>
      ),
      confirmLabel: isNew ? "Créer" : "Enregistrer",
    });
    if (!ok) return;
    try {
      if (isNew) await api.createGate(session.token, name, code);
      else await api.updateGate(session.token, editing.id, name, editing.active);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, isNew ? "Impossible de créer la porte (code déjà utilisé ?)." : "Impossible d'enregistrer."));
    }
  };

  const toggleActive = async (gate: AdminGate) => {
    const ok = await confirm({
      title: gate.active ? `Désactiver « ${gate.name} » ?` : `Activer « ${gate.name} » ?`,
      message: gate.active
        ? "Cette porte n'apparaîtra plus comme active. Les billets déjà vendus pour elle restent valables."
        : "Cette porte sera de nouveau active.",
      confirmLabel: gate.active ? "Désactiver" : "Activer",
      tone: gate.active ? "danger" : "default",
    });
    if (!ok) return;
    await api.updateGate(session.token, gate.id, gate.name, !gate.active);
    await load();
  };

  return (
    <>
      <PageHeader
        title="Portes & caisses"
        subtitle="Chaque porte a sa propre clé de signature des QR codes"
        actions={
          <>
            <RefreshButton onRefresh={load} />
            <button onClick={openCreate} className="btn-blue">
              <Plus className="h-4 w-4" /> Nouvelle porte
            </button>
          </>
        }
      />

      {gates === null ? (
        <Loading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gates.map((g) => {
            const tills = terminals.filter((t) => t.gateId === g.id);
            const online = tills.filter((t) => t.online).length;
            // Sold at this gate: its own ticket types plus the ones sold at every gate.
            const types = ticketTypes.filter((t) => t.active && (t.gateId === g.id || t.gateId === null)).length;
            return (
              <div key={g.id} className={`card p-5 ${g.active ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${
                      g.active ? "bg-gradient-to-br from-royal to-secondary text-white shadow-md shadow-secondary/30" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <DoorOpen className="h-7 w-7" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-display text-lg font-bold text-foreground">{g.name}</p>
                      {g.active ? <Pill tone="success">Active</Pill> : <Pill tone="warning">Désactivée</Pill>}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{g.code}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-muted/60 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <MonitorSmartphone className="h-3.5 w-3.5" /> Caisses en ligne
                    </p>
                    <p className="font-display text-base font-bold text-foreground">
                      {online} / {tills.length}
                    </p>
                  </div>
                  <div className="rounded-xl bg-muted/60 px-3 py-2">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Ticket className="h-3.5 w-3.5" /> Billets vendus ici
                    </p>
                    <p className="font-display text-base font-bold text-foreground">{types} type{types > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => openEdit(g)} className="btn-outline flex-1 py-2 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </button>
                  <button
                    onClick={() => toggleActive(g)}
                    className={`btn-outline flex-1 py-2 text-xs ${g.active ? "text-destructive" : "text-success"}`}
                  >
                    {g.active ? "Désactiver" : "Activer"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing === "new" ? "Nouvelle porte" : `Modifier « ${editing.name} »`} onClose={() => setEditing(null)}>
          <form onSubmit={submit} className="space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
            <div>
              <label className="field-label">Nom</label>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="Porte C" />
            </div>
            <div>
              <label className="field-label">Code</label>
              <input
                required
                disabled={editing !== "new"}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="field font-mono disabled:bg-muted disabled:text-muted-foreground"
                placeholder="GATE-C"
              />
              {editing !== "new" && (
                <p className="mt-1 text-[11px] text-muted-foreground">Le code est imprimé dans chaque QR code : il ne peut pas changer.</p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-outline flex-1">
                Annuler
              </button>
              <button type="submit" className="btn-gold flex-1">
                {editing === "new" ? "Créer la porte" : "Enregistrer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
