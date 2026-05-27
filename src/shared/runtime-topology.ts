import { schemaApps } from "./schema-apps.ts";

export const runtimeProfileKinds = [
  "instance",
  "dev",
  "app",
  "siteAuthoring",
  "publishedSite",
] as const;

export type RuntimeProfileKind = (typeof runtimeProfileKinds)[number];

export type RuntimeTopologyRoutePolicy = {
  instanceBrowserRoutes: boolean;
  installedAppApiRoutes: boolean;
  installedAppBrowserRoutes: boolean;
  installedSitePublicRoutes: boolean;
  ownerSessionBrowserRoutes: boolean;
  schemaKeyApiRoutes: boolean;
  schemaKeyBrowserRoutes: boolean;
};

export type RuntimeProfileKindResolverInput = {
  fallback?: RuntimeProfileKind | undefined;
  hostname?: string | undefined;
  profile?: string | undefined;
};

export const FORMLESS_RUNTIME_APP_INSTALL_ID_META_NAME = "formless-runtime-app-install-id";
export const FORMLESS_RUNTIME_PACKAGE_APP_KEY_META_NAME = "formless-runtime-package-app-key";
export const FORMLESS_RUNTIME_PROFILE_META_NAME = "formless-runtime-profile";

export const runtimeTopologyRoutes = {
  appRouteBase: "/apps",
  clientShellAssetPath: "/index.html",
  dynamicSiteIconPaths: ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"],
  instanceRootRoute: "/",
  loginRoute: "/login",
  publicSiteIndexingResourcePaths: ["/robots.txt", "/sitemap.xml"],
  publicSiteHomeSlug: "home",
  publicSitePackageAppKey: "site",
  publicSitePreviewRouteBase: "/pages",
  schemaRoute: "/schema",
  setupRoute: "/setup",
  siteAdminRoute: "/admin",
  siteRouteBase: "/sites",
  staticAssetPathPrefixes: ["/@fs/", "/@id/", "/@vite/", "/@react-refresh"],
} as const;

export const PUBLISHED_SITE_REDIRECT_STATUS = 308;

export type RuntimeRouteBaseMatch = {
  pathSuffix: `/${string}` | "";
  routeBase: `/${string}`;
  routeId: string;
  suffixSegments: readonly string[];
};

const clientRoutePaths = [
  runtimeTopologyRoutes.loginRoute,
  runtimeTopologyRoutes.setupRoute,
] as const;
const clientRoutePrefixes = [
  runtimeTopologyRoutes.appRouteBase,
  runtimeTopologyRoutes.publicSitePreviewRouteBase,
  runtimeTopologyRoutes.schemaRoute,
  runtimeTopologyRoutes.siteRouteBase,
  ...schemaApps.map((app) => app.route),
] as const;
const publishedProfileClientRoutePrefixes = [
  runtimeTopologyRoutes.appRouteBase,
  runtimeTopologyRoutes.siteRouteBase,
] as const;
const instanceProfileClientRoutePaths = [
  runtimeTopologyRoutes.instanceRootRoute,
  runtimeTopologyRoutes.loginRoute,
  runtimeTopologyRoutes.setupRoute,
] as const;

export function resolveRuntimeProfileKind(
  input: RuntimeProfileKindResolverInput = {},
): RuntimeProfileKind {
  return (
    parseRuntimeProfileKind(input.profile) ??
    runtimeProfileKindFromHost(input.hostname) ??
    input.fallback ??
    "dev"
  );
}

export function parseRuntimeProfileKind(value: string | undefined): RuntimeProfileKind | undefined {
  switch (value) {
    case "instance":
    case "dev":
    case "app":
    case "siteAuthoring":
    case "publishedSite":
      return value;
    default:
      return undefined;
  }
}

export function runtimeProfileKindFromHost(
  hostname: string | undefined,
): RuntimeProfileKind | undefined {
  if (!hostname) {
    return undefined;
  }

  const normalized = hostname.toLowerCase();

  if (normalized.startsWith("published-site.")) {
    return "publishedSite";
  }

  if (normalized.startsWith("instance.")) {
    return "instance";
  }

  if (normalized.startsWith("app.")) {
    return "app";
  }

  if (normalized.startsWith("site-authoring.")) {
    return "siteAuthoring";
  }

  if (isWorkersDevHost(normalized)) {
    return "publishedSite";
  }

  return undefined;
}

export function runtimeRoutePolicyForProfileKind(
  profileKind: RuntimeProfileKind,
): RuntimeTopologyRoutePolicy {
  const instanceBrowserRoutes = profileKind === "instance" || profileKind === "dev";

  return {
    instanceBrowserRoutes,
    installedAppApiRoutes: true,
    installedAppBrowserRoutes: instanceBrowserRoutes,
    installedSitePublicRoutes: instanceBrowserRoutes,
    ownerSessionBrowserRoutes: instanceBrowserRoutes || profileKind === "publishedSite",
    schemaKeyApiRoutes: profileKind !== "instance",
    schemaKeyBrowserRoutes: profileKind === "dev",
  };
}

