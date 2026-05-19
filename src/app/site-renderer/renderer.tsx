import { useEffect, useState, type ReactNode } from "react";
import { MarkdownRenderer } from "@dpeek/formless-ui/markdown-renderer";
import { SvgIcon } from "@dpeek/formless-ui/svg-icon";
import {
  isExternalSiteHref,
  profileAwareSiteHref,
  siteHrefMatchesRoute,
  type SitePageLinkMode,
} from "./links.ts";
import {
  FooterNavigationContext,
  HeaderNavigationContext,
  PagePlacementFlow,
  SitePageShell,
  useFooterNavigation,
  useHeaderNavigation,
  useSitePageLinkMode,
  useSiteRouteSlug,
  useSiteTheme,
  type PublicSiteTheme,
  type PublicSiteThemeController,
} from "./page.tsx";
import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../../shared/protocol.ts";

export const PUBLIC_SITE_THEME_STORAGE_KEY = "formless:public-site:theme";
const PRIMARY_IMAGE_SLOT = "primaryImage";
const FEATURE_MEDIA_SLOT = "media";
const FEATURE_ACTIONS_SLOT = "actions";

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

const sitePageRendererParts = {
  Footer: FooterGroup,
  Header: HeaderGroup,
  Placement: SitePlacementRenderer,
  PrimaryImage,
};

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
    case "headerPrimary":
    case "headerSecondary":
      return <HeaderNavGroup block={block} />;
    case "footer":
      return <FooterGroup block={block} />;
    case "footerSection":
      return <FooterSection block={block} />;
    case "footerSocial":
      return <FooterSocialSection block={block} />;
    case "group":
      return <GroupBlock block={block} placement={placement} />;
    case "hero":
      return <HeroBlock block={block} />;
    case "feature":
      return <FeatureBlock block={block} />;
    case "markdown":
      return <MarkdownBlock block={block} />;
    case "link":
      return <LinkBlock block={block} placement={placement} />;
    case "image":
      return <ImageBlock block={block} />;
    case "postList":
    case "projectList":
      return <ContentListBlock block={block} />;
    case "post":
    case "project":
    case "profile":
      return <ContentSummary block={block} />;
    default:
      return null;
  }
}

function PageBlock({ block }: { block: SiteBlockNode }) {
  return <PagePlacementFlow page={block} Placement={SitePlacementRenderer} />;
}

