import { useState } from "react";
import { useSession } from "../context/SessionContext";
import { useConfirm } from "../context/ConfirmContext";
import { api, errorMessage } from "../lib/api/client";
import type { AdminGate, AdminUser, Role } from "../lib/api/types";
import { ROLE_LABELS } from "../lib/format";
import { useI18n } from "../i18n";
import { Modal, PasswordInput } from "./ui";

const ROLES: Role[] = ["CASHIER", "COORDINATOR", "SUPER_ADMIN"];

type FormState = { fullName: string; username: string; password: string; role: Role; gateId: string; active: boolean };

/**
 * Create or edit an account. Used by Utilisateurs, and by Portes & caisses
 * ("Ajouter un caissier"), where the gate comes already chosen.
 */
export function UserFormModal({
  editing,
  gates,
  presetGateId,
  onClose,
  onSaved,
}: {
  editing: AdminUser | "new";
  gates: AdminGate[];
  presetGateId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const activeGates = gates.filter((g) => g.active || (editing !== "new" && g.id === editing.assignedGateId));
  const [form, setForm] = useState<FormState>(() =>
    editing === "new"
      ? {
          fullName: "",
          username: "",
          password: "",
          role: "CASHIER",
          // One gate, or opened from a gate: nothing to choose.
          gateId: presetGateId ?? (activeGates.length === 1 ? activeGates[0].id : ""),
          active: true,
        }
      : {
          fullName: editing.fullName,
          username: editing.username,
          password: "",
          role: editing.role,
          gateId: editing.assignedGateId ?? "",
          active: editing.active,
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!session) return null;
  const isNew = editing === "new";
  const isSelf = !isNew && editing.id === session.userId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          username: form.username.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: form.role,
          assignedGateId,
        });
      } else {
        await api.updateUser(session.token, editing.id, {
          fullName: form.fullName.trim(),
          role: form.role,
          assignedGateId,
          active: form.active,
          password: form.password || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err, isNew ? t("settings.users.createError") : t("settings.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isNew ? t("settings.users.newUser") : t("settings.users.editTitle", { name: editing.fullName })} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
        <div>
          <label className="field-label">{t("settings.users.fullName")}</label>
          <input
            required
            autoFocus
            maxLength={200}
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="field"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("settings.users.col.username")}</label>
            <input
              required
              disabled={!isNew}
              maxLength={100}
              autoCapitalize="none"
              spellCheck={false}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className="field disabled:bg-muted disabled:text-muted-foreground"
              title={!isNew ? t("settings.users.usernameLocked") : undefined}
            />
          </div>
          <div>
            <label className="field-label">{isNew ? t("settings.users.password") : t("settings.users.newPassword")}</label>
            <PasswordInput
              required={isNew}
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
              placeholder={isNew ? "" : t("settings.users.passwordPlaceholder")}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
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
              {/* A cashier sells at one gate: without it they couldn't use any till. */}
              <select
                required={form.role === "CASHIER"}
                value={form.gateId}
                onChange={(e) => setForm({ ...form, gateId: e.target.value })}
                className="field"
              >
                <option value="">{form.role === "CASHIER" ? t("settings.users.chooseGate") : t("settings.users.noGate")}</option>
                {activeGates.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!isNew && !isSelf && (
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
          <button type="button" onClick={onClose} className="btn-outline flex-1">
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving} className="btn-gold flex-1">
            {isNew ? t("settings.users.createUser") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
