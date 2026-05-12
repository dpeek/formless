import { createContext, useContext, type ReactNode } from "react";
import {
  isExternalSiteHref,
  profileAwareSiteHref,
  sitePagePathForSlug,
  type SitePageLinkMode,
} from "./links.ts";
import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../../shared/protocol.ts";

const SitePageLinkModeContext = createContext<SitePageLinkMode>("preview");

export function SitePageRenderer({
  linkMode = "preview",
  tree,
}: {
  linkMode?: SitePageLinkMode;
  tree: SitePageTree;
}) {
  const page = tree.page;

  return (
    <SitePageLinkModeContext.Provider value={linkMode}>
      <article className="min-h-dvh bg-white text-zinc-950">
        <PagePlacementFlow page={page} />
      </article>
    </SitePageLinkModeContext.Provider>
  );
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
  return (
    <article className="space-y-8">
      {block.placements.length === 0 ? <PageIntro block={block} /> : null}
      {block.placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </article>
  );
}

function PageIntro({ block }: { block: SiteBlockNode }) {
  return (
    <header className="max-w-3xl space-y-4">
      <h1 className="text-4xl font-semibold tracking-normal text-zinc-950">{block.label}</h1>
      {block.body ? <PlainText text={block.body} className="text-base text-zinc-600" /> : null}
    </header>
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
      <h2 className="text-xl font-semibold">{displayLabel(block, placement)}</h2>
      {block.body ? <PlainText text={block.body} className="text-sm text-zinc-600" /> : null}
      {block.placements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </section>
  );
}

function HeaderGroup({ block }: { block: SiteBlockNode }) {
  const linkMode = useSitePageLinkMode();

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <a
          className="text-sm font-semibold uppercase tracking-normal text-teal-700"
          href={sitePagePathForSlug("home", linkMode)}
        >
          Formless
        </a>
        <nav aria-label={block.label} className="flex flex-wrap items-center gap-4">
          <SitePlacementList placements={block.placements} />
        </nav>
      </div>
    </header>
  );
}

function FooterGroup({ block }: { block: SiteBlockNode }) {
  const footerSections = block.placements;
  const claimed = placementIdSet(footerSections);

  return (
    <footer className="border-t border-zinc-200 bg-zinc-950 text-white">
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{block.label}</h2>
          <p className="max-w-sm text-sm text-zinc-300">
            Schema-backed software for content-heavy products.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {footerSections.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
          {renderUnclaimedPlacements(block, claimed)}
        </div>
      </div>
    </footer>
  );
}

function FooterSection({ block }: { block: SiteBlockNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-normal text-amber-200">
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
        <h1 className="text-5xl font-semibold tracking-normal text-zinc-950">{block.label}</h1>
        {block.body ? <PlainText text={block.body} className="text-base text-zinc-600" /> : null}
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
        <h2 className="text-2xl font-semibold">{block.label}</h2>
      ) : null}
      {block.body ? (
        <PlainText text={block.body} className="text-base leading-7 text-zinc-700" />
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
      className="text-sm font-medium text-current underline decoration-transparent underline-offset-4 transition hover:decoration-current"
      href={href}
      rel={isExternalSiteHref(href) ? "noreferrer" : undefined}
      target={isExternalSiteHref(href) ? "_blank" : undefined}
    >
      {displayLabel(block, placement)}
    </a>
  );
}

function ContentSummary({ block }: { block: SiteBlockNode }) {
  const linkMode = useSitePageLinkMode();
  const href = blockHref(block, linkMode);
  const title = (
    <h3 className="text-lg font-semibold text-zinc-950">
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
      className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
      data-block-type={block.type}
    >
      <div className="space-y-2">
        {title}
        {block.body ? <PlainText text={block.body} className="text-sm text-zinc-600" /> : null}
      </div>
    </article>
  );
}

function ImageBlock({ block }: { block: SiteBlockNode }) {
  const aspectRatio = block.width && block.height ? `${block.width} / ${block.height}` : "4 / 3";

  return (
    <figure className="overflow-hidden rounded-md border border-zinc-200 bg-teal-50">
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
          className="flex min-h-64 items-center justify-center bg-teal-100 p-6 text-center text-sm text-teal-900"
          style={{ aspectRatio }}
        >
          <span>{block.label}</span>
        </div>
      )}
      <figcaption className="px-4 py-3 text-sm text-zinc-600">{block.label}</figcaption>
    </figure>
  );
}

function PagePlacementFlow({ page }: { page: SiteBlockNode }) {
  const nodes: ReactNode[] = [];
  let bodyRun: SitePlacementNode[] = [];
  let renderedBody = false;

  const flushBodyRun = () => {
    if (bodyRun.length === 0) {
      return;
    }

    const run = bodyRun;
    bodyRun = [];
    renderedBody = true;
    nodes.push(
      <PageMain key={`body-${nodes.length}`}>
        {run.map((placement) => (
          <SitePlacementRenderer key={placement.id} placement={placement} />
        ))}
      </PageMain>,
    );
  };

  for (const placement of page.placements) {
    if (isPageChromePlacement(placement)) {
      flushBodyRun();

      if (isPageFooterPlacement(placement) && !renderedBody) {
        renderedBody = true;
        nodes.push(
          <PageMain key="intro">
            <PageIntro block={page} />
          </PageMain>,
        );
      }

      nodes.push(<SitePlacementRenderer key={placement.id} placement={placement} />);
      continue;
    }

    bodyRun.push(placement);
  }

  flushBodyRun();

  if (!renderedBody) {
    nodes.push(
      <PageMain key="intro">
        <PageIntro block={page} />
      </PageMain>,
    );
  }

  return <>{nodes}</>;
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

function blockHref(block: SiteBlockNode, linkMode: SitePageLinkMode): string | undefined {
  if (block.href) {
    return profileAwareSiteHref(block.href, linkMode);
  }

  return undefined;
}

function displayLabel(block: SiteBlockNode, placement?: SitePlacementNode): string {
  return placement?.label ?? block.label;
}
