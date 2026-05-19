import { schemaApps } from "../shared/schema-apps.ts";

const clientRoutePrefixes = ["/pages", "/schema", ...schemaApps.map((app) => app.route)] as const;
const staticAssetPathPrefixes = ["/@fs/", "/@id/", "/@vite/", "/@react-refresh"] as const;
const dynamicSiteIconPaths = ["/favicon.svg", "/favicon.ico", "/apple-touch-icon.png"] as const;
const PUBLISHED_SITE_REDIRECT_STATUS = 308;

type WorkerRuntimeProfileKind = "dev" | "app" | "siteAuthoring" | "publishedSite";

export type WorkerRuntimeProfileInput = {
  hostname?: string | undefined;
  profile?: string | undefined;
};

export type PublishedSiteRedirect = {
  location: string;
  status: typeof PUBLISHED_SITE_REDIRECT_STATUS;
};

export function workerRuntimeProfileInput(profile: string | undefined): WorkerRuntimeProfileInput {
  return {
    profile: stringConfigValue(profile),
  };
}

export function shouldHandlePublishedSiteDocument(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (!isReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);
  const profileKind = resolveWorkerRuntimeProfileKind({ ...input, hostname: url.hostname });

  if (profileKind !== "publishedSite") {
    return false;
  }

  if (
    isApiPath(url.pathname) ||
    publishedSiteRedirectLocation(url.pathname, url.search) ||
    isClientShellRoute(url.pathname) ||
    looksLikeStaticAssetPath(url.pathname)
  ) {
    return false;
  }

  return acceptsHtml(request.headers.get("Accept"));
}

export function shouldHandlePublishedSiteIndexingResource(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (!isReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);
  const profileKind = resolveWorkerRuntimeProfileKind({ ...input, hostname: url.hostname });

  return (
    profileKind === "publishedSite" &&
    (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml")
  );
}

export function shouldDeferToStaticAssets(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url);

  if (isApiPath(url.pathname) || isDynamicSiteIconPath(url.pathname)) {
    return false;
  }

  const profileKind = resolveWorkerRuntimeProfileKind({ ...input, hostname: url.hostname });

  return profileKind !== "publishedSite" || looksLikeStaticAssetPath(url.pathname);
}

export function publishedSiteRedirectForRequest(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): PublishedSiteRedirect | undefined {
  if (!isReadRequestMethod(request.method)) {
    return undefined;
  }

  const url = new URL(request.url);
  const profileKind = resolveWorkerRuntimeProfileKind({ ...input, hostname: url.hostname });

  if (
    profileKind !== "publishedSite" ||
    isApiPath(url.pathname) ||
    looksLikeStaticAssetPath(url.pathname)
  ) {
    return undefined;
  }

  const location = publishedSiteRedirectLocation(url.pathname, url.search);

  return location ? { location, status: PUBLISHED_SITE_REDIRECT_STATUS } : undefined;
}

export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isClientShellRoute(pathname: string): boolean {
  return clientRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function looksLikeStaticAssetPath(pathname: string): boolean {
  const lastSegment = pathname.split("/").at(-1) ?? "";

  return (
    staticAssetPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) ||
    /\.[a-zA-Z0-9]+$/.test(lastSegment)
  );
}

export function isDynamicSiteIconPath(pathname: string): boolean {
  return dynamicSiteIconPaths.includes(pathname as (typeof dynamicSiteIconPaths)[number]);
}

function isAppProfileHost(hostname: string): boolean {
  return hostname.toLowerCase().startsWith("app.");
}

function resolveWorkerRuntimeProfileKind(
  input: WorkerRuntimeProfileInput,
): WorkerRuntimeProfileKind {
  return (
    parseRuntimeProfileKind(input.profile) ?? runtimeProfileKindFromHost(input.hostname) ?? "dev"
  );
}

function parseRuntimeProfileKind(value: string | undefined): WorkerRuntimeProfileKind | undefined {
  switch (value) {
    case "dev":
    case "app":
    case "siteAuthoring":
    case "publishedSite":
      return value;
    default:
      return undefined;
  }
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function runtimeProfileKindFromHost(
  hostname: string | undefined,
): WorkerRuntimeProfileKind | undefined {
  if (!hostname) {
    return undefined;
  }

  const normalized = hostname.toLowerCase();

  if (normalized.startsWith("published-site.")) {
    return "publishedSite";
  }

  if (isAppProfileHost(normalized)) {
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

function publishedSiteRedirectLocation(pathname: string, search: string): string | undefined {
  const withoutTrailingSlash = trimTrailingSlash(pathname);

  if (withoutTrailingSlash === "/pages" || withoutTrailingSlash === "/pages/home") {
    return `/${search}`;
  }

  if (pathname.startsWith("/pages/")) {
    const cleanPath = trimTrailingSlash(pathname.slice("/pages/".length).replace(/^\/+/, ""));

    return `/${cleanPath}${search}`;
  }

  return undefined;
}

function trimTrailingSlash(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");

  return trimmed === "" ? "/" : trimmed;
}

function acceptsHtml(acceptHeader: string | null): boolean {
  return (
    acceptHeader === null || acceptHeader.includes("text/html") || acceptHeader.includes("*/*")
  );
}

function isReadRequestMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function isWorkersDevHost(hostname: string): boolean {
  return hostname === "workers.dev" || hostname.endsWith(".workers.dev");
}
