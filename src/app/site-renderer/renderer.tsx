import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SvgIcon } from "@formless/ui/svg-icon";
import { isExternalSiteHref, profileAwareSiteHref, type SitePageLinkMode } from "./links.ts";
import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../../shared/protocol.ts";

const SitePageLinkModeContext = createContext<SitePageLinkMode>("preview");
const SiteThemeContext = createContext<PublicSiteThemeController>({
  theme: "light",
  toggleTheme: () => {},
});

type PublicSiteTheme = "light" | "dark";

type PublicSiteThemeController = {
  theme: PublicSiteTheme;
  toggleTheme: () => void;
};

const SITE_THEME_STORAGE_KEY = "formless:public-site:theme";

export function SitePageRenderer({
  linkMode = "preview",
  tree,
}: {
  linkMode?: SitePageLinkMode;
  tree: SitePageTree;
}) {
  const frame = tree.frame;
  const theme = usePublicSiteTheme();

  return (
    <SitePageLinkModeContext.Provider value={linkMode}>
      <SiteThemeContext.Provider value={theme}>
        <article
          className={
            theme.theme === "dark"
              ? "dark min-h-dvh bg-zinc-950 text-zinc-100"
              : "min-h-dvh bg-white text-zinc-950"
          }
          data-site-theme={theme.theme}
        >
          {frame.header ? <HeaderGroup block={frame.header} /> : null}
          <SiteRoutePage tree={tree} />
          {frame.footer ? <FooterGroup block={frame.footer} /> : null}
        </article>
      </SiteThemeContext.Provider>
    </SitePageLinkModeContext.Provider>
  );
}

function SiteRoutePage({ tree }: { tree: SitePageTree }) {
  switch (tree.route?.kind) {
    case "post-index":
      return <PostIndexPage page={tree.page} />;
    case "post":
      return <ContentDetailPage block={tree.page} />;
    case "page":
    default:
      return <PagePlacementFlow page={tree.page} />;
  }
}

function SitePlacementRenderer({ placement }: { placement: SitePlacementNode }) {
  return <SiteBlockRenderer block={placement.block} placement={placement} />;
}

function SiteBlockRenderer({
  block,
  placement,
}: {
  block: SiteBlockNode;
  placement?: SitePlacementNode;
}) {
  switch (block.type) {
    case "page":
      return <PageBlock block={block} />;
    case "header":
      return <HeaderGroup block={block} />;
    case "footer":
      return <FooterGroup block={block} />;
    case "group":
      return <GroupBlock block={block} placement={placement} />;
    case "hero":
      return <HeroBlock block={block} />;
    case "markdown":
      return <MarkdownBlock block={block} />;
    case "link":
      return <LinkBlock block={block} placement={placement} />;
    case "image":
      return <ImageBlock block={block} />;
    case "post":
    case "project":
    case "profile":
      return <ContentSummary block={block} />;
    default:
      return null;
  }
}

function PageBlock({ block }: { block: SiteBlockNode }) {
  return <PagePlacementFlow page={block} />;
}

function PageIntro({ block }: { block: SiteBlockNode }) {
  return (
    <header className="max-w-3xl space-y-4">
      <h1 className="text-4xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
        {block.label}
      </h1>
      {block.body ? (
        <PlainText text={block.body} className="text-base text-zinc-600 dark:text-zinc-300" />
      ) : null}
    </header>
  );
}

function PostIndexPage({ page }: { page: SiteBlockNode }) {
  return (
    <PageMain>
      <PageIntro block={page} />
      {page.placements.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2" aria-label={page.label}>
          {page.placements.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
        </section>
      ) : (
        <p className="text-sm text-zinc-600">No posts published yet.</p>
      )}
    </PageMain>
  );
}

