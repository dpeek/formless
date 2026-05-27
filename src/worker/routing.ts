import {
  PUBLISHED_SITE_REDIRECT_STATUS,
  acceptsRuntimeHtml,
  isRuntimeApiPath,
  isRuntimeClientShellRoute,
  isRuntimeDynamicSiteIconPath,
  isRuntimeInstanceProfileClientShellRoute,
  isRuntimePublishedProfileClientShellRoute,
  isRuntimeReadRequestMethod,
  looksLikeRuntimeStaticAssetPath,
  publishedSiteRedirectLocation,
  resolveRuntimeProfileKind,
  runtimeRoutePolicyForProfileKind,
  stringRuntimeConfigValue,
} from "../shared/runtime-topology.ts";

export type WorkerRuntimeProfileInput = {
  hostname?: string | undefined;
  profile?: string | undefined;
};

export type PublishedSiteRedirect = {
  location: string;
  status: typeof PUBLISHED_SITE_REDIRECT_STATUS;
};

export type WorkerRuntimeRoutePolicy = {
  instanceBrowserRoutes: boolean;
  installedAppApiRoutes: boolean;
  schemaKeyApiRoutes: boolean;
  schemaKeyBrowserRoutes: boolean;
};

export function workerRuntimeProfileInput(profile: string | undefined): WorkerRuntimeProfileInput {
  return {
    profile: stringRuntimeConfigValue(profile),
  };
}

export function workerRuntimeRoutePolicy(
  input: WorkerRuntimeProfileInput = {},
): WorkerRuntimeRoutePolicy {
  return workerRuntimeRoutePolicyFromKind(resolveRuntimeProfileKind(input));
}

export function areSchemaKeyApiRoutesEnabledForRequest(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  const url = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });

  return workerRuntimeRoutePolicyFromKind(profileKind).schemaKeyApiRoutes;
}

export function shouldHandlePublishedSiteDocument(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });

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

  return acceptsRuntimeHtml(request.headers.get("Accept"));
}

export function shouldHandlePublishedSiteIndexingResource(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });

  return (
    profileKind === "publishedSite" &&
    (url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml")
  );
}

export function shouldResolveInstanceSiteDomainMappingForRequest(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): boolean {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);

  if (isApiPath(url.pathname)) {
    return false;
  }

  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });

  return profileKind === "instance";
}

export function shouldHandleMappedSiteHostDocument(request: Request): boolean {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);

  if (
    isApiPath(url.pathname) ||
    mappedSiteHostRedirectForRequest(request) ||
    isClientShellRoute(url.pathname) ||
    looksLikeStaticAssetPath(url.pathname)
  ) {
    return false;
  }

  return acceptsRuntimeHtml(request.headers.get("Accept"));
}

export function shouldBlockMappedSiteHostBrowserRoute(request: Request): boolean {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);

  return (
    !isApiPath(url.pathname) &&
    !looksLikeStaticAssetPath(url.pathname) &&
    isClientShellRoute(url.pathname)
  );
}

export function shouldHandleMappedSiteHostIndexingResource(request: Request): boolean {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return false;
  }

  const url = new URL(request.url);

  return url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml";
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

  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });

  if (profileKind === "publishedSite") {
    return (
      isRuntimePublishedProfileClientShellRoute(url.pathname) ||
      looksLikeStaticAssetPath(url.pathname)
    );
  }

  if (profileKind === "instance") {
    return (
      isRuntimeInstanceProfileClientShellRoute(url.pathname) ||
      looksLikeStaticAssetPath(url.pathname)
    );
  }

  return true;
}

export function publishedSiteRedirectForRequest(
  request: Request,
  input: WorkerRuntimeProfileInput = {},
): PublishedSiteRedirect | undefined {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return undefined;
  }

  const url = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });

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

export function mappedSiteHostRedirectForRequest(
  request: Request,
): PublishedSiteRedirect | undefined {
  if (!isRuntimeReadRequestMethod(request.method)) {
    return undefined;
  }

  const url = new URL(request.url);

  if (isApiPath(url.pathname) || looksLikeStaticAssetPath(url.pathname)) {
    return undefined;
  }

  const location = publishedSiteRedirectLocation(url.pathname, url.search);

  return location ? { location, status: PUBLISHED_SITE_REDIRECT_STATUS } : undefined;
}

export function isApiPath(pathname: string): boolean {
  return isRuntimeApiPath(pathname);
}

export function isClientShellRoute(pathname: string): boolean {
  return isRuntimeClientShellRoute(pathname);
}

function workerRuntimeRoutePolicyFromKind(
  profileKind: ReturnType<typeof resolveRuntimeProfileKind>,
): WorkerRuntimeRoutePolicy {
  const policy = runtimeRoutePolicyForProfileKind(profileKind);

  return {
    instanceBrowserRoutes: policy.instanceBrowserRoutes,
    installedAppApiRoutes: policy.installedAppApiRoutes,
    schemaKeyApiRoutes: policy.schemaKeyApiRoutes,
    schemaKeyBrowserRoutes: policy.schemaKeyBrowserRoutes,
  };
}

export function looksLikeStaticAssetPath(pathname: string): boolean {
  return looksLikeRuntimeStaticAssetPath(pathname);
}

export function isDynamicSiteIconPath(pathname: string): boolean {
  return isRuntimeDynamicSiteIconPath(pathname);
}
