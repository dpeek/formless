import type { SitePublicRendererProps } from "../public-renderer.ts";
import { sitePageRendererParts } from "./blocks.tsx";
import { SitePageShell } from "./page.tsx";
import { usePublicSiteTheme } from "./theme.ts";

export function LegacySitePageRenderer({ linkMode, routeBase, tree }: SitePublicRendererProps) {
  const theme = usePublicSiteTheme();

  return (
    <SitePageShell
      linkMode={linkMode}
      parts={sitePageRendererParts}
      routeBase={routeBase}
      theme={theme}
      tree={tree}
    />
  );
}
