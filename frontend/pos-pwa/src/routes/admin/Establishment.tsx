import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Palette } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminEstablishment, ReceiptMode } from "../../lib/api/types";
import { CardHeader, PageHeader, PageSkeleton } from "../../components/ui";
import { ImageField } from "../../components/MediaLibrary";
import { useI18n } from "../../i18n";

// Labels: settings.establishment.mode.<value>.label / .hint
const RECEIPT_MODES: ReceiptMode[] = ["STANDARD", "INDIVIDUAL_TICKETS", "CONFIGURABLE_PER_TICKET_TYPE"];

export default function Establishment() {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [data, setData] = useState<AdminEstablishment | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api.getEstablishment(session.token).then(setData);
  }, [session]);

  if (!session) return null;
  if (!data) return <PageSkeleton stats={0} rows={6} />;

  const set = (patch: Partial<AdminEstablishment>) => {
    setSaved(false);
    setData({ ...data, ...patch });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      title: t("settings.establishment.confirmTitle"),
      message: t("settings.establishment.confirmMessage"),
      confirmLabel: t("common.save"),
    });
    if (!ok) return;
    setError(null);
    try {
      // The ticket/receipt fields are edited in "Billet & reçu" — sent back unchanged.
      const { id: _id, ...payload } = data;
      setData(await api.updateEstablishment(session.token, payload));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, t("settings.establishment.saveError")));
    }
  };

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.establishment.subtitle")} />

      <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card">
            <CardHeader title={t("settings.establishment.venueImages")} />
            <div className="space-y-4 px-5 pb-5">
              <div>
                <label className="field-label">{t("settings.name")}</label>
                <input required value={data.name} onChange={(e) => set({ name: e.target.value })} className="field" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageField
                  label={t("settings.establishment.logo")}
                  value={data.logoUrl}
                  onChange={(logoUrl) => set({ logoUrl })}
                  fallback="/logo.png"
                  hint={t("settings.establishment.logoHint")}
                />
                <ImageField
                  label={t("settings.establishment.loginBackground")}
                  value={data.loginBackgroundUrl}
                  onChange={(loginBackgroundUrl) => set({ loginBackgroundUrl })}
                  fallback="/img/banners/hero.jpg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["brandPrimaryColor", "brandSecondaryColor"] as const).map((key) => (
                  <div key={key}>
                    <label className="field-label">
                      {key === "brandPrimaryColor" ? t("settings.establishment.primaryColor") : t("settings.establishment.secondaryColor")}
                    </label>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-10 w-10 flex-shrink-0 rounded-xl border border-border"
                        style={{ background: data[key] ?? "transparent" }}
                      />
                      <input
                        value={data[key] ?? ""}
                        onChange={(e) => set({ [key]: e.target.value || null })}
                        placeholder="#0A4DA2"
                        className="field font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <CardHeader title={t("settings.establishment.defaultMode")} />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
              {RECEIPT_MODES.map((m) => {
                const active = data.receiptMode === m;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => set({ receiptMode: m })}
                    className={`relative rounded-xl border-2 p-4 text-left transition-colors ${
                      active ? "border-secondary bg-blue-50/60" : "border-border hover:border-secondary/40"
                    }`}
                  >
                    {active && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <p className="text-sm font-bold text-foreground">{t(`settings.establishment.mode.${m}.label`)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t(`settings.establishment.mode.${m}.hint`)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Link to="/admin/design" className="card group block p-5 transition-shadow hover:shadow-lg">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Palette className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-foreground">{t("settings.establishment.customise")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("settings.establishment.customiseHint")}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary group-hover:underline">
              {t("settings.establishment.open")} <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
          <button type="submit" className="btn-gold w-full">
            {t("settings.establishment.saveSettings")}
          </button>
          {saved && (
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> {t("common.saved")}
            </p>
          )}
        </div>
      </form>
    </>
  );
}