function ContentDetailPage({ block }: { block: SiteBlockNode }) {
  const hasBodyPlacements = block.placements.length > 0;

  return (
    <PageMain>
      <header className="max-w-3xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h1>
        {!hasBodyPlacements && block.body ? (
          <PlainText
            text={block.body}
            className="text-base leading-7 text-zinc-700 dark:text-zinc-300"
          />
        ) : null}
      </header>
      {block.placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </PageMain>
  );
}

function GroupBlock({ block, placement }: { block: SiteBlockNode; placement?: SitePlacementNode }) {
  if (block.templateKey === "header") {
    return <HeaderGroup block={block} />;
  }

  if (block.templateKey === "footer-group") {
    return <FooterSection block={block} />;
  }

  if (block.templateKey === "footer") {
    return <FooterGroup block={block} />;
  }

  return (
    <section className="space-y-4" data-block-type={block.type}>
      <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
        {displayLabel(block, placement)}
      </h2>
      {block.body ? (
        <PlainText text={block.body} className="text-sm text-zinc-600 dark:text-zinc-300" />
      ) : null}
      {block.placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </section>
  );
}

function HeaderGroup({ block }: { block: SiteBlockNode }) {
  const { overflow, primary } = partitionHeaderPlacements(block.placements);

  return (
    <header className="text-zinc-900 dark:text-zinc-100" data-site-header>
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-6 py-4 sm:items-center">
        <nav aria-label={block.label} className="min-w-0">
          <div
            className="hidden flex-wrap items-center gap-4 sm:flex"
            data-site-header-nav="desktop"
          >
            <SitePlacementList placements={block.placements} />
          </div>
          <div className="flex min-w-0 items-center gap-2 sm:hidden" data-site-header-nav="mobile">
            {primary ? (
              <div className="min-w-0 truncate" data-site-header-mobile-primary>
                <SitePlacementRenderer placement={primary} />
              </div>
            ) : null}
            {overflow.length > 0 ? (
              <details className="group relative shrink-0" data-site-header-mobile-menu>
                <summary
                  aria-label={`${block.label} menu`}
                  className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 [&::-webkit-details-marker]:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
                >
                  <span>Menu</span>
                </summary>
                <div className="absolute left-0 z-10 mt-2 grid min-w-36 gap-2 rounded-md border border-zinc-200 bg-white p-3 text-zinc-900 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                  <SitePlacementList placements={overflow} />
                </div>
              </details>
            ) : null}
          </div>
        </nav>
        <SiteThemeToggle />
      </div>
    </header>
  );
}

function SiteThemeToggle() {
  const { theme, toggleTheme } = useSiteTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      className="flex h-8 shrink-0 items-center justify-center rounded-md px-2.5 text-sm font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
      data-site-theme-toggle
      onClick={toggleTheme}
      title={`Switch to ${nextTheme} mode`}
      type="button"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

function FooterGroup({ block }: { block: SiteBlockNode }) {
  const { notes, sections } = partitionFooterPlacements(block.placements);

  return (
    <footer
      className="border-t border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
      data-site-footer
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
        {sections.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {sections.map((placement) => (
              <SitePlacementRenderer key={placement.id} placement={placement} />
            ))}
          </div>
        ) : null}
        {notes.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            {notes.map((placement) => (
              <FooterNote key={placement.id} placement={placement} />
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}

function FooterNote({ placement }: { placement: SitePlacementNode }) {
  const block = placement.block;

  if (block.type === "group" && block.placements.length === 0) {
    const text = block.body ?? displayLabel(block, placement);

    return text ? (
      <PlainText text={text} className="text-sm text-zinc-500 dark:text-zinc-400" />
    ) : null;
  }

  return <SitePlacementRenderer placement={placement} />;
}

function partitionFooterPlacements(placements: SitePlacementNode[]): {
  notes: SitePlacementNode[];
  sections: SitePlacementNode[];
} {
  const sections: SitePlacementNode[] = [];
  const notes: SitePlacementNode[] = [];

  for (const placement of placements) {
    if (isFooterSectionPlacement(placement)) {
      sections.push(placement);
    } else {
      notes.push(placement);
    }
  }

  return { notes, sections };
}

function isFooterSectionPlacement(placement: SitePlacementNode): boolean {
  return placement.block.type === "group" && placement.block.placements.length > 0;
}

function FooterSection({ block }: { block: SiteBlockNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-normal text-zinc-500 dark:text-zinc-400">
        {block.label}
      </h3>
      <nav aria-label={block.label} className="flex flex-col items-start gap-2">
        <SitePlacementList placements={block.placements} />
      </nav>
    </section>
  );
}

function HeroBlock({ block }: { block: SiteBlockNode }) {
  const media = mediaPlacements(block);
  const claimed = placementIdSet(media);

  return (
    <section className="grid items-center gap-8 py-4 md:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-5">
        <h1 className="text-5xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h1>
        {block.body ? (
          <PlainText text={block.body} className="text-base text-zinc-600 dark:text-zinc-300" />
        ) : null}
      </div>
      {media.length > 0 ? (
        <div className="grid gap-4">
          {media.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
        </div>
      ) : null}
      {renderUnclaimedPlacements(block, claimed)}
    </section>
  );
}

function MarkdownBlock({ block }: { block: SiteBlockNode }) {
  return (
    <section className="max-w-3xl space-y-3">
      {block.label && block.label !== "Body" ? (
        <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{block.label}</h2>
      ) : null}
      {block.body ? (
        <PlainText
          text={block.body}
          className="text-base leading-7 text-zinc-700 dark:text-zinc-300"
        />
      ) : null}
      {renderUnclaimedPlacements(block)}
    </section>
  );
}

function LinkBlock({ block, placement }: { block: SiteBlockNode; placement?: SitePlacementNode }) {
  const linkMode = useSitePageLinkMode();
  const href = blockHref(block, linkMode);

  if (!href) {
    return null;
  }

  return (
    <a
      className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap text-sm font-medium text-current underline decoration-transparent underline-offset-4 transition hover:decoration-current"
      href={href}
      rel={isExternalSiteHref(href) ? "noreferrer" : undefined}
      target={isExternalSiteHref(href) ? "_blank" : undefined}
    >
      {block.icon ? (
        <>
          <SvgIcon className="size-4" source={block.icon} />
          <span className="min-w-0 truncate">{displayLabel(block, placement)}</span>
        </>
      ) : (
        displayLabel(block, placement)
      )}
    </a>
  );
}

function ContentSummary({ block }: { block: SiteBlockNode }) {
  const linkMode = useSitePageLinkMode();
  const href = blockHref(block, linkMode);
  const title = (
    <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
      {href ? (
        <a
          className="underline decoration-transparent underline-offset-4 hover:decoration-current"
          href={href}
        >
          {block.label}
        </a>
      ) : (
        block.label
      )}
    </h3>
  );

  return (
    <article
      className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      data-block-type={block.type}
    >
      <div className="space-y-2">
        {title}
        {block.body ? (
          <PlainText text={block.body} className="text-sm text-zinc-600 dark:text-zinc-300" />
        ) : null}
      </div>
    </article>
  );
}

function ImageBlock({ block }: { block: SiteBlockNode }) {
  const aspectRatio = block.width && block.height ? `${block.width} / ${block.height}` : "4 / 3";

  return (
    <figure className="overflow-hidden rounded-md border border-zinc-200 bg-teal-50 dark:border-zinc-800 dark:bg-teal-950/40">
      {block.href ? (
        <img
          alt={block.label}
          className="h-full w-full object-cover"
          height={block.height}
          src={block.href}
          style={{ aspectRatio }}
          width={block.width}
        />
      ) : (
        <div
          aria-label={block.label}
          className="flex min-h-64 items-center justify-center bg-teal-100 p-6 text-center text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
          style={{ aspectRatio }}
        >
          <span>{block.label}</span>
        </div>
      )}
      <figcaption className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
        {block.label}
      </figcaption>
    </figure>
  );
}

function PagePlacementFlow({ page }: { page: SiteBlockNode }) {
  const bodyPlacements = page.placements.filter((placement) => !isPageChromePlacement(placement));

  return (
    <PageMain>
      {bodyPlacements.length === 0 ? (
        <PageIntro block={page} />
      ) : (
        bodyPlacements.map((placement) => (
          <SitePlacementRenderer key={placement.id} placement={placement} />
        ))
      )}
    </PageMain>
  );
}

function PageMain({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10">{children}</main>;
}

function SitePlacementList({ placements }: { placements: SitePlacementNode[] }) {
  return (
    <>
      {placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </>
  );
}

function renderUnclaimedPlacements(
  block: SiteBlockNode,
  claimed: Set<string> = new Set(),
): ReactNode {
  return block.placements
    .filter((placement) => !claimed.has(placement.id))
    .map((placement) => <SitePlacementRenderer key={placement.id} placement={placement} />);
}

function mediaPlacements(block: SiteBlockNode): SitePlacementNode[] {
  return block.placements.filter((placement) => placement.block.type === "image");
}

function placementIdSet(placements: SitePlacementNode[]): Set<string> {
  return new Set(placements.map((placement) => placement.id));
}

function partitionHeaderPlacements(placements: SitePlacementNode[]): {
  overflow: SitePlacementNode[];
  primary: SitePlacementNode | null;
} {
  return {
    primary: placements[0] ?? null,
    overflow: placements.slice(1),
  };
}

function isPageChromePlacement(placement: SitePlacementNode): boolean {
  return isPageHeaderPlacement(placement) || isPageFooterPlacement(placement);
}

function isPageHeaderPlacement(placement: SitePlacementNode): boolean {
  return placement.block.type === "header" || placement.block.templateKey === "header";
}

function isPageFooterPlacement(placement: SitePlacementNode): boolean {
  return placement.block.type === "footer" || placement.block.templateKey === "footer";
}

function PlainText({ className, text }: { className?: string; text: string }) {
  return (
    <div className={className}>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function useSitePageLinkMode(): SitePageLinkMode {
  return useContext(SitePageLinkModeContext);
}

function useSiteTheme(): PublicSiteThemeController {
  return useContext(SiteThemeContext);
}

function usePublicSiteTheme(): PublicSiteThemeController {
  const [theme, setTheme] = useState<PublicSiteTheme>("light");

  useEffect(() => {
    setTheme(resolveBrowserSiteTheme());
  }, []);

  return {
    theme,
    toggleTheme: () => {
      setTheme((current) => {
        const next = current === "dark" ? "light" : "dark";
        persistBrowserSiteTheme(next);
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
    const stored = window.localStorage.getItem(SITE_THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  } catch {
    return null;
  }
}

function persistBrowserSiteTheme(theme: PublicSiteTheme) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SITE_THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in locked-down browsers; the in-memory theme still works.
  }
}

function blockHref(block: SiteBlockNode, linkMode: SitePageLinkMode): string | undefined {
  if (block.href) {
    return profileAwareSiteHref(block.href, linkMode);
  }

  return undefined;
}

function displayLabel(block: SiteBlockNode, placement?: SitePlacementNode): string {
  return placement?.label ?? block.label;
}
