import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api/client";
import type { Branding } from "../lib/api/types";
import { useLiveEvents } from "./SessionContext";

// Logo and login background as set in Paramètres. Cached locally so the
// login screen and offline tills show the right logo without the network.
const CACHE_KEY = "nguon-pos.branding";
const DEFAULTS = { logoUrl: "/logo.png", loginBackgroundUrl: "/img/banners/palais-sultan-foumban.jpg", name: "Nguon Festival" };

type BrandingValue = { logoUrl: string; loginBackgroundUrl: string; name: string; reload: () => void };

const BrandingContext = createContext<BrandingValue | null>(null);

function readCache(): Branding | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(readCache);

  const reload = useCallback(() => {
    api
      .getBranding()
      .then((b) => {
        setBranding(b);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(b));
        } catch {
          /* cache is a convenience only */
        }
      })
      .catch(() => {
        /* offline: keep the cached branding */
      });
  }, []);

  useEffect(reload, [reload]);
  useLiveEvents(["CATALOG_CHANGED"], reload);

  return (
    <BrandingContext.Provider
      value={{
        logoUrl: branding?.logoUrl || DEFAULTS.logoUrl,
        loginBackgroundUrl: branding?.loginBackgroundUrl || DEFAULTS.loginBackgroundUrl,
        name: branding?.name || DEFAULTS.name,
        reload,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within BrandingProvider");
  return ctx;
}
