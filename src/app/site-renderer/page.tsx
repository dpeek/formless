import { createContext, useContext, type ComponentType, type ReactNode } from "react";

import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../../shared/protocol.ts";
import type { SitePageLinkMode } from "./links.ts";

export type PublicSiteTheme = "light" | "dark";

export type PublicSiteThemeController = {
  theme: PublicSiteTheme;
  toggleTheme: () => void;
};

export type PublicSitePrimaryImageVariant = "post-detail" | "summary";

type SitePageRendererParts = {
  Footer: ComponentType<{ block: SiteBlockNode }>;
  Header: ComponentType<{ block: SiteBlockNode }>;
  Placement: ComponentType<{ placement: SitePlacementNode }>;
  PrimaryImage: ComponentType<{
    placement: SitePlacementNode;
    variant: PublicSitePrimaryImageVariant;
  }>;
};

export const SitePageLinkModeContext = createContext<SitePageLinkMode>("preview");
export const SiteRouteSlugContext = createContext<string | undefined>(undefined);
export const HeaderNavigationContext = createContext(false);
export const FooterNavigationContext = createContext(false);
export const SiteThemeContext = createContext<PublicSiteThemeController>({
  theme: "light",
  toggleTheme: () => {},
});

export function SitePageShell({
  linkMode,
  parts,
  theme,
  tree,
}: {
  linkMode: SitePageLinkMode;
  parts: SitePageRendererParts;
  theme: PublicSiteThemeController;
  tree: SitePageTree;
}) {
  const frame = tree.frame;
  const { Footer, Header } = parts;

  return (
    <SitePageLinkModeContext.Provider value={linkMode}>
      <SiteRouteSlugContext.Provider value={tree.route?.slug}>
        <SiteThemeContext.Provider value={theme}>
          <article
            className={
              theme.theme === "dark"
                ? "dark flex min-h-dvh flex-col bg-zinc-950 text-zinc-100"
                : "flex min-h-dvh flex-col bg-white text-zinc-950"
            }
            data-site-theme={theme.theme}
          >
            {frame.header ? <Header block={frame.header} /> : null}
            <SiteRoutePage parts={parts} tree={tree} />
            {frame.footer ? <Footer block={frame.footer} /> : null}
          </article>
        </SiteThemeContext.Provider>
      </SiteRouteSlugContext.Provider>
    </SitePageLinkModeContext.Provider>
  );
}

function SiteRoutePage({ parts, tree }: { parts: SitePageRendererParts; tree: SitePageTree }) {
  switch (tree.route?.kind) {
    case "post":
      return <ContentDetailPage block={tree.page} parts={parts} />;
    case "post-index":
    case "page":
    default:
      return <PagePlacementFlow page={tree.page} Placement={parts.Placement} />;
  }
}

function ContentDetailPage({
  block,
  parts,
}: {
  block: SiteBlockNode;
  parts: SitePageRendererParts;
}) {
  const primaryImage = primaryImagePlacement(block);
  const bodyPlacements = block.placements.filter(isDefaultPlacement);
  const { Placement, PrimaryImage } = parts;

  return (
    <PageMain>
      <header className="max-w-3xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h1>
        {primaryImage ? <PrimaryImage placement={primaryImage} variant="post-detail" /> : null}
      </header>
      {bodyPlacements.map((placement) => (
        <Placement key={placement.id} placement={placement} />
      ))}
    </PageMain>
  );
}

export function PagePlacementFlow({
  page,
  Placement,
}: {
  page: SiteBlockNode;
  Placement: ComponentType<{ placement: SitePlacementNode }>;
}) {
  const bodyPlacements = page.placements.filter((placement) => !isPageChromePlacement(placement));

  return (
    <PageMain>
      {bodyPlacements.map((placement) => (
        <Placement key={placement.id} placement={placement} />
      ))}
    </PageMain>
  );
}

function PageMain({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-10">
      {children}
    </main>
  );
}

function primaryImagePlacement(block: SiteBlockNode): SitePlacementNode | undefined {
  return block.placements.find(
    (placement) => placement.slot === "primaryImage" && placement.block.type === "image",
  );
}

function isDefaultPlacement(placement: SitePlacementNode): boolean {
  return !placement.slot;
}

function isPageChromePlacement(placement: SitePlacementNode): boolean {
  return isPageHeaderPlacement(placement) || isPageFooterPlacement(placement);
}

function isPageHeaderPlacement(placement: SitePlacementNode): boolean {
  return placement.block.type === "header";
}

function isPageFooterPlacement(placement: SitePlacementNode): boolean {
  return placement.block.type === "footer";
}

export function useSitePageLinkMode(): SitePageLinkMode {
  return useContext(SitePageLinkModeContext);
}

export function useSiteRouteSlug(): string | undefined {
  return useContext(SiteRouteSlugContext);
}

export function useHeaderNavigation(): boolean {
  return useContext(HeaderNavigationContext);
}

export function useFooterNavigation(): boolean {
  return useContext(FooterNavigationContext);
}

export function useSiteTheme(): PublicSiteThemeController {
  return useContext(SiteThemeContext);
}
