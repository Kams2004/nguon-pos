import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CalendarPlus, Check, Info, Wallet } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type {
  SubscriptionOverview,
  SubscriptionPaymentMethod,
  SubscriptionPeriod,
  SubscriptionSettings,
  SubscriptionState,
} from "../../lib/api/types";
import { formatDateTime, formatMoney } from "../../lib/format";
import { Pagination, usePaged } from "../../components/Pagination";
import { CardHeader, Loading, Modal, PageHeader, Pill, RefreshButton } from "../../components/ui";
import { translate, useI18n, type MessageKey } from "../../i18n";

type Tone = "success" | "warning" | "danger" | "neutral" | "info";

/** `label` is read at use time, so it follows the current language. */
function stateLabel(state: SubscriptionState, tone: Tone): { label: string; tone: Tone } {
  return {
    get label() {
      return translate(`settings.subscription.state.${state}`);
    },
    tone,
  };
}

export const STATE_LABELS: Record<SubscriptionState, { label: string; tone: Tone }> = {
  NOT_ACTIVATED: stateLabel("NOT_ACTIVATED", "neutral"),
  ACTIVE: stateLabel("ACTIVE", "success"),
  TO_RENEW: stateLabel("TO_RENEW", "warning"),
  EXPIRED: stateLabel("EXPIRED", "danger"),
  PENDING_PAYMENT: stateLabel("PENDING_PAYMENT", "warning"),
};

const PERIOD_STATUS: Record<SubscriptionPeriod["status"], { tone: "success" | "warning" | "neutral" }> = {
  PAID: { tone: "success" },
  PENDING_PAYMENT: { tone: "warning" },
  CANCELLED: { tone: "neutral" },
};

// Payment method choices (long labels) and how a recorded method is shown (short labels).
const METHODS: { value: SubscriptionPaymentMethod; label: MessageKey }[] = [
  { value: "CASH", label: "payment.CASH" },
  { value: "BANK_TRANSFER", label: "settings.subscription.method.BANK_TRANSFER_long" },
  { value: "MOBILE_MONEY", label: "payment.MOBILE_MONEY" },
  { value: "CARD", label: "settings.subscription.method.CARD" },
  { value: "OTHER", label: "payment.OTHER" },
];
const METHOD_LABELS: Record<SubscriptionPaymentMethod, MessageKey> = {
  CASH: "payment.CASH",
  BANK_TRANSFER: "settings.subscription.method.BANK_TRANSFER",
  MOBILE_MONEY: "payment.MOBILE_MONEY",
  CARD: "settings.subscription.method.CARD",
  ONLINE: "settings.subscription.method.ONLINE",
  OTHER: "payment.OTHER",
};

/** "2026-10-28" → "28/10/2026", without any timezone shift. */
function formatDay(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function nextDay(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, day + 1));
  return n.toISOString().slice(0, 10);
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Annual subscription (cahier §9). Present but switchable off; even when on,
 * it only informs — sales, printing and sync never depend on it.
 */
