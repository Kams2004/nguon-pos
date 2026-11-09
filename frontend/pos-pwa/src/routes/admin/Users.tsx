import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useLiveEvents, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api } from "../../lib/api/client";
import type { AdminGate, AdminUser, AuditEntry } from "../../lib/api/types";
import { ROLE_LABELS } from "../../lib/format";
import { Pagination, usePaged } from "../../components/Pagination";
import { Avatar, PageHeader, Pill, RefreshButton, SearchInput, SkeletonRows } from "../../components/ui";
import { GuideButton } from "../../components/SetupGuide";
import { UserFormModal } from "../../components/UserFormModal";
import { useI18n } from "../../i18n";

export default function Users() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [query, setQuery] = useState("");
  // null = closed; "new" = create; a user = edit that user
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [u, g] = await Promise.all([api.listUsers(session.token), api.listGates(session.token)]);
    setUsers(u);
    setGates(g);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  // Another admin changed an account: refresh this list too.
  useLiveEvents(["AUDIT"], (e) => {
    if ((e.data as AuditEntry).category === "USER") load();
  });

  const q = query.trim().toLowerCase();
  const visible = (users ?? []).filter((u) => !q || u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
  const paged = usePaged(visible, 25, q);

  if (!session) return null;

  const gateName = (id: string | null) => (id ? (gates.find((g) => g.id === id)?.name ?? "?") : "—");
  const openCreate = () => setEditing("new");
  const openEdit = (u: AdminUser) => setEditing(u);

  const toggleActive = async (u: AdminUser) => {
    const ok = await confirm({
      title: u.active
        ? t("settings.users.deactivateTitle", { name: u.fullName })
        : t("settings.users.reactivateTitle", { name: u.fullName }),
      message: u.active ? t("settings.users.deactivateMessage") : t("settings.users.reactivateMessage"),
      confirmLabel: u.active ? t("common.deactivate") : t("common.reactivate"),
      tone: u.active ? "danger" : "default",
    });
    if (!ok) return;
    await api.updateUser(session.token, u.id, { fullName: u.fullName, role: u.role, assignedGateId: u.assignedGateId, active: !u.active });
    await load();
  };

  return (
    <>
      <PageHeader
        title={t("settings.users.title")}
        subtitle={t("settings.users.subtitle")}
        actions={
          <>
            <GuideButton here="users" />
            <RefreshButton onRefresh={load} />
            <button onClick={openCreate} className="btn-blue">
              <Plus className="h-4 w-4" /> {t("settings.users.newUser")}
            </button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="border-b border-border p-4">
          <SearchInput value={query} onChange={setQuery} placeholder={t("settings.users.search")} />
        </div>
        {users === null ? (
          <SkeletonRows rows={6} cols={4} avatar />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="th">{t("settings.name")}</th>
                  <th className="th">{t("settings.users.col.role")}</th>
                  <th className="th">{t("settings.users.col.username")}</th>
                  <th className="th">{t("settings.gate")}</th>
                  <th className="th">{t("settings.status")}</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {paged.pageItems.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.fullName} size="sm" />
                        <span className="font-semibold text-foreground">{u.fullName}</span>
                        {u.id === session.userId && <Pill tone="info">{t("common.you")}</Pill>}
                      </div>
                    </td>
                    <td className="td">{ROLE_LABELS[u.role]}</td>
                    <td className="td font-mono text-xs text-muted-foreground">{u.username}</td>
                    <td className="td">{gateName(u.assignedGateId)}</td>
                    <td className="td">
                      {u.active ? <Pill tone="success">{t("common.active")}</Pill> : <Pill tone="danger">{t("common.inactive")}</Pill>}
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(u)} className="btn-outline px-3 py-1.5 text-xs">
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        {u.id !== session.userId && (
                          <button
                            onClick={() => toggleActive(u)}
                            className={`btn-outline px-3 py-1.5 text-xs ${u.active ? "text-destructive" : "text-success"}`}
                          >
                            {u.active ? t("common.deactivate") : t("common.reactivate")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={paged.page}
          pages={paged.pages}
          total={paged.total}
          size={paged.size}
          onPage={paged.setPage}
          onSize={paged.setSize}
          unit={t("settings.users.unit")}
        />
      </div>

      {editing && (
        <UserFormModal
          editing={editing}
          gates={gates}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}
