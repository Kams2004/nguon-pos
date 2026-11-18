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

/**
 * An image from the media library ("/media/2026/11/….png"). The web app
 * gets it from the server it was loaded from; the desktop till from its
 * local server, which keeps a copy so tickets still print offline.
 */
export function mediaUrl<T extends string | null | undefined>(url: T): T {
  if (!url || !isEdgeMode() || !url.startsWith("/media/")) return url;
  return `${EDGE_URL}${url}` as T;
}

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
  /** Saves bytes into the user's Downloads folder; returns the full path. */
  saveDownload: async (fileName: string, bytes: ArrayBuffer): Promise<string> => {
    const t = tauri();
    if (!t) throw new Error("NOT_DESKTOP");
    // base64 in chunks: a multi-megabyte export would overflow String.fromCharCode(...all).
    const view = new Uint8Array(bytes);
    let binary = "";
    for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
    return t.invoke<string>("save_download", { fileName, dataBase64: btoa(binary) });
  },
  /** The printers installed on this computer. */
  printers: async (): Promise<string[]> => (await tauri()?.invoke<string[]>("list_printers")) ?? [],
};

/** What happened when printing, to tell the cashier. */
export type PrintOutcome =
  | { kind: "sent"; printer: string } // in the printer's queue (desktop, chosen printer)
  | { kind: "dialog"; result: "PRINTED" | "CANCELLED" | "OPENED" } // the system's print dialog
  | { kind: "browser" } // a browser till: the browser's own dialog
  | { kind: "error"; code: string; printer?: string };

/**
 * Prints what is on screen (the print styles pick the receipt/tickets). A
 * desktop till with a chosen printer prints silently and says whether the job
 * reached it; without one, the system's dialog. A failure is reported, not
 * covered up by another dialog: the cashier decides what to do.
 */
export async function printPage(printerName: string | undefined, paperWidthMm: number): Promise<PrintOutcome> {
  const t = tauri();
  if (t) {
    try {
      if (printerName) {
        await t.invoke("print_silent", { printer: printerName, paperWidthMm });
        return { kind: "sent", printer: printerName };
      }
      return { kind: "dialog", result: await t.invoke<"PRINTED" | "CANCELLED" | "OPENED">("print_dialog") };
    } catch (e) {
      return { kind: "error", code: String(e), printer: printerName || undefined };
    }
  }
  window.print();
  return { kind: "browser" };
}

/** The system's print dialog, whatever printer is set (after a failed silent print). */
export async function printWithDialog(): Promise<PrintOutcome> {
  const t = tauri();
  if (!t) {
    window.print();
    return { kind: "browser" };
  }
  try {
    return { kind: "dialog", result: await t.invoke<"PRINTED" | "CANCELLED" | "OPENED">("print_dialog") };
  } catch (e) {
    return { kind: "error", code: String(e) };
  }
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
