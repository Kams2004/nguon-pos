import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api/client";
import type { Branding } from "../lib/api/types";
import { isEdgeMode, mediaUrl } from "../lib/platform";
import { useLiveEvents, useSession } from "./SessionContext";

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

function writeCache(b: Branding) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    /* cache is a convenience only */
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding | null>(readCache);
  const { session } = useSession();

  // Desktop till: no web API here — the establishment comes with the till's
  // catalogue (kept up to date live), and is remembered for the login screen.
  const edgeEstablishment = isEdgeMode() ? session?.bootstrap?.establishment : undefined;
  useEffect(() => {
    if (!edgeEstablishment) return;
    setBranding((prev) => {
      const next = {
        name: edgeEstablishment.name,
        logoUrl: edgeEstablishment.logoUrl,
        loginBackgroundUrl: prev?.loginBackgroundUrl ?? null,
      };
      writeCache(next);
      return next;
    });
  }, [edgeEstablishment?.name, edgeEstablishment?.logoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => {
    if (isEdgeMode()) return;
    api
      .getBranding()
      .then((b) => {
        setBranding(b);
        writeCache(b);
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
        logoUrl: mediaUrl(branding?.logoUrl) || DEFAULTS.logoUrl,
        loginBackgroundUrl: mediaUrl(branding?.loginBackgroundUrl) || DEFAULTS.loginBackgroundUrl,
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