export default function Subscription() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [data, setData] = useState<SubscriptionOverview | null>(null);
  const [form, setForm] = useState<SubscriptionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newPeriod, setNewPeriod] = useState<{ startDate: string; note: string } | null>(null);
  const [payFor, setPayFor] = useState<SubscriptionPeriod | null>(null);
  const [payment, setPayment] = useState({
    amount: "",
    method: "CASH" as SubscriptionPaymentMethod,
    reference: "",
    paidAt: todayKey(),
    note: "",
  });
  const periodsPaged = usePaged(data?.periods ?? [], 10);
  const paymentsPaged = usePaged(data?.payments ?? [], 10);

  const apply = (o: SubscriptionOverview) => {
    setData(o);
    setForm(o.settings);
  };

  const load = useCallback(async () => {
    if (!session) return;
    try {
      apply(await api.getSubscription(session.token));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;
  if (!data || !form)
    return error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p> : <Loading />;

  const { status, settings } = data;
  const state = STATE_LABELS[status.state];
  const set = (patch: Partial<SubscriptionSettings>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };
  const run = async (fn: () => Promise<SubscriptionOverview>) => {
    setError(null);
    try {
      apply(await fn());
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceChanged = Number(form.annualPrice) !== Number(settings.annualPrice);
    const ok = await confirm({
      title: t("settings.subscription.confirmSaveTitle"),
      message: (
        <>
          {form.moduleEnabled !== settings.moduleEnabled && (
            <p className="mb-2 font-semibold">
              {form.moduleEnabled ? t("settings.subscription.moduleWillEnable") : t("settings.subscription.moduleWillDisable")}
            </p>
          )}
          {priceChanged && (
            <p>{t("settings.subscription.priceChangeNote", { price: formatMoney(Number(form.annualPrice), form.currency) })}</p>
          )}
          {!priceChanged && form.moduleEnabled === settings.moduleEnabled && <p>{t("settings.subscription.rulesUpdated")}</p>}
        </>
      ),
      confirmLabel: t("common.save"),
    });
    if (!ok) return;
    if (await run(() => api.updateSubscriptionSettings(session.token, { ...form, annualPrice: Number(form.annualPrice) }))) setSaved(true);
  };

  const openNewPeriod = () => {
    const latest = data.periods.filter((p) => p.status !== "CANCELLED").sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    setNewPeriod({ startDate: latest && latest.endDate >= todayKey() ? nextDay(latest.endDate) : todayKey(), note: "" });
  };

  const createPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriod) return;
    const ok = await confirm({
      title: t("settings.subscription.confirmCreateTitle"),
      message: t("settings.subscription.confirmCreateMessage", {
        months: settings.durationMonths,
        date: formatDay(newPeriod.startDate),
        price: formatMoney(settings.annualPrice, settings.currency),
      }),
      confirmLabel: t("settings.subscription.createPeriod"),
    });
    if (!ok) return;
    if (
      await run(() => api.createSubscriptionPeriod(session.token, { startDate: newPeriod.startDate, note: newPeriod.note || undefined }))
    ) {
      setNewPeriod(null);
    }
  };

  const cancelPeriod = async (p: SubscriptionPeriod) => {
    const ok = await confirm({
      title: t("settings.subscription.confirmCancelTitle"),
      message: t("settings.subscription.confirmCancelMessage", { from: formatDay(p.startDate), to: formatDay(p.endDate) }),
      confirmLabel: t("settings.subscription.cancelPeriod"),
      tone: "danger",
    });
    if (ok) await run(() => api.cancelSubscriptionPeriod(session.token, p.id));
  };

  const openPayment = (p: SubscriptionPeriod) => {
    setPayFor(p);
    setPayment({ amount: String(Math.max(0, p.price - p.paidAmount)), method: "CASH", reference: "", paidAt: todayKey(), note: "" });
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payFor) return;
    const amount = Number(payment.amount);
    const ok = await confirm({
      title: t("settings.subscription.confirmPaymentTitle"),
      message: t("settings.subscription.confirmPaymentMessage", {
        amount: formatMoney(amount, payFor.currency),
        method: t(METHOD_LABELS[payment.method]),
        from: formatDay(payFor.startDate),
        to: formatDay(payFor.endDate),
      }),
      confirmLabel: t("settings.subscription.recordPayment"),
    });
    if (!ok) return;
    const [y, m, d] = payment.paidAt.split("-").map(Number);
    const done = await run(() =>
      api.recordSubscriptionPayment(session.token, payFor.id, {
        amount,
        method: payment.method,
        reference: payment.reference || undefined,
        note: payment.note || undefined,
        paidAt: new Date(y, m - 1, d, 12).toISOString(),
      }),
    );
    if (done) setPayFor(null);
  };

  const periodOf = (id: string) => data.periods.find((p) => p.id === id);
  // The bold balance sits where its placeholder is in the translated sentence.
  const paymentSummary =
    payFor &&
    t("settings.subscription.paymentSummary", { from: formatDay(payFor.startDate), to: formatDay(payFor.endDate) }).split("{amount}");

  return (
    <>
      <PageHeader
        title={t("settings.subscription.title")}
        subtitle={t("settings.subscription.subtitle")}
        actions={<RefreshButton onRefresh={load} />}
      />

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700">
              <BadgeCheck className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold text-foreground">{t("settings.status")}</h2>
                <Pill tone={state.tone} dot>
                  {state.label}
                </Pill>
                {!settings.moduleEnabled && <Pill tone="neutral">{t("settings.subscription.moduleDisabled")}</Pill>}
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {status.coveredUntil && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {status.state === "EXPIRED" ? t("settings.subscription.expiredOn") : t("settings.subscription.coveredUntil")}
                    </dt>
                    <dd className="font-semibold">{formatDay(status.coveredUntil)}</dd>
                  </div>
                )}
                {status.daysRemaining !== null && status.state !== "EXPIRED" && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("settings.subscription.daysRemaining")}</dt>
                    <dd className="font-semibold">{status.daysRemaining}</dd>
                  </div>
                )}
                {status.graceUntil && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("settings.subscription.graceEnd")}</dt>
                    <dd className="font-semibold">{formatDay(status.graceUntil)}</dd>
                  </div>
                )}
                {status.nextStart && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("settings.subscription.nextPeriod")}</dt>
                    <dd className="font-semibold">{t("settings.subscription.startingFrom", { date: formatDay(status.nextStart) })}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">{t("settings.subscription.currentRate")}</dt>
                  <dd className="font-semibold">
                    {t("settings.subscription.pricePerDuration", {
                      price: formatMoney(settings.annualPrice, settings.currency),
                      months: settings.durationMonths,
                    })}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <p className="mt-4 flex gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-secondary">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {t("settings.subscription.infoNote")}
          </p>
        </div>

        <form onSubmit={saveSettings} className="card">
          <CardHeader title={t("settings.title")} />
          <div className="space-y-4 px-5 pb-5">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span>
                <span className="block text-sm font-semibold text-foreground">{t("settings.subscription.module")}</span>
                <span className="block text-xs text-muted-foreground">{t("settings.subscription.moduleHint")}</span>
              </span>
              <input
                type="checkbox"
                checked={form.moduleEnabled}
                onChange={(e) => set({ moduleEnabled: e.target.checked })}
                className="h-5 w-5 accent-secondary"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <div>
                <label className="field-label">{t("settings.subscription.amount")}</label>
                <input
                  type="number"
                  min={0}
                  step="1"
                  required
                  value={form.annualPrice}
                  onChange={(e) => set({ annualPrice: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{t("settings.subscription.currency")}</label>
                <input
                  required
                  maxLength={10}
                  value={form.currency}
                  onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
                  className="field"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="field-label">{t("settings.subscription.duration")}</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  required
                  value={form.durationMonths}
                  onChange={(e) => set({ durationMonths: Number(e.target.value) })}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{t("settings.subscription.reminder")}</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  required
                  value={form.reminderDays}
                  onChange={(e) => set({ reminderDays: Number(e.target.value) })}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{t("settings.subscription.grace")}</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  required
                  value={form.graceDays}
                  onChange={(e) => set({ graceDays: Number(e.target.value) })}
                  className="field"
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.autoRenew}
                onChange={(e) => set({ autoRenew: e.target.checked })}
                className="h-4 w-4 accent-secondary"
              />
              {t("settings.subscription.autoRenew")}
            </label>
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-gold">
                {t("common.save")}
              </button>
              {saved && (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> {t("common.saved")}
                </span>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <CardHeader
          title={t("settings.subscription.periodsTitle", { n: data.periods.length })}
          action={
            <button onClick={openNewPeriod} className="btn-blue px-3 py-1.5 text-xs">
              <CalendarPlus className="h-4 w-4" /> {t("settings.subscription.newPeriod")}
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40">
              <tr>
                <th className="th">{t("settings.subscription.col.period")}</th>
                <th className="th text-right">{t("settings.price")}</th>
                <th className="th text-right">{t("settings.subscription.col.paid")}</th>
                <th className="th">{t("settings.status")}</th>
                <th className="th">{t("settings.subscription.col.created")}</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data.periods.length === 0 && (
                <tr>
                  <td colSpan={6} className="td text-center text-muted-foreground">
                    {t("settings.subscription.noPeriods")}
                  </td>
                </tr>
              )}
              {periodsPaged.pageItems.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border/60 last:border-0 ${p.id === status.currentPeriodId ? "bg-blue-50/40" : ""}`}
                >
                  <td className="td">
                    <p className="font-semibold">
                      {formatDay(p.startDate)} → {formatDay(p.endDate)}
                    </p>
                    {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                  </td>
                  <td className="td text-right">{formatMoney(p.price, p.currency)}</td>
                  <td className="td text-right">{formatMoney(p.paidAmount, p.currency)}</td>
                  <td className="td">
                    <Pill tone={PERIOD_STATUS[p.status].tone}>{t(`settings.subscription.periodStatus.${p.status}`)}</Pill>
                  </td>
                  <td className="td text-xs text-muted-foreground">
                    {formatDateTime(p.createdAt)}
                    {p.createdByName ? ` · ${p.createdByName}` : ""}
                  </td>
                  <td className="td text-right">
                    {p.status === "PENDING_PAYMENT" && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openPayment(p)} className="btn-outline px-2.5 py-1 text-xs">
                          <Wallet className="h-3.5 w-3.5" /> {t("settings.subscription.payment")}
                        </button>
                        {p.paidAmount === 0 && (
                          <button onClick={() => cancelPeriod(p)} className="btn-outline px-2.5 py-1 text-xs text-destructive">
                            {t("common.cancel")}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.periods.length > 0 && (
          <Pagination
            page={periodsPaged.page}
            pages={periodsPaged.pages}
            total={periodsPaged.total}
            size={periodsPaged.size}
            onPage={periodsPaged.setPage}
            onSize={periodsPaged.setSize}
            unit={t("settings.subscription.unitPeriods")}
          />
        )}
      </div>

      <div className="card overflow-hidden">
        <CardHeader title={t("settings.subscription.paymentsTitle", { n: data.payments.length })} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40">
              <tr>
                <th className="th">{t("settings.subscription.col.date")}</th>
                <th className="th">{t("settings.subscription.col.period")}</th>
                <th className="th">{t("settings.subscription.col.method")}</th>
                <th className="th">{t("settings.subscription.col.reference")}</th>
                <th className="th text-right">{t("settings.subscription.col.amount")}</th>
                <th className="th">{t("settings.subscription.col.recordedBy")}</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="td text-center text-muted-foreground">
                    {t("settings.subscription.noPayments")}
                  </td>
                </tr>
              )}
              {paymentsPaged.pageItems.map((x) => {
                const p = periodOf(x.periodId);
                return (
                  <tr key={x.id} className="border-b border-border/60 last:border-0">
                    <td className="td">{formatDateTime(x.paidAt)}</td>
                    <td className="td text-xs">{p ? `${formatDay(p.startDate)} → ${formatDay(p.endDate)}` : "—"}</td>
                    <td className="td">
                      {t(METHOD_LABELS[x.method])}
                      {x.provider ? ` · ${x.provider}` : ""}
                    </td>
                    <td className="td font-mono text-xs">{x.providerReference ?? "—"}</td>
                    <td className="td text-right font-semibold">{formatMoney(x.amount, x.currency)}</td>
                    <td className="td text-xs text-muted-foreground">{x.recordedByName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.payments.length > 0 && (
          <Pagination
            page={paymentsPaged.page}
            pages={paymentsPaged.pages}
            total={paymentsPaged.total}
            size={paymentsPaged.size}
            onPage={paymentsPaged.setPage}
            onSize={paymentsPaged.setSize}
            unit={t("settings.subscription.unitPayments")}
          />
        )}
      </div>

      {newPeriod && (
        <Modal title={t("settings.subscription.newPeriodModal")} onClose={() => setNewPeriod(null)}>
          <form onSubmit={createPeriod} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("settings.subscription.newPeriodSummary", {
                months: settings.durationMonths,
                price: formatMoney(settings.annualPrice, settings.currency),
              })}
            </p>
            <div>
              <label className="field-label">{t("settings.subscription.startDate")}</label>
              <input
                type="date"
                required
                value={newPeriod.startDate}
                onChange={(e) => setNewPeriod({ ...newPeriod, startDate: e.target.value })}
                className="field"
              />
            </div>
            <div>
              <label className="field-label">{t("settings.noteOptional")}</label>
              <input
                maxLength={500}
                value={newPeriod.note}
                onChange={(e) => setNewPeriod({ ...newPeriod, note: e.target.value })}
                className="field"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setNewPeriod(null)} className="btn-outline flex-1">
                {t("common.back")}
              </button>
              <button type="submit" className="btn-blue flex-1">
                {t("settings.subscription.createPeriod")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {payFor && paymentSummary && (
        <Modal title={t("settings.subscription.recordPaymentModal")} onClose={() => setPayFor(null)}>
          <form onSubmit={recordPayment} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {paymentSummary[0]}
              <strong className="text-foreground">{formatMoney(Math.max(0, payFor.price - payFor.paidAmount), payFor.currency)}</strong>
              {paymentSummary[1]}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="field-label">{t("settings.subscription.amountWithCurrency", { currency: payFor.currency })}</label>
                <input
                  type="number"
                  min={1}
                  step="1"
                  required
                  value={payment.amount}
                  onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label">{t("settings.subscription.paidAt")}</label>
                <input
                  type="date"
                  required
                  value={payment.paidAt}
                  onChange={(e) => setPayment({ ...payment, paidAt: e.target.value })}
                  className="field"
                />
              </div>
            </div>
            <div>
              <label className="field-label">{t("settings.subscription.method")}</label>
              <select
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value as SubscriptionPaymentMethod })}
                className="field"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.label)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">{t("settings.subscription.reference")}</label>
              <input
                maxLength={200}
                value={payment.reference}
                onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
                className="field"
              />
            </div>
            <div>
              <label className="field-label">{t("settings.noteOptional")}</label>
              <input
                maxLength={500}
                value={payment.note}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })}
                className="field"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setPayFor(null)} className="btn-outline flex-1">
                {t("common.back")}
              </button>
              <button type="submit" className="btn-gold flex-1">
                {t("settings.subscription.recordPayment")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
