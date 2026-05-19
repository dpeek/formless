import type { ComponentType } from "react";

import { displayLabel, PlainText } from "./display.tsx";
import { SiteFooterSocialLink } from "./link-rendering.tsx";
import { FooterNavigationContext, HeaderNavigationContext, useSiteTheme } from "./page.tsx";
import type { SiteBlockNode, SitePlacementNode } from "../../shared/protocol.ts";

type SitePlacementRendererComponent = ComponentType<{ placement: SitePlacementNode }>;

export function SiteHeader({
  block,
  Placement,
}: {
  block: SiteBlockNode;
  Placement: SitePlacementRendererComponent;
}) {
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
              <SitePlacementList Placement={Placement} placements={primary} />
            </div>
            <div
              className="flex min-w-0 items-center gap-2 sm:hidden"
              data-site-header-mobile-primary
            >
              <SitePlacementList Placement={Placement} placements={primary} />
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
                <SitePlacementList Placement={Placement} placements={secondary} />
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
                  <SitePlacementList Placement={Placement} placements={secondary} />
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

export function SiteHeaderNavGroup({
  block,
  Placement,
}: {
  block: SiteBlockNode;
  Placement: SitePlacementRendererComponent;
}) {
  return <SitePlacementList Placement={Placement} placements={block.placements} />;
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

export function SiteFooter({
  block,
  Placement,
}: {
  block: SiteBlockNode;
  Placement: SitePlacementRendererComponent;
}) {
  const { notes, sections } = partitionFooterPlacements(block.placements);

  return (
    <footer className="border-t border-dashed" data-site-footer>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-18">
        {sections.length > 0 ? (
          <div className="flex max-w-lg flex-wrap justify-between gap-x-14 gap-y-8 text-sm">
            {sections.map((placement) => (
              <Placement key={placement.id} placement={placement} />
            ))}
          </div>
        ) : null}
        {notes.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {notes.map((placement) => (
              <FooterNote key={placement.id} Placement={Placement} placement={placement} />
            ))}
          </div>
        ) : null}
      </div>
    </footer>
  );
}

function FooterNote({
  placement,
  Placement,
}: {
  placement: SitePlacementNode;
  Placement: SitePlacementRendererComponent;
}) {
  const block = placement.block;

  if (block.type === "group" && block.placements.length === 0) {
    const text = block.body ?? displayLabel(block, placement);

    return text ? (
      <PlainText text={text} className="text-sm text-zinc-700 dark:text-zinc-300" />
    ) : null;
  }

  return <Placement placement={placement} />;
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

export function SiteFooterSection({
  block,
  Placement,
}: {
  block: SiteBlockNode;
  Placement: SitePlacementRendererComponent;
}) {
  return (
    <section className="w-full max-w-48 space-y-3 sm:w-48">
      <nav aria-label={block.label} className="flex flex-col items-start gap-2">
        <FooterNavigationContext.Provider value={true}>
          <SitePlacementList Placement={Placement} placements={block.placements} />
        </FooterNavigationContext.Provider>
      </nav>
    </section>
  );
}

export function SiteFooterSocialSection({ block }: { block: SiteBlockNode }) {
  return (
    <section className="w-full max-w-48 space-y-3 sm:w-48">
      <nav aria-label={block.label} className="flex flex-wrap items-center gap-2">
        {block.placements.map((placement) => (
          <SiteFooterSocialLink key={placement.id} placement={placement} />
        ))}
      </nav>
    </section>
  );
}

function SitePlacementList({
  placements,
  Placement,
}: {
  placements: SitePlacementNode[];
  Placement: SitePlacementRendererComponent;
}) {
  return (
    <>
      {placements.map((placement) => (
        <Placement key={placement.id} placement={placement} />
      ))}
    </>
  );
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
