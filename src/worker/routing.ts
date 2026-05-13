import { schemaApps } from "../shared/schema-apps.ts";

const legacyClientRoutePrefixes = ["/rates"] as const;
const clientRoutePrefixes = [
  "/pages",
  "/schema",
  ...schemaApps.map((app) => app.route),
  ...legacyClientRoutePrefixes,
] as const;
const staticAssetPathPrefixes = ["/@fs/", "/@id/", "/@vite/", "/@react-refresh"] as const;

export function shouldHandlePublishedSiteDocument(request: Request): boolean {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  if (
    isAppProfileHost(url.hostname) ||
    isApiPath(url.pathname) ||
    isClientShellRoute(url.pathname) ||
    looksLikeStaticAssetPath(url.pathname)
  ) {
    return false;
  }

  return acceptsHtml(request.headers.get("Accept"));
}

export function shouldDeferToStaticAssets(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url);

  if (isApiPath(url.pathname)) {
    return false;
  }

  return (
    isAppProfileHost(url.hostname) ||
    isClientShellRoute(url.pathname) ||
    looksLikeStaticAssetPath(url.pathname)
  );
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

function isAppProfileHost(hostname: string): boolean {
  return hostname.toLowerCase().startsWith("app.");
}

function acceptsHtml(acceptHeader: string | null): boolean {
  return (
    acceptHeader === null || acceptHeader.includes("text/html") || acceptHeader.includes("*/*")
  );
}
