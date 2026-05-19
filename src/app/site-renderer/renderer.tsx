import { sitePageRendererParts } from "./blocks.tsx";
import type { SitePageLinkMode } from "./links.ts";
import { SitePageShell } from "./page.tsx";
import { usePublicSiteTheme } from "./theme.ts";
import type { SitePageTree } from "../../shared/protocol.ts";

export { PUBLIC_SITE_THEME_STORAGE_KEY } from "./theme.ts";

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
