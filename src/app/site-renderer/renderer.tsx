import { createContext, useContext, type ReactNode } from "react";
import {
  isExternalSiteHref,
  profileAwareSiteHref,
  sitePagePathForSlug,
  type SitePageLinkMode,
} from "./links.ts";
import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../../shared/protocol.ts";

const PAGE_SLOT_ORDER = ["header", "main", "footer"];

const SitePageLinkModeContext = createContext<SitePageLinkMode>("preview");

export function SitePageRenderer({
  linkMode = "preview",
  tree,
}: {
  linkMode?: SitePageLinkMode;
  tree: SitePageTree;
}) {
  const page = tree.page;
  const headerPlacements = placementsForSlot(page, "header");
  const mainPlacements = placementsForSlot(page, "main");
  const footerPlacements = placementsForSlot(page, "footer");

  return (
    <SitePageLinkModeContext.Provider value={linkMode}>
      <article className="min-h-dvh bg-white text-zinc-950">
        {headerPlacements.map((placement) => (
          <SitePlacementRenderer key={placement.id} placement={placement} />
        ))}

        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10">
          {mainPlacements.length === 0 ? <PageIntro block={page} /> : null}
          {mainPlacements.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
          {renderUnclaimedSlots(page, PAGE_SLOT_ORDER)}
        </main>

        {footerPlacements.map((placement) => (
          <SitePlacementRenderer key={placement.id} placement={placement} />
        ))}
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
    case "group":
      return <GroupBlock block={block} placement={placement} />;
    case "hero":
      return <HeroBlock block={block} />;
    case "markdown":
      return <MarkdownBlock block={block} />;
    case "link":
      return <LinkBlock block={block} placement={placement} />;
    case "contentList":
      return <ContentQueryBlock block={block} layout="list" />;
    case "contentGrid":
      return <ContentQueryBlock block={block} layout="grid" />;
    case "image":
      return <ImageBlock block={block} />;
    case "video":
      return <VideoBlock block={block} />;
    case "cta":
      return <CtaBlock block={block} />;
    case "post":
    case "project":
    case "profile":
      return <ContentSummary block={block} />;
    default:
      return null;
  }
}

function PageBlock({ block }: { block: SiteBlockNode }) {
  const mainPlacements = placementsForSlot(block, "main");

  return (
    <article className="space-y-8">
      {mainPlacements.length === 0 ? <PageIntro block={block} /> : null}
      {mainPlacements.map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
      {renderUnclaimedSlots(block, ["main"])}
    </article>
  );
}

function PageIntro({ block }: { block: SiteBlockNode }) {
  return (
    <header className="max-w-3xl space-y-4">
      <h1 className="text-4xl font-semibold tracking-normal text-zinc-950">{block.title}</h1>
      {block.subtitle ? <p className="text-xl text-zinc-700">{block.subtitle}</p> : null}
      {block.body ? <PlainText text={block.body} className="text-base text-zinc-600" /> : null}
    </header>
  );
}

function GroupBlock({ block, placement }: { block: SiteBlockNode; placement?: SitePlacementNode }) {
  if (block.templateKey === "header" || placement?.variant === "header") {
    return <HeaderGroup block={block} />;
  }

  if (block.templateKey === "footer-group") {
    return <FooterSection block={block} />;
  }

  if (block.templateKey === "footer" || placement?.variant === "footer") {
    return <FooterGroup block={block} />;
  }

  const slots = slotNames(block);

  return (
    <section className="space-y-4" data-block-type={block.type}>
      <h2 className="text-xl font-semibold">{block.label ?? block.title}</h2>
      {block.body ? <PlainText text={block.body} className="text-sm text-zinc-600" /> : null}
      {slots.map((slot) => (
        <SiteSlot key={slot} block={block} slot={slot} />
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
        <nav aria-label={block.label ?? block.title} className="flex flex-wrap items-center gap-4">
          <SiteSlot block={block} slot="header" />
        </nav>
      </div>
    </header>
  );
}

function FooterGroup({ block }: { block: SiteBlockNode }) {
  const footerSections = placementsForSlot(block, "footer");
  const otherSlots = slotNames(block).filter((slot) => slot !== "footer");

  return (
    <footer className="border-t border-zinc-200 bg-zinc-950 text-white">
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-[1fr_2fr]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{block.label ?? block.title}</h2>
          <p className="max-w-sm text-sm text-zinc-300">
            Schema-backed software for content-heavy products.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {footerSections.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
          {otherSlots.map((slot) => (
            <SiteSlot key={slot} block={block} slot={slot} />
          ))}
        </div>
      </div>
    </footer>
  );
}

function FooterSection({ block }: { block: SiteBlockNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-normal text-amber-200">
        {block.label ?? block.title}
      </h3>
      <nav aria-label={block.label ?? block.title} className="flex flex-col items-start gap-2">
        <SiteSlot block={block} slot="link" />
      </nav>
    </section>
  );
}

function HeroBlock({ block }: { block: SiteBlockNode }) {
  const media = placementsForSlot(block, "media");
  const otherSlots = slotNames(block).filter((slot) => slot !== "media");

  return (
    <section className="grid items-center gap-8 py-4 md:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-5">
        {block.label ? (
          <p className="text-sm font-medium uppercase tracking-normal text-teal-700">
            {block.label}
          </p>
        ) : null}
        <h1 className="text-5xl font-semibold tracking-normal text-zinc-950">{block.title}</h1>
        {block.subtitle ? <p className="text-xl text-zinc-700">{block.subtitle}</p> : null}
        {block.body ? <PlainText text={block.body} className="text-base text-zinc-600" /> : null}
      </div>
      {media.length > 0 ? (
        <div className="grid gap-4">
          {media.map((placement) => (
            <SitePlacementRenderer key={placement.id} placement={placement} />
          ))}
        </div>
      ) : null}
      {otherSlots.map((slot) => (
        <SiteSlot key={slot} block={block} slot={slot} />
      ))}
    </section>
  );
}

function MarkdownBlock({ block }: { block: SiteBlockNode }) {
  return (
    <section className="max-w-3xl space-y-3">
      {block.title && block.title !== "Body" ? (
        <h2 className="text-2xl font-semibold">{block.title}</h2>
      ) : null}
      {block.body ? (
        <PlainText text={block.body} className="text-base leading-7 text-zinc-700" />
      ) : null}
      {renderUnclaimedSlots(block, [])}
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
      {placement?.label ?? block.label ?? block.title}
    </a>
  );
}

function ContentQueryBlock({ block, layout }: { block: SiteBlockNode; layout: "grid" | "list" }) {
  const items = block.query?.items ?? [];
  const listClassName = layout === "grid" ? "grid gap-4 md:grid-cols-3" : "grid max-w-3xl gap-3";

  return (
    <section className="space-y-4" data-block-type={block.type}>
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">{block.title}</h2>
        {block.subtitle ? <p className="text-sm text-zinc-600">{block.subtitle}</p> : null}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">No published items.</p>
      ) : (
        <div className={listClassName}>
          {items.map((item) => (
            <ContentSummary key={item.id} block={item} />
          ))}
        </div>
      )}
      {renderUnclaimedSlots(block, [])}
    </section>
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
          {block.title}
        </a>
      ) : (
        block.title
      )}
    </h3>
  );

  return (
    <article
      className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
      data-block-type={block.type}
    >
      <div className="space-y-2">
        {block.label ? (
          <p className="text-xs font-medium uppercase tracking-normal text-teal-700">
            {block.label}
          </p>
        ) : null}
        {title}
        {block.subtitle ? <p className="text-sm text-zinc-600">{block.subtitle}</p> : null}
        {block.body ? <PlainText text={block.body} className="text-sm text-zinc-600" /> : null}
      </div>
    </article>
  );
}

function ImageBlock({ block }: { block: SiteBlockNode }) {
  const aspectRatio = block.width && block.height ? `${block.width} / ${block.height}` : "4 / 3";

  return (
    <figure
      className="overflow-hidden rounded-md border border-zinc-200 bg-teal-50"
      data-asset-key={block.assetKey}
    >
      {block.href ? (
        <img
          alt={block.alt ?? block.title}
          className="h-full w-full object-cover"
          height={block.height}
          src={block.href}
          style={{ aspectRatio }}
          width={block.width}
        />
      ) : (
        <div
          aria-label={block.alt ?? block.title}
          className="flex min-h-64 items-center justify-center bg-teal-100 p-6 text-center text-sm text-teal-900"
          style={{ aspectRatio }}
        >
          <span>{block.assetKey ?? block.title}</span>
        </div>
      )}
      <figcaption className="px-4 py-3 text-sm text-zinc-600">
        {block.label ?? block.title}
      </figcaption>
    </figure>
  );
}

function VideoBlock({ block }: { block: SiteBlockNode }) {
  const aspectRatio = block.width && block.height ? `${block.width} / ${block.height}` : "16 / 9";

  return (
    <figure
      className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-950 text-white"
      data-asset-key={block.assetKey}
    >
      {block.href ? (
        <video
          aria-label={block.alt ?? block.title}
          className="w-full bg-zinc-950"
          controls
          style={{ aspectRatio }}
        >
          <source src={block.href} />
        </video>
      ) : (
        <div
          aria-label={block.alt ?? block.title}
          className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-zinc-300"
          style={{ aspectRatio }}
        >
          <span>{block.assetKey ?? block.title}</span>
        </div>
      )}
      <figcaption className="px-4 py-3 text-sm text-zinc-300">
        {block.label ?? block.title}
      </figcaption>
    </figure>
  );
}

function CtaBlock({ block }: { block: SiteBlockNode }) {
  const linkMode = useSitePageLinkMode();
  const href = blockHref(block, linkMode);

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-zinc-200 bg-teal-50 p-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{block.title}</h2>
        {block.body ? <PlainText text={block.body} className="text-sm text-zinc-600" /> : null}
      </div>
      {href ? (
        <a className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white" href={href}>
          {block.label ?? "Open"}
        </a>
      ) : null}
      {renderUnclaimedSlots(block, [])}
    </section>
  );
}

function SiteSlot({ block, slot }: { block: SiteBlockNode; slot: string }) {
  return (
    <>
      {placementsForSlot(block, slot).map((placement) => (
        <SitePlacementRenderer key={placement.id} placement={placement} />
      ))}
    </>
  );
}

function renderUnclaimedSlots(block: SiteBlockNode, claimedSlots: string[]): ReactNode {
  const claimed = new Set(claimedSlots);

  return slotNames(block)
    .filter((slot) => !claimed.has(slot))
    .map((slot) => <SiteSlot key={slot} block={block} slot={slot} />);
}

function placementsForSlot(block: SiteBlockNode, slot: string): SitePlacementNode[] {
  return block.placements.filter((placement) => placement.slot === slot);
}

function slotNames(block: SiteBlockNode): string[] {
  return [...new Set(block.placements.map((placement) => placement.slot))];
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

  if (block.slug) {
    return sitePagePathForSlug(block.slug, linkMode);
  }

  return undefined;
}
