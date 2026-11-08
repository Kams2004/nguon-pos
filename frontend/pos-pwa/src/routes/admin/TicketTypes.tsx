import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useLiveRefresh, useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminGate, AdminTicketType, PrintMode } from "../../lib/api/types";
import { formatMoney } from "../../lib/format";
import { TICKET_COLORS, TICKET_ICONS, TicketTypeBadge, ticketColor, ticketIcon } from "../../lib/ticketIcons";
import { Pagination, usePaged } from "../../components/Pagination";
import { Loading, Modal, PageHeader, Pill, RefreshButton, SearchInput } from "../../components/ui";
import { useI18n } from "../../i18n";

// Labels: settings.ticketTypes.printMode.<mode>.label / .short
const PRINT_MODES: PrintMode[] = ["INDIVIDUAL", "STANDARD", "INHERIT_ESTABLISHMENT"];

type FormState = { name: string; price: string; gateId: string; printMode: PrintMode; icon: string; color: string };
const EMPTY_FORM: FormState = { name: "", price: "", gateId: "", printMode: "INDIVIDUAL", icon: "ticket", color: "blue" };

export default function TicketTypes() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [types, setTypes] = useState<AdminTicketType[] | null>(null);
  const [gates, setGates] = useState<AdminGate[]>([]);
  const [tab, setTab] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminTicketType | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [t, g] = await Promise.all([api.listTicketTypesAdmin(session.token), api.listGates(session.token)]);
    setTypes(t);
    setGates(g);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["CATALOG_CHANGED"], load);

  const q = query.trim().toLowerCase();
  const visible = (types ?? []).filter(
    (t) =>
      // A ticket type with no gate is sold at every gate, so it shows under every gate's tab.
      (tab === "all" || t.gateId === tab || t.gateId === null) && (!q || t.name.toLowerCase().includes(q)),
  );
  const paged = usePaged(visible, 25, `${q}|${tab}`);

  if (!session) return null;

  const gateName = (id: string | null) => (id ? (gates.find((g) => g.id === id)?.name ?? "?") : t("settings.allGates"));

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  };
  const openEdit = (t: AdminTicketType) => {
    setForm({
      name: t.name,
      price: String(t.price),
      gateId: t.gateId ?? "",
      printMode: t.printMode,
      icon: t.icon ?? "ticket",
      color: t.color ?? "blue",
    });
    setError(null);
    setEditing(t);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const isNew = editing === "new";
    const priceChanged = !isNew && Number(form.price) !== editing.price;
    // The bold price sits where its placeholder is in the translated sentence.
    const [beforePrice, afterPrice] = t("settings.ticketTypes.summary", {
      name: form.name,
      gate: gateName(form.gateId || null).toLowerCase(),
    }).split("{price}");
    const ok = await confirm({
      title: isNew ? t("settings.ticketTypes.confirmCreateTitle") : t("settings.confirmSaveChanges"),
      message: (
        <>
          {beforePrice}
          <b>{formatMoney(Number(form.price) || 0)}</b>
          {afterPrice}
          {priceChanged && ` ${t("settings.ticketTypes.priceChangeNote")}`} {t("settings.ticketTypes.tillsAutoUpdate")}
        </>
      ),
      confirmLabel: isNew ? t("settings.create") : t("common.save"),
    });
    if (!ok) return;
    const data = {
      gateId: form.gateId || null,
      name: form.name,
      price: Number(form.price),
      currency: "XAF",
      printMode: form.printMode,
      icon: form.icon,
      color: form.color,
    };
    try {
      if (isNew) await api.createTicketType(session.token, data);
      else await api.updateTicketType(session.token, editing.id, data);
      setEditing(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, t("settings.ticketTypes.saveError")));
    }
  };

  const toggleActive = async (type: AdminTicketType) => {
    const ok = await confirm({
      title: type.active ? t("settings.deactivateNamed", { name: type.name }) : t("settings.activateNamed", { name: type.name }),
      message: type.active ? t("settings.ticketTypes.deactivateMessage") : t("settings.ticketTypes.activateMessage"),
      confirmLabel: type.active ? t("common.deactivate") : t("common.activate"),
      tone: type.active ? "danger" : "default",
    });
    if (!ok) return;
    await api.setTicketTypeActive(session.token, type.id, !type.active);
    await load();
  };

  return (
    <>
      <PageHeader
        title={t("settings.ticketTypes.title")}
        subtitle={t("settings.ticketTypes.subtitle")}
        actions={
          <>
            <RefreshButton onRefresh={load} />
            <button onClick={openCreate} className="btn-blue">
              <Plus className="h-4 w-4" /> {t("settings.ticketTypes.add")}
            </button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <SearchInput value={query} onChange={setQuery} placeholder={t("settings.ticketTypes.search")} />
          <div className="flex flex-wrap gap-1.5">
            {[{ id: "all", name: t("common.all") }, ...gates].map((g) => (
              <button
                key={g.id}
                onClick={() => setTab(g.id)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  tab === g.id ? "bg-secondary text-white shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
        {types === null ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className="th">{t("settings.ticketTypes.col.icon")}</th>
                  <th className="th">{t("settings.name")}</th>
                  <th className="th">{t("settings.gate")}</th>
                  <th className="th text-right">{t("settings.price")}</th>
                  <th className="th">{t("settings.ticketTypes.col.print")}</th>
                  <th className="th">{t("settings.status")}</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="td text-center text-muted-foreground">
                      {t("settings.ticketTypes.empty")}
                    </td>
                  </tr>
                )}
                {paged.pageItems.map((type) => (
                  <tr key={type.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="td">
                      <TicketTypeBadge icon={type.icon} color={type.color} size="sm" />
                    </td>
                    <td className="td font-semibold text-foreground">{type.name}</td>
                    <td className="td text-muted-foreground">{gateName(type.gateId)}</td>
                    <td className="td text-right font-semibold">{formatMoney(type.price, type.currency)}</td>
                    <td className="td">
                      <Pill tone="info">
                        {PRINT_MODES.includes(type.printMode)
                          ? t(`settings.ticketTypes.printMode.${type.printMode}.short`)
                          : type.printMode}
                      </Pill>
                    </td>
                    <td className="td">
                      {type.active ? (
                        <Pill tone="success">{t("common.active")}</Pill>
                      ) : (
                        <Pill tone="neutral">{t("settings.ticketTypes.deactivated")}</Pill>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(type)} className="btn-outline px-3 py-1.5 text-xs">
                          <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                        </button>
                        <button
                          onClick={() => toggleActive(type)}
                          className={`btn-outline px-3 py-1.5 text-xs ${type.active ? "text-destructive" : "text-success"}`}
                        >
                          {type.active ? t("common.deactivate") : t("common.activate")}
                        </button>
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
          unit={t("settings.ticketTypes.unit")}
        />
      </div>

      {editing && (
        <Modal
          title={editing === "new" ? t("settings.ticketTypes.newTitle") : t("settings.editNamed", { name: editing.name })}
          onClose={() => setEditing(null)}
          size="lg"
        >
          <form onSubmit={submit} className="space-y-3">
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
            <div>
              <label className="field-label">{t("settings.name")}</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="field"
                placeholder={t("settings.sample.generalAdmission")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">{t("settings.ticketTypes.priceFcfa")}</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{t("settings.gate")}</label>
                <select value={form.gateId} onChange={(e) => setForm({ ...form, gateId: e.target.value })} className="field">
                  <option value="">{t("settings.allGates")}</option>
                  {gates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">{t("settings.ticketTypes.printModeLabel")}</label>
              <select
                value={form.printMode}
                onChange={(e) => setForm({ ...form, printMode: e.target.value as PrintMode })}
                className="field"
              >
                {PRINT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`settings.ticketTypes.printMode.${m}.label`)}
                  </option>
                ))}
              </select>
            </div>
            <IconAndColorPicker
              icon={form.icon}
              color={form.color}
              name={form.name || t("settings.ticketTypes.newTicket")}
              price={Number(form.price) || 0}
              onChange={(patch) => setForm({ ...form, ...patch })}
            />
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)} className="btn-outline flex-1">
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn-gold flex-1">
                {editing === "new" ? t("settings.ticketTypes.createTicket") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** Icon grid + colour swatches, with a live preview of the till tile. */
function IconAndColorPicker({
  icon,
  color,
  name,
  price,
  onChange,
}: {
  icon: string;
  color: string;
  name: string;
  price: number;
  onChange: (patch: { icon?: string; color?: string }) => void;
}) {
  const { t } = useI18n();
  const Preview = ticketIcon(icon);
  const c = ticketColor(color);
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
      <div className="space-y-3">
        <div>
          <label className="field-label">{t("settings.ticketTypes.iconLabel")}</label>
          <div className="grid max-h-48 grid-cols-6 gap-1.5 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-8">
            {Object.entries(TICKET_ICONS).map(([key, { icon: Icon, label }]) => (
              <button
                type="button"
                key={key}
                onClick={() => onChange({ icon: key })}
                title={label}
                aria-label={label}
                aria-pressed={icon === key}
                className={`flex aspect-square items-center justify-center rounded-lg transition-colors ${
                  icon === key ? c.solid : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{TICKET_ICONS[icon]?.label}</p>
        </div>
        <div>
          <label className="field-label">{t("settings.ticketTypes.color")}</label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TICKET_COLORS).map(([key, col]) => (
              <button
                type="button"
                key={key}
                onClick={() => onChange({ color: key })}
                title={col.label}
                aria-label={col.label}
                aria-pressed={color === key}
                className={`h-8 w-8 rounded-full ${col.swatch} ring-offset-2 transition-shadow ${color === key ? `ring-2 ${col.ring}` : ""}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="field-label">{t("settings.preview")}</label>
        <div className={`flex aspect-square flex-col justify-between rounded-2xl p-3 ${c.soft}`}>
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.solid}`}>
            <Preview className="h-6 w-6" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{name}</p>
            <p className="text-xs font-semibold">{formatMoney(price)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
