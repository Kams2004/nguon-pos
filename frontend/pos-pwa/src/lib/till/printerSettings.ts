import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { isEdgeMode } from "../platform";
import { edge, type PrinterSettings } from "./edgeClient";

export type { PrinterSettings };

// How this point of sale prints. Each till keeps its own: on a desktop till
// in its local server, on a browser till in that browser.
export const PRINTER_DEFAULTS: PrinterSettings = { printerName: "", paperWidth: 80, autoPrint: "NONE", copies: 1, offsetMm: 0 };

const STORAGE_KEY = "nguon-pos.printer";
const CHANGED = "nguon-printer-settings";

function readLocal(): PrinterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...PRINTER_DEFAULTS, ...JSON.parse(raw) } : PRINTER_DEFAULTS;
  } catch {
    return PRINTER_DEFAULTS;
  }
}

/** This till's printer settings, kept in step across the screens that use them. */
export function usePrinterSettings(): [PrinterSettings | null, (s: PrinterSettings) => Promise<void>] {
  const { session } = useSession();
  const [settings, setSettings] = useState<PrinterSettings | null>(null);

  const load = useCallback(() => {
    if (!isEdgeMode()) return setSettings(readLocal());
    if (!session) return;
    edge
      .printer(session.token)
      .then(setSettings)
      .catch(() => setSettings(PRINTER_DEFAULTS));
  }, [session]);

  useEffect(() => {
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);

  const save = useCallback(
    async (s: PrinterSettings) => {
      if (isEdgeMode()) {
        if (!session) return;
        await edge.savePrinter(session.token, s);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [session],
  );

  return [settings, save];
}
