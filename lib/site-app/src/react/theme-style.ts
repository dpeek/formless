import type { CSSProperties } from "react";

import type { SiteSettingsNode } from "../types.ts";
import { publicSiteThemePalette, type PublicSiteThemeMode } from "../public-theme.ts";

type SiteThemeVariables = CSSProperties & Record<`--${string}`, string>;

export function publicSiteThemeVariables(
  site: SiteSettingsNode | undefined,
  mode: PublicSiteThemeMode,
): SiteThemeVariables {
  const palette = publicSiteThemePalette(site, mode);

  return {
    backgroundColor: "var(--site-bg)",
    "--site-bg": palette.background,
    "--site-link": palette.link,
    "--site-link-decoration": palette.linkDecoration,
    "--site-focus": palette.focus,
  };
}
