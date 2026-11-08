import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useLiveEvents, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminGate, AdminUser, AuditEntry, Role } from "../../lib/api/types";
import { ROLE_LABELS } from "../../lib/format";
import { Pagination, usePaged } from "../../components/Pagination";
import { Avatar, Loading, Modal, PageHeader, Pill, RefreshButton, SearchInput } from "../../components/ui";
import { useI18n } from "../../i18n";

const ROLES: Role[] = ["CASHIER", "COORDINATOR", "SUPER_ADMIN"];

type FormState = {
  fullName: string;
  username: string;
  password: string;
  role: Role;
  gateId: string;
  active: boolean;
};

const EMPTY_FORM: FormState = { fullName: "", username: "", password: "", role: "CASHIER", gateId: "", active: true };

export default function Users() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [query, setQuery] = useState("");
  // null = closed; "new" = create; a user = edit that user
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  };
  const openEdit = (u: AdminUser) => {
    setForm({ fullName: u.fullName, username: u.username, password: "", role: u.role, gateId: u.assignedGateId ?? "", active: u.active });
    setError(null);
    setEditing(u);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const isNew = editing === "new";
    // The bold name sits where its placeholder is in the translated sentence.
    const [beforeName, afterName] = (
      isNew
        ? t("settings.users.confirmCreateMessage", { role: ROLE_LABELS[form.role] })
        : t(form.password ? "settings.users.confirmEditPasswordMessage" : "settings.users.confirmEditMessage")
    ).split(isNew ? "{username}" : "{name}");
    const ok = await confirm({
      title: isNew ? t("settings.users.confirmCreateTitle") : t("settings.confirmSaveChanges"),
      message: (
        <>
          {beforeName}
          <b>{isNew ? form.username : form.fullName}</b>
          {afterName}
        </>
      ),
      confirmLabel: isNew ? t("settings.create") : t("common.save"),
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    const assignedGateId = form.role === "SUPER_ADMIN" ? null : form.gateId || null;
    try {
      if (isNew) {
        await api.createUser(session.token, {
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          assignedGateId,
        });
      } else {
        await api.updateUser(session.token, editing.id, {
          fullName: form.fullName,
          role: form.role,
          assignedGateId,
          active: form.active,
          password: form.password || undefined,
        });
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, isNew ? t("settings.users.createError") : t("settings.saveError")));
    } finally {
      setSaving(false);
    }
  };

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

  const isSelf = editing !== null && editing !== "new" && editing.id === session.userId;

  return (
    <>
      <PageHeader
        title={t("settings.users.title")}
        subtitle={t("settings.users.subtitle")}
        actions={
          <>
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
          <Loading />
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
        <Modal
          title={editing === "new" ? t("settings.users.newUser") : t("settings.users.editTitle", { name: editing.fullName })}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit} className="space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
            <div>
              <label className="field-label">{t("settings.users.fullName")}</label>
              <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t("settings.users.col.username")}</label>
                <input
                  required
                  disabled={editing !== "new"}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="field disabled:bg-muted disabled:text-muted-foreground"
                  title={editing !== "new" ? t("settings.users.usernameLocked") : undefined}
                />
              </div>
              <div>
                <label className="field-label">{editing === "new" ? t("settings.users.password") : t("settings.users.newPassword")}</label>
                <input
                  required={editing === "new"}
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing === "new" ? "" : t("settings.users.passwordPlaceholder")}
                  className="field"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t("settings.users.col.role")}</label>
                <select
                  value={form.role}
                  disabled={isSelf}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className="field disabled:bg-muted"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              {form.role !== "SUPER_ADMIN" && (
                <div>
                  <label className="field-label">{t("settings.users.assignedGate")}</label>
                  <select value={form.gateId} onChange={(e) => setForm({ ...form, gateId: e.target.value })} className="field">
                    <option value="">—</option>
                    {gates.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {editing !== "new" && !isSelf && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 accent-[hsl(var(--secondary))]"
                />
                {t("settings.users.activeAccount")}
              </label>
            )}
            {isSelf && <p className="text-[11px] text-muted-foreground">{t("settings.users.selfNote")}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-outline flex-1">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={saving} className="btn-gold flex-1">
                {editing === "new" ? t("settings.users.createUser") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