function GroupBlock({ block, placement }: { block: SiteBlockNode; placement?: SitePlacementNode }) {
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
  const { primary, secondary } = partitionHeaderPlacements(block.placements);

  return (
    <header className="text-zinc-900 dark:text-zinc-100" data-site-header>
      <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-6 py-8 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
        <HeaderNavigationContext.Provider value={true}>
          <nav
            aria-label={`${block.label} primary`}
            className="min-w-0 justify-self-start"
            data-site-header-primary
          >
            <div
              className="hidden flex-wrap items-center gap-4 text-lg sm:flex"
              data-site-header-nav="desktop"
            >
              <SitePlacementList placements={primary} />
            </div>
            <div
              className="flex min-w-0 items-center gap-2 sm:hidden"
              data-site-header-mobile-primary
            >
              <SitePlacementList placements={primary} />
            </div>
          </nav>
          {secondary.length > 0 ? (
            <nav
              aria-label={`${block.label} secondary`}
              className="hidden min-w-0 justify-self-center sm:block"
              data-site-header-secondary
            >
              <div
                className="flex flex-wrap items-center justify-center gap-4 text-lg"
                data-site-header-nav="secondary"
              >
                <SitePlacementList placements={secondary} />
              </div>
            </nav>
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="flex items-center justify-end gap-2 justify-self-end">
            {secondary.length > 0 ? (
              <details className="group relative shrink-0 sm:hidden" data-site-header-mobile-menu>
                <summary
                  aria-label={`${block.label} menu`}
                  className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-sm font-medium text-zinc-700 outline-none transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-zinc-400 [&::-webkit-details-marker]:hidden dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
                >
                  <span>Menu</span>
                </summary>
                <div className="absolute right-0 z-10 mt-2 grid min-w-36 gap-2 rounded-md border border-zinc-200 bg-white p-3 text-zinc-900 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                  <SitePlacementList placements={secondary} />
                </div>
              </details>
            ) : null}
            <SiteThemeToggle />
          </div>
        </HeaderNavigationContext.Provider>
      </div>
    </header>
  );
}

function HeaderNavGroup({ block }: { block: SiteBlockNode }) {
  return <SitePlacementList placements={block.placements} />;
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
    <footer className="border-t border-dashed" data-site-footer>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-18">
        {sections.length > 0 ? (
          <div className="flex max-w-lg flex-wrap justify-between gap-x-14 gap-y-8 text-sm">
            {sections.map((placement) => (
              <SitePlacementRenderer key={placement.id} placement={placement} />
            ))}
          </div>
        ) : null}
        {notes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
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
      <PlainText text={text} className="text-sm text-zinc-700 dark:text-zinc-300" />
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
  return placement.block.type === "footerSection" || placement.block.type === "footerSocial";
}

function FooterSection({ block }: { block: SiteBlockNode }) {
  return (
    <section className="w-full max-w-48 space-y-3 sm:w-48">
      <nav aria-label={block.label} className="flex flex-col items-start gap-2">
        <FooterNavigationContext.Provider value={true}>
          <SitePlacementList placements={block.placements} />
        </FooterNavigationContext.Provider>
      </nav>
    </section>
  );
}

function FooterSocialSection({ block }: { block: SiteBlockNode }) {
  return (
    <section className="w-full max-w-48 space-y-3 sm:w-48">
      <nav aria-label={block.label} className="flex flex-wrap items-center gap-2">
        {block.placements.map((placement) => (
          <FooterSocialLink key={placement.id} placement={placement} />
        ))}
      </nav>
    </section>
  );
}

function FooterSocialLink({ placement }: { placement: SitePlacementNode }) {
  const linkMode = useSitePageLinkMode();
  const block = placement.block;
  const href = blockHref(block, linkMode);

  if (!href) {
    return null;
  }

  const label = displayLabel(block, placement);

  return (
    <a
      aria-label={label}
      className="inline-flex size-8 items-center justify-center text-current transition hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
      href={href}
      rel={isExternalSiteHref(href) ? "noreferrer" : undefined}
      target={isExternalSiteHref(href) ? "_blank" : undefined}
      title={label}
    >
      {block.icon ? (
        <SvgIcon className="size-6" source={block.icon} />
      ) : (
        <span className="text-sm font-medium">{label}</span>
      )}
    </a>
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

function FeatureBlock({ block }: { block: SiteBlockNode }) {
  const media = slottedPlacements(block, FEATURE_MEDIA_SLOT, "image");
  const actions = slottedPlacements(block, FEATURE_ACTIONS_SLOT, "link");
  const defaultPlacements = block.placements.filter(isDefaultPlacement);
  const mediaSide = featureMediaSide(block);
  const mediaNode =
    media.length > 0 ? (
      <div className="grid gap-4" data-site-feature-media>
        {media.map((placement) => (
          <SitePlacementRenderer key={placement.id} placement={placement} />
        ))}
      </div>
    ) : null;
  const contentNode = (
    <div className="space-y-4">
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-normal text-zinc-950 dark:text-zinc-50">
          {block.label}
        </h2>
        {block.body ? (
          <MarkdownRenderer
            className="text-base leading-7 text-zinc-700 dark:text-zinc-300"
            content={block.body}
            minHeadingLevel={3}
          />
        ) : null}
      </div>
      {actions.length > 0 ? (
        <nav
          aria-label={`${block.label} actions`}
          className="flex flex-col gap-3"
          data-site-feature-actions
        >
          <SitePlacementList placements={actions} />
        </nav>
      ) : null}
    </div>
  );

  return (
    <section
      className="space-y-5"
      data-block-type={block.type}
      data-site-feature-alignment={mediaSide}
    >
      {mediaNode ? (
        <div
          className={
            mediaSide === "left"
              ? "grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-center"
              : "grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-center"
          }
        >
          {mediaSide === "left" ? (
            <>
              {mediaNode}
              {contentNode}
            </>
          ) : (
            <>
              {contentNode}
              {mediaNode}
            </>
          )}
        </div>
      ) : (
        <div className="max-w-3xl">{contentNode}</div>
      )}
      {defaultPlacements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
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
        <MarkdownRenderer
          className="text-base leading-7 text-zinc-700 dark:text-zinc-300"
          content={block.body}
          minHeadingLevel={2}
        />
      ) : null}
      {renderUnclaimedPlacements(block)}
    </section>
  );
}

function LinkBlock({ block, placement }: { block: SiteBlockNode; placement?: SitePlacementNode }) {
  const linkMode = useSitePageLinkMode();
  const routeSlug = useSiteRouteSlug();
  const isHeaderNavigation = useHeaderNavigation();
  const isFooterNavigation = useFooterNavigation();
  const href = blockHref(block, linkMode);

  if (!href) {
    return null;
  }

  const isActive = isHeaderNavigation && siteHrefMatchesRoute(href, routeSlug);
  const shouldRenderIcon = Boolean(block.icon && !isHeaderNavigation);

  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={linkClassName(isActive, isFooterNavigation)}
      data-site-nav-active={isActive ? "true" : undefined}
      href={href}
      rel={isExternalSiteHref(href) ? "noreferrer" : undefined}
      target={isExternalSiteHref(href) ? "_blank" : undefined}
    >
      {shouldRenderIcon ? (
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

function linkClassName(isActive: boolean, isFooterNavigation: boolean): string {
  const iconGap = isFooterNavigation ? "gap-2.5" : "gap-1.5";
  const base = `inline-flex max-w-full items-center ${iconGap} whitespace-nowrap font-medium text-current underline underline-offset-4 transition`;

  return isActive
    ? `${base} decoration-current decoration-dashed hover:decoration-solid`
    : `${base} decoration-transparent hover:decoration-current`;
}

function ContentListBlock({ block }: { block: SiteBlockNode }) {
  const items = block.query?.items ?? [];

  return (
    <section className="space-y-4" data-site-content-list={block.type}>
      {block.label ? (
        <h2 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{block.label}</h2>
      ) : null}
      {items.length > 0 ? (
        <div className="flex-col flex gap-4">
          {items.map((item) => (
            <ContentSummary key={item.id} block={item} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No published {block.type === "projectList" ? "projects" : "posts"} yet.
        </p>
      )}
    </section>
  );
}

function ContentSummary({ block }: { block: SiteBlockNode }) {
  const linkMode = useSitePageLinkMode();
  const href = blockHref(block, linkMode);
  const primaryImage = primaryImagePlacement(block);
  const shouldRenderDate = Boolean(block.date && block.type !== "project");

  return (
    <article
      className="group relative rounded-md border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      data-block-type={block.type}
    >
      {href ? (
        <a
          aria-label={block.label}
          className="absolute inset-0 z-10 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600"
          data-site-summary-link={block.type}
          href={href}
          rel={isExternalSiteHref(href) ? "noreferrer" : undefined}
          target={isExternalSiteHref(href) ? "_blank" : undefined}
        >
          <span className="sr-only">{block.label}</span>
        </a>
      ) : null}
      <div
        className={
          primaryImage
            ? "pointer-events-none relative z-20 grid gap-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-start md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
            : "pointer-events-none relative z-20 space-y-3"
        }
        data-site-summary-layout={primaryImage ? "media-start" : "text-only"}
      >
        {primaryImage ? (
          <div className="w-full max-w-md sm:max-w-none" data-site-summary-media>
            <PrimaryImage placement={primaryImage} variant="summary" />
          </div>
        ) : null}
        <div className="space-y-3" data-site-summary-content>
          {shouldRenderDate ? (
            <time
              className="block text-xs font-medium text-zinc-500 dark:text-zinc-400"
              dateTime={block.date}
            >
              {block.date}
            </time>
          ) : null}
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            <span
              className={
                href
                  ? "underline decoration-transparent underline-offset-4 group-hover:decoration-current"
                  : undefined
              }
            >
              {block.label}
            </span>
          </h3>
          <ContentSummaryBody block={block} />
        </div>
      </div>
    </article>
  );
}

function PrimaryImage({
  placement,
  variant,
}: {
  placement: SitePlacementNode;
  variant: "post-detail" | "summary";
}) {
  const block = placement.block;

  if (block.type !== "image") {
    return null;
  }

  const aspectRatio = block.width && block.height ? `${block.width} / ${block.height}` : "4 / 3";
  const imageClassName =
    variant === "summary"
      ? "block h-auto max-h-64 w-full object-contain sm:max-h-52"
      : "h-full w-full object-cover";
  const placeholderClassName =
    variant === "summary"
      ? "flex min-h-32 items-center justify-center bg-teal-100 p-4 text-center text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100"
      : "flex min-h-48 items-center justify-center bg-teal-100 p-6 text-center text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-100";

  return (
    <figure
      className="overflow-hidden rounded-md border border-zinc-200 bg-teal-50 dark:border-zinc-800 dark:bg-teal-950/40"
      data-site-primary-image={variant}
    >
      {block.href ? (
        <img
          alt={block.label}
          className={imageClassName}
          height={block.height}
          src={block.href}
          style={{ aspectRatio }}
          width={block.width}
        />
      ) : (
        <div aria-label={block.label} className={placeholderClassName} style={{ aspectRatio }}>
          <span>{block.label}</span>
        </div>
      )}
    </figure>
  );
}

function ContentSummaryBody({ block }: { block: SiteBlockNode }) {
  if (!block.body) {
    return null;
  }

  if (block.type === "project") {
    return (
      <MarkdownRenderer
        className="text-sm text-zinc-600 dark:text-zinc-300 [&_a]:pointer-events-auto [&_a]:relative [&_a]:z-30"
        content={block.body}
        minHeadingLevel={4}
      />
    );
  }

  return <PlainText text={block.body} className="text-sm text-zinc-600 dark:text-zinc-300" />;
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

function slottedPlacements(block: SiteBlockNode, slot: string, type: string): SitePlacementNode[] {
  return block.placements.filter(
    (placement) => placement.slot === slot && placement.block.type === type,
  );
}

function placementIdSet(placements: SitePlacementNode[]): Set<string> {
  return new Set(placements.map((placement) => placement.id));
}

function primaryImagePlacement(block: SiteBlockNode): SitePlacementNode | undefined {
  return block.placements.find(
    (placement) => placement.slot === PRIMARY_IMAGE_SLOT && placement.block.type === "image",
  );
}

function isDefaultPlacement(placement: SitePlacementNode): boolean {
  return !placement.slot;
}

function featureMediaSide(block: SiteBlockNode): "left" | "right" {
  return block.alignment === "right" ? "right" : "left";
}

function partitionHeaderPlacements(placements: SitePlacementNode[]): {
  primary: SitePlacementNode[];
  secondary: SitePlacementNode[];
} {
  const primaryGroup = placements.find((placement) => placement.block.type === "headerPrimary");
  const secondaryGroup = placements.find((placement) => placement.block.type === "headerSecondary");

  if (primaryGroup || secondaryGroup) {
    const directPlacements = placements.filter(
      (placement) =>
        placement.block.type !== "headerPrimary" && placement.block.type !== "headerSecondary",
    );

    return {
      primary: primaryGroup?.block.placements ?? directPlacements.slice(0, 1),
      secondary: [
        ...(secondaryGroup?.block.placements ?? []),
        ...(primaryGroup ? directPlacements : directPlacements.slice(1)),
      ],
    };
  }

  return {
    primary: placements.slice(0, 1),
    secondary: placements.slice(1),
  };
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

function blockHref(block: SiteBlockNode, linkMode: SitePageLinkMode): string | undefined {
  if (block.href) {
    return profileAwareSiteHref(block.href, linkMode);
  }

  return undefined;
}

function displayLabel(block: SiteBlockNode, placement?: SitePlacementNode): string {
  return placement?.label ?? block.label;
}
