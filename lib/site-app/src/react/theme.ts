import { useEffect, useState } from "react";

import {
  nextPublicSiteThemeMode,
  publicSiteThemeDocumentMarker,
  PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY,
  PUBLIC_SITE_THEME_SSR_MODE,
  PUBLIC_SITE_THEME_STORAGE_KEY,
  PUBLIC_SITE_THEME_SYSTEM_QUERY,
  resolvePublicSiteThemeMode,
  type PublicSiteThemeMode,
} from "../public-theme.ts";

export type PublicSiteThemeController = {
  mode: PublicSiteThemeMode;
  toggleMode: () => void;
};

export function usePublicSiteTheme(): PublicSiteThemeController {
  const [mode, setMode] = useState<PublicSiteThemeMode>(PUBLIC_SITE_THEME_SSR_MODE);

  useEffect(() => {
    const resolvedMode = resolveBrowserSiteThemeMode();
    applyBrowserSiteThemeMode(resolvedMode);
    setMode(resolvedMode);
  }, []);

  return {
    mode,
    toggleMode: () => {
      setMode((current) => {
        const next = nextPublicSiteThemeMode(current);
        persistBrowserSiteThemeMode(next);
        applyBrowserSiteThemeMode(next);
        return next;
      });
    },
  };
}

export function resolveBrowserSiteThemeMode(): PublicSiteThemeMode {
  if (typeof window === "undefined") {
    return PUBLIC_SITE_THEME_SSR_MODE;
  }

  return resolvePublicSiteThemeMode({
    storedValue: readStoredSiteThemeValue(),
    systemPrefersDark: browserSystemPrefersDark(),
  });
}

function readStoredSiteThemeValue(): string | null {
  try {
    return window.localStorage.getItem(PUBLIC_SITE_THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function browserSystemPrefersDark(): boolean {
  try {
    return window.matchMedia?.(PUBLIC_SITE_THEME_SYSTEM_QUERY).matches ?? false;
  } catch {
    return false;
  }
}

export function applyBrowserSiteThemeMode(mode: PublicSiteThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const marker = publicSiteThemeDocumentMarker(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.dataset[PUBLIC_SITE_THEME_DOCUMENT_DATASET_KEY] = marker.dataValue;
  root.style.setProperty("color-scheme", marker.colorScheme);
}

export function persistBrowserSiteThemeMode(mode: PublicSiteThemeMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PUBLIC_SITE_THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in locked-down browsers; the in-memory theme still works.
  }
}
