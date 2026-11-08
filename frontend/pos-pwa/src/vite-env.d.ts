/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "edge" for the desktop till build (talks to the local server); unset for the browser PWA. */
  readonly VITE_TILL_BACKEND?: string;
  /** Local server address, default http://127.0.0.1:47300. */
  readonly VITE_EDGE_URL?: string;
  /** Development only: the local server's UI token (its <data-dir>/ui-token file). */
  readonly VITE_EDGE_UI_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