export function isRuntimeApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isRuntimeClientShellRoute(pathname: string): boolean {
  return (
    isRuntimeClientShellPath(pathname) ||
    clientRoutePrefixes.some((prefix) => routeMatchesPrefix(pathname, prefix))
  );
}

export function isRuntimePublishedProfileClientShellRoute(pathname: string): boolean {
  return (
    isRuntimeClientShellPath(pathname) ||
    publishedProfileClientRoutePrefixes.some((prefix) => routeMatchesPrefix(pathname, prefix))
  );
}

export function isRuntimeInstanceProfileClientShellRoute(pathname: string): boolean {
  return (
    instanceProfileClientRoutePaths.includes(
      pathname as (typeof instanceProfileClientRoutePaths)[number],
    ) || publishedProfileClientRoutePrefixes.some((prefix) => routeMatchesPrefix(pathname, prefix))
  );
}

export function looksLikeRuntimeStaticAssetPath(pathname: string): boolean {
  const lastSegment = pathname.split("/").at(-1) ?? "";

  return (
    runtimeTopologyRoutes.staticAssetPathPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix),
    ) || /\.[a-zA-Z0-9]+$/.test(lastSegment)
  );
}

export function isRuntimeDynamicSiteIconPath(pathname: string): boolean {
  return runtimeTopologyRoutes.dynamicSiteIconPaths.includes(
    pathname as (typeof runtimeTopologyRoutes.dynamicSiteIconPaths)[number],
  );
}

export function isRuntimePublishedSiteIndexingResourcePath(pathname: string): boolean {
  return runtimeTopologyRoutes.publicSiteIndexingResourcePaths.includes(
    pathname as (typeof runtimeTopologyRoutes.publicSiteIndexingResourcePaths)[number],
  );
}

export function publishedSiteRedirectLocation(
  pathname: string,
  search: string = "",
): string | undefined {
  const withoutTrailingSlash = trimRuntimeRouteTrailingSlash(pathname);

  if (
    withoutTrailingSlash === runtimeTopologyRoutes.publicSitePreviewRouteBase ||
    withoutTrailingSlash === `${runtimeTopologyRoutes.publicSitePreviewRouteBase}/home`
  ) {
    return `/${search}`;
  }

  if (pathname.startsWith(`${runtimeTopologyRoutes.publicSitePreviewRouteBase}/`)) {
    const cleanPath = trimRuntimeRouteTrailingSlash(
      pathname
        .slice(`${runtimeTopologyRoutes.publicSitePreviewRouteBase}/`.length)
        .replace(/^\/+/, ""),
    );

    return `/${cleanPath}${search}`;
  }

  return undefined;
}

export function acceptsRuntimeHtml(acceptHeader: string | null): boolean {
  return (
    acceptHeader === null || acceptHeader.includes("text/html") || acceptHeader.includes("*/*")
  );
}

export function isRuntimeReadRequestMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

export function stringRuntimeConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function matchRuntimeRouteBase(
  pathname: string,
  routeBase: `/${string}`,
): RuntimeRouteBaseMatch | undefined {
  const normalizedBase = trimRuntimeRouteTrailingSlash(routeBase);

  if (pathname !== normalizedBase && !pathname.startsWith(`${normalizedBase}/`)) {
    return undefined;
  }

  const suffix = pathname.slice(normalizedBase.length).replace(/^\/+/, "");
  const [routeId, ...suffixSegments] = suffix.split("/").filter(Boolean);

  if (!routeId) {
    return undefined;
  }

  return {
    pathSuffix: suffixSegments.length === 0 ? "" : `/${suffixSegments.join("/")}`,
    routeBase: normalizedBase as `/${string}`,
    routeId,
    suffixSegments,
  };
}

export function runtimeRouteFromBase(
  routeBase: `/${string}`,
  routeId: string,
  pathSuffix: `/${string}` | "" = "",
): `/${string}` {
  const normalizedBase = trimRuntimeRouteTrailingSlash(routeBase);
  const prefix = normalizedBase === "/" ? "" : normalizedBase;

  return `${prefix}/${routeId}${pathSuffix}` as `/${string}`;
}

export function isWorkersDevHost(hostname: string): boolean {
  return hostname === "workers.dev" || hostname.endsWith(".workers.dev");
}

function isRuntimeClientShellPath(pathname: string): boolean {
  return clientRoutePaths.includes(pathname as (typeof clientRoutePaths)[number]);
}

function routeMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

function trimRuntimeRouteTrailingSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");

  return trimmed === "" ? "/" : trimmed;
}
