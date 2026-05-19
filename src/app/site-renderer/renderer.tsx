import { useEffect, useState } from "react";

import { sitePageRendererParts } from "./blocks.tsx";
import type { SitePageLinkMode } from "./links.ts";
import { SitePageShell, type PublicSiteTheme, type PublicSiteThemeController } from "./page.tsx";
import type { SitePageTree } from "../../shared/protocol.ts";

export const PUBLIC_SITE_THEME_STORAGE_KEY = "formless:public-site:theme";

export function SitePageRenderer({
  linkMode = "preview",
  tree,
}: {
  linkMode?: SitePageLinkMode;
  tree: SitePageTree;
}) {
  const theme = usePublicSiteTheme();

  return (
    <SitePageShell linkMode={linkMode} parts={sitePageRendererParts} theme={theme} tree={tree} />
  );
}

function usePublicSiteTheme(): PublicSiteThemeController {
  const [theme, setTheme] = useState<PublicSiteTheme>("light");

  useEffect(() => {
    const resolvedTheme = resolveBrowserSiteTheme();
    applyBrowserSiteTheme(resolvedTheme);
    setTheme(resolvedTheme);
  }, []);

  return {
    theme,
    toggleTheme: () => {
      setTheme((current) => {
        const next = current === "dark" ? "light" : "dark";
        persistBrowserSiteTheme(next);
        applyBrowserSiteTheme(next);
        return next;
      });
    },
  };
}

function resolveBrowserSiteTheme(): PublicSiteTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = readStoredSiteTheme();

  if (storedTheme) {
    return storedTheme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredSiteTheme(): PublicSiteTheme | null {
  try {
    const stored = window.localStorage.getItem(PUBLIC_SITE_THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function applyBrowserSiteTheme(theme: PublicSiteTheme) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.siteTheme = theme;
  root.style.setProperty("color-scheme", theme);
}

function persistBrowserSiteTheme(theme: PublicSiteTheme) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PUBLIC_SITE_THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in locked-down browsers; the in-memory theme still works.
  }
}
