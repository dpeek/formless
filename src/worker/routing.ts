import { schemaApps } from "../shared/schema-apps.ts";

const legacyClientRoutePrefixes = ["/rates"] as const;
const clientRoutePrefixes = [
  "/pages",
  "/schema",
  ...schemaApps.map((app) => app.route),
  ...legacyClientRoutePrefixes,
] as const;
const staticAssetPathPrefixes = ["/@fs/", "/@id/", "/@vite/", "/@react-refresh"] as const;

type WorkerRuntimeProfileKind = "dev" | "app" | "publishedSite";

export type WorkerRuntimeProfileInput = {
  hostname?: string | undefined;
  profile?: string | undefined;
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
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);
  const profileKind = resolveWorkerRuntimeProfileKind({ ...input, hostname: url.hostname });

  if (profileKind !== "publishedSite") {
    return false;
  }

  if (
    isApiPath(url.pathname) ||
    isClientShellRoute(url.pathname) ||
    looksLikeStaticAssetPath(url.pathname)
  ) {
    return false;
  }

  return acceptsHtml(request.headers.get("Accept"));
}

export function shouldDeferToStaticAssets(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return false;
  }

  const url = new URL(request.url);

  if (isApiPath(url.pathname)) {
    return false;
  }

  const profileKind = resolveWorkerRuntimeProfileKind({ ...input, hostname: url.hostname });

  return (
    profileKind !== "publishedSite" ||
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

  return undefined;
}

function acceptsHtml(acceptHeader: string | null): boolean {
  return (
    acceptHeader === null || acceptHeader.includes("text/html") || acceptHeader.includes("*/*")
  );
}
