import type { SiteBlockNode, SitePageTree, SitePlacementNode } from "../shared/protocol.ts";
import { normalizeSiteRoutePath } from "./route-resolver.ts";

export type PublicDocumentMetadataKind = "error" | "not-found" | "success";

export type PublicDocumentMetadata = {
  canonicalUrl: string;
  description: string;
  ogType: "article" | "website";
  siteName: string;
  title: string;
  twitterCard: "summary";
};

export type PublicDocumentMetadataInput = {
  kind: PublicDocumentMetadataKind;
  requestUrl: URL;
  slug?: string;
  tree?: SitePageTree;
};

const DEFAULT_SITE_NAME = "Site";
const DEFAULT_DESCRIPTION = "A public site page.";
const DESCRIPTION_MAX_LENGTH = 160;

export function buildPublicDocumentMetadata(
  input: PublicDocumentMetadataInput,
): PublicDocumentMetadata {
  const routeSlug = metadataRouteSlug(input);
  const pageLabel = normalizedText(input.tree?.page.label);
  const siteName = resolveSiteName(input.tree, pageLabel);
  const title = documentTitle(input.kind, routeSlug, pageLabel, siteName);

  return {
    canonicalUrl: canonicalUrl(input.requestUrl, routeSlug),
    description: documentDescription(input.tree, siteName),
    ogType: input.tree?.route?.kind === "post" ? "article" : "website",
    siteName,
    title,
    twitterCard: "summary",
  };
}

function documentTitle(
  kind: PublicDocumentMetadataKind,
  routeSlug: string,
  pageLabel: string | undefined,
  siteName: string,
): string {
  switch (kind) {
    case "error":
      return `Site page failed to load | ${siteName}`;
    case "not-found":
      return `Page not found | ${siteName}`;
    case "success":
      return routeSlug === "home" ? siteName : `${pageLabel ?? siteName} | ${siteName}`;
  }
}

function documentDescription(tree: SitePageTree | undefined, siteName: string): string {
  const body = normalizedText(stripMarkdown(tree?.page.body ?? ""));

  return truncateDescription(body ?? defaultDescription(siteName));
}

function defaultDescription(siteName: string): string {
  return siteName === DEFAULT_SITE_NAME ? DEFAULT_DESCRIPTION : `A public page from ${siteName}.`;
}

function resolveSiteName(tree: SitePageTree | undefined, pageLabel: string | undefined): string {
  return siteNameFromHeader(tree?.frame.header) ?? pageLabel ?? DEFAULT_SITE_NAME;
}

function siteNameFromHeader(header: SiteBlockNode | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  return primaryHeaderPlacements(header)
    .filter((placement) => placement.block.type === "link")
    .map((placement) => normalizedText(placement.label ?? placement.block.label))
    .find((label) => label !== undefined);
}

function primaryHeaderPlacements(header: SiteBlockNode): SitePlacementNode[] {
  const primaryGroup = header.placements.find(
    (placement) => placement.block.type === "headerPrimary",
  );
  const secondaryGroup = header.placements.find(
    (placement) => placement.block.type === "headerSecondary",
  );

  if (primaryGroup || secondaryGroup) {
    const directPlacements = header.placements.filter(
      (placement) =>
        placement.block.type !== "headerPrimary" && placement.block.type !== "headerSecondary",
    );

    return primaryGroup?.block.placements ?? directPlacements.slice(0, 1);
  }

  return header.placements.slice(0, 1);
}

function metadataRouteSlug(input: PublicDocumentMetadataInput): string {
  return normalizeSiteRoutePath(
    input.tree?.route?.slug ?? input.tree?.meta.slug ?? input.slug ?? "home",
  );
}

function canonicalUrl(requestUrl: URL, routeSlug: string): string {
  const url = new URL(requestUrl.origin);
  const path =
    routeSlug === "home"
      ? "/"
      : `/${routeSlug
          .split("/")
          .filter((segment) => segment.length > 0)
          .map((segment) => encodeURIComponent(segment))
          .join("/")}`;

  url.pathname = path;
  return url.href;
}

function normalizedText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized ? normalized : undefined;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/([*_~]{1,3})([^*_~]+)\1/g, "$2")
    .replace(/[*_~]/g, "");
}

function truncateDescription(value: string): string {
  if (value.length <= DESCRIPTION_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, DESCRIPTION_MAX_LENGTH - 3).trimEnd()}...`;
}
