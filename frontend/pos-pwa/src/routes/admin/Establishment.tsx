import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Palette } from "lucide-react";
import { useSession } from "../../context/SessionContext";
import { useConfirm } from "../../context/ConfirmContext";
import { api, errorMessage } from "../../lib/api/client";
import type { AdminEstablishment, ReceiptMode } from "../../lib/api/types";
import { CardHeader, Loading, PageHeader } from "../../components/ui";
import { ImageField } from "../../components/MediaLibrary";

const RECEIPT_MODES: { value: ReceiptMode; label: string; hint: string }[] = [
  { value: "STANDARD", label: "Standard", hint: "Un seul ticket récapitulatif par vente" },
  { value: "INDIVIDUAL_TICKETS", label: "Individuel", hint: "Un ticket distinct par entrée vendue" },
  { value: "CONFIGURABLE_PER_TICKET_TYPE", label: "Par type de billet", hint: "Chaque type de billet choisit son mode" },
];

export default function Establishment() {
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
  if (!data) return <Loading />;

  const set = (patch: Partial<AdminEstablishment>) => {
    setSaved(false);
    setData({ ...data, ...patch });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      title: "Enregistrer les paramètres ?",
      message: "Le nom, le logo et le fond de connexion seront mis à jour partout, y compris sur les caisses ouvertes.",
      confirmLabel: "Enregistrer",
    });
    if (!ok) return;
    setError(null);
    try {
      // The ticket/receipt fields are edited in "Billet & reçu" — sent back unchanged.
      const { id: _id, ...payload } = data;
      setData(await api.updateEstablishment(session.token, payload));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, "Impossible d'enregistrer les paramètres."));
    }
  };

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Établissement, logo, images et mode de ticket" />

      <form onSubmit={handleSubmit} className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="card">
            <CardHeader title="Établissement & images" />
            <div className="space-y-4 px-5 pb-5">
              <div>
                <label className="field-label">Nom</label>
                <input required value={data.name} onChange={(e) => set({ name: e.target.value })} className="field" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <ImageField label="Logo / icône" value={data.logoUrl} onChange={(logoUrl) => set({ logoUrl })} fallback="/logo.png" hint="Logo Nguon par défaut" />
                <ImageField
                  label="Fond de l'écran de connexion"
                  value={data.loginBackgroundUrl}
                  onChange={(loginBackgroundUrl) => set({ loginBackgroundUrl })}
                  fallback="/img/banners/hero.jpg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["brandPrimaryColor", "brandSecondaryColor"] as const).map((key) => (
                  <div key={key}>
                    <label className="field-label">{key === "brandPrimaryColor" ? "Couleur principale" : "Couleur secondaire"}</label>
                    <div className="flex items-center gap-2">
                      <span className="h-10 w-10 flex-shrink-0 rounded-xl border border-border" style={{ background: data[key] ?? "transparent" }} />
                      <input value={data[key] ?? ""} onChange={(e) => set({ [key]: e.target.value || null })} placeholder="#0A4DA2" className="field font-mono" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <CardHeader title="Mode de ticket par défaut" />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
              {RECEIPT_MODES.map((m) => {
                const active = data.receiptMode === m.value;
                return (
                  <button
                    type="button"
                    key={m.value}
                    onClick={() => set({ receiptMode: m.value })}
                    className={`relative rounded-xl border-2 p-4 text-left transition-colors ${
                      active ? "border-secondary bg-blue-50/60" : "border-border hover:border-secondary/40"
                    }`}
                  >
                    {active && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <p className="text-sm font-bold text-foreground">{m.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
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
            <p className="mt-3 font-display font-bold text-foreground">Personnaliser le billet et le reçu</p>
            <p className="mt-1 text-sm text-muted-foreground">Textes, couleurs, éléments imprimés, largeur de papier, mentions légales — avec aperçu et impression test.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-secondary group-hover:underline">
              Ouvrir <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
          <button type="submit" className="btn-gold w-full">
            Enregistrer les paramètres
          </button>
          {saved && (
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-success">
              <Check className="h-4 w-4" /> Enregistré
            </p>
          )}
        </div>
      </form>
    </>
  );
}
