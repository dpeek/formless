import {
  createContext,
  useEffect,
  useContext,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";

import { primaryImagePlacement, type PublicSitePrimaryImageVariant } from "./media.tsx";
import { publicSiteThemeVariables } from "./theme-style.ts";
import type { PublicSiteThemeController } from "./theme.ts";
import type { SitePageLinkMode } from "../public-links.ts";
import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../types.ts";

type SitePageRendererParts = {
  Footer: ComponentType<{ block: SiteBlockNode }>;
  Header: ComponentType<{ block: SiteBlockNode }>;
  Placement: ComponentType<{ placement: SitePlacementNode }>;
  PrimaryImage: ComponentType<{
    placement: SitePlacementNode;
    variant: PublicSitePrimaryImageVariant;
  }>;
};

const SITE_BODY_CREASE_STYLE = {
  backgroundImage:
    "radial-gradient(ellipse at top center, rgb(0 0 0 / 0.3) 0%, rgb(0 0 0 / 0) 100%)",
} satisfies CSSProperties;

export const SitePageLinkModeContext = createContext<SitePageLinkMode>("preview");
export const SitePageRouteBaseContext = createContext<`/${string}` | undefined>(undefined);
export const SiteRouteSlugContext = createContext<string | undefined>(undefined);
export const HeaderNavigationContext = createContext(false);
export const FooterNavigationContext = createContext(false);
export const SiteThemeContext = createContext<PublicSiteThemeController>({
  mode: "light",
  toggleMode: () => {},
});

export function SitePageShell({
  linkMode,
  parts,
  routeBase,
  theme,
  tree,
}: {
  linkMode: SitePageLinkMode;
  parts: SitePageRendererParts;
  routeBase?: `/${string}`;
  theme: PublicSiteThemeController;
  tree: SitePageTree;
}) {
  const frame = tree.frame;
  const { Footer, Header } = parts;
  const themeVariables = publicSiteThemeVariables(tree.site, theme.mode);
  const hasFooter = Boolean(frame.footer);
  const footerCompletelyRevealed = useFooterCompletelyRevealed(hasFooter);
  const bodyClassName = frame.header
    ? "relative z-10 flex flex-1 flex-col bg-[color:var(--site-bg)] pt-24 sm:pt-28"
    : "relative z-10 flex flex-1 flex-col bg-[color:var(--site-bg)]";

  return (
    <SitePageLinkModeContext.Provider value={linkMode}>
      <SitePageRouteBaseContext.Provider value={routeBase}>
        <SiteRouteSlugContext.Provider value={tree.route?.slug}>
          <SiteThemeContext.Provider value={theme}>
            <article
              className={
                theme.mode === "dark"
                  ? "dark flex min-h-dvh flex-col text-zinc-100"
                  : "flex min-h-dvh flex-col text-zinc-950"
              }
              data-site-theme={theme.mode}
              data-formless-native-navigation
              style={themeVariables}
            >
              {frame.header ? <Header block={frame.header} /> : null}
              <div className={bodyClassName} data-site-body>
                <SiteRoutePage parts={parts} tree={tree} />
                {hasFooter ? (
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 -bottom-2.5 z-20 h-2.5 w-full bg-[color:var(--site-bg)] transition-opacity duration-200 ${
                      footerCompletelyRevealed ? "opacity-0" : "opacity-100"
                    }`}
                    data-site-body-crease
                    data-site-footer-revealed={footerCompletelyRevealed ? "true" : "false"}
                    style={SITE_BODY_CREASE_STYLE}
                  />
                ) : null}
              </div>
              {frame.footer ? <Footer block={frame.footer} /> : null}
            </article>
          </SiteThemeContext.Provider>
        </SiteRouteSlugContext.Provider>
      </SitePageRouteBaseContext.Provider>
    </SitePageLinkModeContext.Provider>
  );
}

function useFooterCompletelyRevealed(hasFooter: boolean): boolean {
  const [isRevealed, setIsRevealed] = useState(!hasFooter);

  useEffect(() => {
    if (!hasFooter) {
      setIsRevealed(true);
      return;
    }

    function syncFooterState() {
      const scrollHeight = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0,
      );
      const viewportBottom = window.scrollY + window.innerHeight;

      setIsRevealed(viewportBottom >= scrollHeight - 1);
    }

    syncFooterState();
    window.addEventListener("scroll", syncFooterState, { passive: true });
    window.addEventListener("resize", syncFooterState);

    return () => {
      window.removeEventListener("scroll", syncFooterState);
      window.removeEventListener("resize", syncFooterState);
    };
  }, [hasFooter]);

  return isRevealed;
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

export function useSitePageRouteBase(): `/${string}` | undefined {
  return useContext(SitePageRouteBaseContext);
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
