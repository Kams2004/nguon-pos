import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Modal } from "../components/ui";
import { useI18n } from "../i18n";

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  /** "danger" for destructive/irreversible actions (deactivate, delete). */
  tone?: "default" | "danger";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Every admin action goes through `await confirm({...})` before calling the
 * API — one shared dialog, so the wording and look are the same everywhere.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const { t } = useI18n();
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  const danger = options?.tone === "danger";
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal title={options.title} onClose={() => close(false)}>
          <div className="flex gap-4">
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${
                danger ? "bg-red-50 text-destructive" : "bg-blue-50 text-secondary"
              }`}
            >
              {danger ? <AlertTriangle className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
            </div>
            <div className="text-sm text-muted-foreground">{options.message}</div>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={() => close(false)} className="btn-outline flex-1">
              {t("common.cancel")}
            </button>
            <button autoFocus onClick={() => close(true)} className={danger ? "btn flex-1 bg-destructive text-white" : "btn-blue flex-1"}>
              {options.confirmLabel ?? t("common.confirm")}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
