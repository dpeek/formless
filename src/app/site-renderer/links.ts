export type SitePageLinkMode = "preview" | "published";

export function sitePagePathForSlug(slug: string, linkMode: SitePageLinkMode): `/${string}` {
  const encodedSlug = encodeSiteSlugPath(slug) || "home";

  if (linkMode === "published") {
    return encodedSlug === "home" ? "/" : (`/${encodedSlug}` as const);
  }

  return `/pages/${encodedSlug}`;
}

export function profileAwareSiteHref(href: string, linkMode: SitePageLinkMode): string {
  if (linkMode !== "published" || isExternalSiteHref(href)) {
    return href;
  }

  const { path, suffix } = splitHrefSuffix(href);

  if (path === "/pages" || path === "/pages/") {
    return `/${suffix}`;
  }

  if (path.startsWith("/pages/")) {
    return `${sitePagePathForSlug(path.slice("/pages/".length), linkMode)}${suffix}`;
  }

  return href;
}

export function isExternalSiteHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}

function splitHrefSuffix(href: string): { path: string; suffix: string } {
  const suffixStart = href.search(/[?#]/);

  if (suffixStart === -1) {
    return { path: href, suffix: "" };
  }

  return {
    path: href.slice(0, suffixStart),
    suffix: href.slice(suffixStart),
  };
}

function encodeSiteSlugPath(slug: string): string {
  return slug
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
