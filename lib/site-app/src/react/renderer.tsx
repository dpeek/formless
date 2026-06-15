import { sitePageRendererParts } from "./blocks.tsx";
import type { SitePageLinkMode } from "./links.ts";
import { SitePageShell } from "./page.tsx";
import { usePublicSiteTheme } from "./theme.ts";
import type { SitePageTree } from "../types.ts";

export { PUBLIC_SITE_THEME_STORAGE_KEY } from "./theme.ts";

export function SitePageRenderer({
  linkMode = "preview",
  routeBase,
  tree,
}: {
  linkMode?: SitePageLinkMode;
  routeBase?: `/${string}`;
  tree: SitePageTree;
}) {
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
