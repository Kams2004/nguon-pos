import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImageOff, ImagePlus, Trash2, Upload } from "lucide-react";
import { useSession, useLiveRefresh } from "../context/SessionContext";
import { useConfirm } from "../context/ConfirmContext";
import { api, errorMessage } from "../lib/api/client";
import type { MediaItem } from "../lib/api/types";
import { formatDateTime } from "../lib/format";
import { Pagination, usePaged } from "./Pagination";
import { Empty, Loading, Modal, RefreshButton } from "./ui";
import { translate, useI18n } from "../i18n";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? translate("settings.media.sizeMb", { n: (bytes / 1024 / 1024).toFixed(1) })
    : translate("settings.media.sizeKb", { n: String(Math.max(1, Math.round(bytes / 1024))) });
}

/**
 * The image grid behind both the Médiathèque page (manage: upload/delete)
 * and the image picker (select: click an image to use it).
 */
export function MediaLibrary({
  mode,
  selectedUrl,
  onSelect,
}: {
  mode: "manage" | "select";
  selectedUrl?: string | null;
  onSelect?: (item: MediaItem) => void;
}) {
  const { t } = useI18n();
  const { session } = useSession();
  const confirm = useConfirm();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const paged = usePaged(items ?? [], mode === "select" ? 12 : 24);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setItems(await api.listMedia(session.token));
    } catch (e) {
      setError(errorMessage(e));
      setItems([]);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);
  useLiveRefresh(["AUDIT"], load);

  if (!session) return null;

  const onFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    const preview = URL.createObjectURL(file);
    const ok = await confirm({
      title: t("settings.media.confirmAddTitle"),
      message: (
        <div className="space-y-2">
          <img src={preview} alt="" className="max-h-40 rounded-lg border border-border" />
          <p>{t("settings.media.confirmAddMessage", { name: file.name, size: formatSize(file.size) })}</p>
        </div>
      ),
      confirmLabel: t("common.add"),
    });
    URL.revokeObjectURL(preview);
    if (!ok) return;
    setUploading(true);
    setError(null);
    try {
      const item = await api.uploadMedia(session.token, file);
      await load();
      if (mode === "select") onSelect?.(item);
    } catch (e) {
      setError(errorMessage(e, t("settings.media.uploadError")));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (item: MediaItem) => {
    const ok = await confirm({
      title: t("settings.media.confirmDeleteTitle"),
      message: t("settings.media.confirmDeleteMessage", { name: item.originalName }),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.deleteMedia(session.token, item.id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button onClick={() => fileInput.current?.click()} disabled={uploading} className="btn-blue">
          {uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? t("settings.media.uploading") : t("settings.media.upload")}
        </button>
        <RefreshButton onRefresh={load} />
        <p className="text-xs text-muted-foreground">{t("settings.media.formats")}</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}

      {items === null ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>
          <ImagePlus className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          {t("settings.media.empty")}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {paged.pageItems.map((item) => {
            const selected = selectedUrl === item.url;
            return (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-xl border-2 bg-muted/40 transition-all ${
                  selected ? "border-secondary ring-2 ring-secondary/30" : "border-border"
                } ${mode === "select" ? "cursor-pointer hover:border-secondary/60" : ""}`}
                onClick={mode === "select" ? () => onSelect?.(item) : undefined}
              >
                <div className="aspect-[4/3] bg-[conic-gradient(#f1f3f7_25%,#fff_0_50%,#f1f3f7_0_75%,#fff_0)] bg-[length:16px_16px]">
                  <img src={item.url} alt={item.originalName} className="h-full w-full object-contain" loading="lazy" />
                </div>
                {selected && (
                  <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-white shadow">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
                {mode === "manage" && (
                  <button
                    onClick={() => remove(item)}
                    className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-destructive opacity-0 shadow transition-opacity group-hover:opacity-100 focus:opacity-100"
                    aria-label={t("settings.media.deleteNamed", { name: item.originalName })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <div className="border-t border-border bg-card px-2.5 py-2">
                  <p className="truncate text-xs font-semibold text-foreground" title={item.originalName}>
                    {item.originalName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatSize(item.sizeBytes)} · {formatDateTime(item.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {items && items.length > 0 && (
        <div className="-mx-4 -mb-4 sm:-mx-5 sm:-mb-5">
          <Pagination
            page={paged.page}
            pages={paged.pages}
            total={paged.total}
            size={paged.size}
            onPage={paged.setPage}
            unit={t("settings.media.unit")}
          />
        </div>
      )}
    </div>
  );
}

/** A form field for an image: thumbnail + "Choisir" (opens the library) + "Retirer". */
export function ImageField({
  label,
  value,
  onChange,
  fallback,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  /** What's shown when no image is chosen (the app's default artwork). */
  fallback?: string;
  hint?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const shown = value || fallback;
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
          {shown ? (
            <img src={shown} alt="" className={`h-full w-full object-contain ${value ? "" : "opacity-50"}`} />
          ) : (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setOpen(true)} className="btn-outline px-3 py-1.5 text-xs">
              <ImagePlus className="h-3.5 w-3.5" /> {value ? t("settings.media.change") : t("settings.media.choose")}
            </button>
            {value && (
              <button type="button" onClick={() => onChange(null)} className="btn-outline px-3 py-1.5 text-xs text-destructive">
                {t("settings.media.remove")}
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {value ? t("settings.media.customImage") : (hint ?? t("settings.media.defaultImage"))}
          </p>
        </div>
      </div>
      {open && (
        <Modal title={label} onClose={() => setOpen(false)} size="xl">
          <MediaLibrary
            mode="select"
            selectedUrl={value}
            onSelect={(item) => {
              onChange(item.url);
              setOpen(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
