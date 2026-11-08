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
