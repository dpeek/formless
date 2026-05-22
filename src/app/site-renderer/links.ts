export type SitePageLinkMode = "preview" | "authoring" | "published" | "installed";

export function sitePagePathForSlug(
  slug: string,
  linkMode: SitePageLinkMode,
  routeBase?: `/${string}`,
): `/${string}` {
  const encodedSlug = encodeSiteSlugPath(slug) || "home";

  if (linkMode === "installed") {
    const base = normalizeRouteBase(routeBase);

    return encodedSlug === "home" ? base : joinRouteBase(base, encodedSlug);
  }

  if (usesTopLevelSitePaths(linkMode)) {
    return encodedSlug === "home" ? "/" : (`/${encodedSlug}` as const);
  }

  return `/pages/${encodedSlug}`;
}

export function profileAwareSiteHref(
  href: string,
  linkMode: SitePageLinkMode,
  routeBase?: `/${string}`,
): string {
  if (isExternalSiteHref(href)) {
    return href;
  }

  const { path, suffix } = splitHrefSuffix(href);

  if (linkMode === "installed") {
    if (path === "/pages" || path === "/pages/" || path === "/") {
      return `${sitePagePathForSlug("home", linkMode, routeBase)}${suffix}`;
    }

    if (path.startsWith("/pages/")) {
      return `${sitePagePathForSlug(path.slice("/pages/".length), linkMode, routeBase)}${suffix}`;
    }

    if (path.startsWith("/") && !path.startsWith("//")) {
      return `${sitePagePathForSlug(path.slice(1), linkMode, routeBase)}${suffix}`;
    }

    return href;
  }

  if (!usesTopLevelSitePaths(linkMode)) {
    if (path === "/pages" || path === "/pages/") {
      return `${sitePagePathForSlug("home", linkMode)}${suffix}`;
    }

    if (path.startsWith("/pages/")) {
      return href;
    }

    if (path === "/") {
      return `${sitePagePathForSlug("home", linkMode)}${suffix}`;
    }

    if (path.startsWith("/") && !path.startsWith("//")) {
      return `${sitePagePathForSlug(path.slice(1), linkMode)}${suffix}`;
    }

    return href;
  }

  if (path === "/pages" || path === "/pages/") {
    return `/${suffix}`;
  }

  if (path.startsWith("/pages/")) {
    return `${sitePagePathForSlug(path.slice("/pages/".length), linkMode)}${suffix}`;
  }

  return href;
}

function usesTopLevelSitePaths(linkMode: SitePageLinkMode): boolean {
  return linkMode === "authoring" || linkMode === "published";
}

export function siteHrefMatchesRoute(
  href: string,
  currentSlug: string | undefined,
  routeBase?: `/${string}`,
): boolean {
  const linkSlug = routeSlugForSiteHref(href, routeBase);

  if (!linkSlug || !currentSlug) {
    return false;
  }

  const routeSlug = normalizeSiteSlug(currentSlug);

  if (linkSlug === "home") {
    return routeSlug === "home";
  }

  return routeSlug === linkSlug || routeSlug.startsWith(`${linkSlug}/`);
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

function routeSlugForSiteHref(href: string, routeBase?: `/${string}`): string | null {
  if (isExternalSiteHref(href)) {
    return null;
  }

  const { path } = splitHrefSuffix(href);
  const base = routeBase ? normalizeRouteBase(routeBase) : undefined;

  if (base && path === base) {
    return "home";
  }

  if (base && path.startsWith(`${base}/`)) {
    return normalizeSiteSlug(path.slice(base.length));
  }

  if (path === "/" || path === "/pages" || path === "/pages/") {
    return "home";
  }

  if (path.startsWith("/pages/")) {
    return normalizeSiteSlug(path.slice("/pages/".length));
  }

  if (path.startsWith("/") && !path.startsWith("//")) {
    return normalizeSiteSlug(path.slice(1));
  }

  return null;
}

function normalizeSiteSlug(slug: string): string {
  const normalized = slug.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  return normalized === "" ? "home" : normalized;
}

function normalizeRouteBase(routeBase: `/${string}` | undefined): `/${string}` {
  const normalized = (routeBase ?? "/sites").replace(/\/+$/, "");

  return normalized === "" ? "/" : (normalized as `/${string}`);
}

function joinRouteBase(routeBase: `/${string}`, encodedSlug: string): `/${string}` {
  return routeBase === "/" ? `/${encodedSlug}` : (`${routeBase}/${encodedSlug}` as `/${string}`);
}

function encodeSiteSlugPath(slug: string): string {
  return slug
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
