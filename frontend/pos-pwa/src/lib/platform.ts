// Which back end the till screens talk to:
//  - "browser" (default): the PWA — IndexedDB outbox, syncs to central itself;
//  - "edge": the desktop till — everything goes through the local server
//    installed on the machine (edge/edge-service), which owns the data,
//    the QR signing key and the sync to central.
// Set at build time: VITE_TILL_BACKEND=edge (the desktop build sets it).
export const TILL_BACKEND: "browser" | "edge" = import.meta.env.VITE_TILL_BACKEND === "edge" ? "edge" : "browser";

export function isEdgeMode(): boolean {
  return TILL_BACKEND === "edge";
}

/** The local server's address on this machine. */
export const EDGE_URL: string = import.meta.env.VITE_EDGE_URL ?? "http://127.0.0.1:47300";

type TauriInternals = { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };

function tauri(): TauriInternals | undefined {
  return (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
}

/** The desktop shell (Tauri): its own version, and a restart into a newly installed one. */
export const desktopApp = {
  available: () => tauri() !== undefined,
  version: async (): Promise<string | null> => (await tauri()?.invoke<string>("plugin:app|version")) ?? null,
  restart: async (): Promise<void> => {
    await tauri()?.invoke("restart_app");
  },
  /** The printers installed on this computer. */
  printers: async (): Promise<string[]> => (await tauri()?.invoke<string[]>("list_printers")) ?? [],
  /** Prints the page as it is now, straight to `printer`, with no dialog. */
  printSilent: async (printer: string, paperWidthMm: number): Promise<void> => {
    const t = tauri();
    if (!t) throw new Error("NOT_DESKTOP");
    await t.invoke("print_silent", { printer, paperWidthMm });
  },
};

/**
 * Prints what is on screen (the print styles pick the receipt/tickets): on
 * a desktop till with a chosen printer, silently; otherwise through the
 * system's print dialog.
 */
export async function printPage(printerName: string | undefined, paperWidthMm: number): Promise<void> {
  if (printerName && desktopApp.available()) {
    try {
      await desktopApp.printSilent(printerName, paperWidthMm);
      return;
    } catch (e) {
      console.warn("Silent printing failed, falling back to the print dialog", e);
    }
  }
  window.print();
}

/** "0.2.0" > "0.1.9"; anything that isn't MAJOR.MINOR.PATCH ("dev") never counts as newer. */
export function isNewerVersion(candidate: string | null | undefined, current: string | null | undefined): boolean {
  const parse = (v: string | null | undefined) => (v && /^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
