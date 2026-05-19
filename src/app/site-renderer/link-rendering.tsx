import { SvgIcon } from "@dpeek/formless-ui/svg-icon";

import { displayLabel } from "./display.tsx";
import {
  isExternalSiteHref,
  profileAwareSiteHref,
  siteHrefMatchesRoute,
  type SitePageLinkMode,
} from "./links.ts";
import {
  useFooterNavigation,
  useHeaderNavigation,
  useSitePageLinkMode,
  useSiteRouteSlug,
} from "./page.tsx";
import type { SiteBlockNode, SitePlacementNode } from "../../shared/protocol.ts";

export function SiteLinkBlock({
  block,
  placement,
}: {
  block: SiteBlockNode;
  placement?: SitePlacementNode;
}) {
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
      rel={siteLinkRel(href)}
      target={siteLinkTarget(href)}
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

export function SiteFooterSocialLink({ placement }: { placement: SitePlacementNode }) {
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
      rel={siteLinkRel(href)}
      target={siteLinkTarget(href)}
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

export function blockHref(block: SiteBlockNode, linkMode: SitePageLinkMode): string | undefined {
  if (block.href) {
    return profileAwareSiteHref(block.href, linkMode);
  }

  return undefined;
}

function linkClassName(isActive: boolean, isFooterNavigation: boolean): string {
  const iconGap = isFooterNavigation ? "gap-2.5" : "gap-1.5";
  const base = `inline-flex max-w-full items-center ${iconGap} whitespace-nowrap font-medium text-current underline underline-offset-4 transition`;

  return isActive
    ? `${base} decoration-current decoration-dashed hover:decoration-solid`
    : `${base} decoration-transparent hover:decoration-current`;
}

export function siteLinkRel(href: string): "noreferrer" | undefined {
  return isExternalSiteHref(href) ? "noreferrer" : undefined;
}

export function siteLinkTarget(href: string): "_blank" | undefined {
  return isExternalSiteHref(href) ? "_blank" : undefined;
}
