import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// `--mode desktop` builds the till for the desktop app: it talks to the
// local server (.env.desktop sets VITE_TILL_BACKEND=edge), is loaded from
// disk by the webview (relative paths) and has no service worker.
export default defineConfig(({ mode }) => ({
  base: mode === "desktop" ? "./" : "/",
  server: {
    host: "::",
    port: 5173,
  },
  plugins: [
    react(),
    mode !== "desktop" &&
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "logo.png"],
        manifest: {
          name: "Nguon POS",
          short_name: "Nguon POS",
          description: "Billetterie et caisse hors-ligne pour les portes du festival Nguon",
          theme_color: "#0A4DA2",
          background_color: "#ffffff",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // Milestone 0: precache the app shell only. API runtime-caching
          // strategies for catalog/sales data are added once those endpoints
          // exist (Milestone 1+) — the real offline data story lives in
          // IndexedDB (src/lib/offline), not in the service worker cache.
          // Festival artwork (jpg) is precached too, so ticket cards, the
          // login screen and the POS grid look right on a terminal that has
          // never been online since install.
          globPatterns: ["**/*.{js,css,html,svg,png,ico,jpg}"],
        },
      }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
