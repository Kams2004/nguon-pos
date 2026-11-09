import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../i18n";
import { usePrinterSettings, type PrinterSettings } from "../lib/till/printerSettings";
import { errorMessage } from "../lib/api/client";
import { desktopApp } from "../lib/platform";
import { Modal } from "./ui";

const AUTO = ["NONE", "RECEIPT", "TICKETS", "ALL"] as const;

/** Per-till printer settings, opened from the till header. */
export function PrinterSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [settings, save] = usePrinterSettings();
  const [form, setForm] = useState<PrinterSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Desktop till: the printers installed on this computer, to pick from.
  const [printers, setPrinters] = useState<string[] | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  useEffect(() => {
    if (desktopApp.available())
      desktopApp
        .printers()
        .then(setPrinters)
        .catch(() => setPrinters([]));
  }, []);

  if (!form) return null;
  const set = (patch: Partial<PrinterSettings>) => {
    setSaved(false);
    setForm({ ...form, ...patch });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await save(form);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal title={t("gate.printer.title")} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("gate.printer.intro")}</p>
        <div>
          <label className="field-label">{t("gate.printer.name")}</label>
          {printers ? (
            <select value={form.printerName} onChange={(e) => set({ printerName: e.target.value })} className="field">
              <option value="">{t("gate.printer.dialogEachTime")}</option>
              {/* A saved printer that is unplugged right now stays selectable. */}
              {[...new Set([...printers, ...(form.printerName ? [form.printerName] : [])])].map((p) => (
                <option key={p} value={p}>
                  {printers.includes(p) ? p : t("gate.printer.missing", { name: p })}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={form.printerName}
              maxLength={200}
              onChange={(e) => set({ printerName: e.target.value })}
              placeholder={t("gate.printer.namePlaceholder")}
              className="field"
            />
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">{printers ? t("gate.printer.silentHint") : t("gate.printer.nameHint")}</p>
        </div>
        <div>
          <label className="field-label">{t("gate.printer.paper")}</label>
          <div className="flex rounded-xl bg-muted p-1">
            {([80, 58] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => set({ paperWidth: w })}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.paperWidth === w ? "bg-secondary text-white shadow-sm" : "text-muted-foreground"}`}
              >
                {w} mm
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="field-label">{t("gate.printer.autoPrint")}</label>
          <select
            value={form.autoPrint}
            onChange={(e) => set({ autoPrint: e.target.value as PrinterSettings["autoPrint"] })}
            className="field"
          >
            {AUTO.map((a) => (
              <option key={a} value={a}>
                {t(`gate.printer.auto.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label">{t("gate.printer.copies")}</label>
            <input
              type="number"
              min={1}
              max={5}
              value={form.copies}
              onChange={(e) => set({ copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
              className="field"
            />
          </div>
          <div>
            <label className="field-label">{t("gate.printer.offset")}</label>
            <input
              type="number"
              min={-10}
              max={10}
              value={form.offsetMm}
              onChange={(e) => set({ offsetMm: Math.min(10, Math.max(-10, Number(e.target.value) || 0)) })}
              className="field"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("gate.printer.offsetHint")}</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1">
            {t("common.close")}
          </button>
          <button type="submit" className="btn-gold flex-1">
            {t("common.save")}
          </button>
        </div>
        {saved && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-success">
            <Check className="h-4 w-4" /> {t("gate.printer.saved")}
          </p>
        )}
      </form>
    </Modal>
  );
}
