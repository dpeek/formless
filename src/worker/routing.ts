import {
  PUBLISHED_SITE_REDIRECT_STATUS,
  acceptsRuntimeHtml,
  isRuntimeApiPath,
  isRuntimeClientShellRoute,
  isRuntimeDynamicSiteIconPath,
  isRuntimeInstanceProfileClientShellRoute,
  isRuntimePublishedProfileClientShellRoute,
  isRuntimePublishedSiteIndexingResourcePath,
  isRuntimeReadRequestMethod,
  looksLikeRuntimeStaticAssetPath,
  publishedSiteRedirectLocation,
  resolveRuntimeProfileKind,
  runtimeRoutePolicyForProfileKind,
  runtimeTopologyRoutes,
  stringRuntimeConfigValue,
  type RuntimeRouteAccess,
  type RuntimeProfileKind,
} from "../shared/runtime-topology.ts";
import type { InstanceRuntimeRouteResolution } from "./instance-runtime-routes.ts";

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
  workspaceGatewayApiRoutes: boolean;
};

export type WorkerRuntimeRequestTopology = {
  acceptsHtml: boolean;
  apiPath: boolean;
  clientShellRoute: boolean;
  dynamicSiteIconPath: boolean;
  instanceProfileClientShellRoute: boolean;
  pathname: string;
  profileKind: RuntimeProfileKind;
  publishedProfileClientShellRoute: boolean;
  publishedSiteIndexingResourcePath: boolean;
  publishedSitePreviewRedirectLocation?: string | undefined;
  readMethod: boolean;
  routePolicy: WorkerRuntimeRoutePolicy;
  staticAssetPath: boolean;
  url: URL;
};

export type WorkerRuntimeRouteInput = WorkerRuntimeProfileInput | WorkerRuntimeRequestTopology;

export function workerRuntimeProfileInput(profile: string | undefined): WorkerRuntimeProfileInput {
  return {
    profile: stringRuntimeConfigValue(profile),
  };
}

export function resolveWorkerRuntimeRequestTopology(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): WorkerRuntimeRequestTopology {
  if (isWorkerRuntimeRequestTopology(input)) {
    return input;
  }

  const url = new URL(request.url);
  const profileKind = resolveRuntimeProfileKind({ ...input, hostname: url.hostname });
  const readMethod = isRuntimeReadRequestMethod(request.method);
  const apiPath = isRuntimeApiPath(url.pathname);
  const staticAssetPath = looksLikeRuntimeStaticAssetPath(url.pathname);

  return {
    acceptsHtml: acceptsRuntimeHtml(request.headers.get("Accept")),
    apiPath,
    clientShellRoute: isRuntimeClientShellRoute(url.pathname),
    dynamicSiteIconPath: isRuntimeDynamicSiteIconPath(url.pathname),
    instanceProfileClientShellRoute: isRuntimeInstanceProfileClientShellRoute(url.pathname),
    pathname: url.pathname,
    profileKind,
    publishedProfileClientShellRoute: isRuntimePublishedProfileClientShellRoute(url.pathname),
    publishedSiteIndexingResourcePath: isRuntimePublishedSiteIndexingResourcePath(url.pathname),
    publishedSitePreviewRedirectLocation:
      readMethod && !apiPath && !staticAssetPath
        ? publishedSiteRedirectLocation(url.pathname, url.search)
        : undefined,
    readMethod,
    routePolicy: workerRuntimeRoutePolicyFromKind(profileKind),
    staticAssetPath,
    url,
  };
}

export function workerRuntimeRoutePolicy(
  input: WorkerRuntimeProfileInput = {},
): WorkerRuntimeRoutePolicy {
  return workerRuntimeRoutePolicyFromKind(resolveRuntimeProfileKind(input));
}

export function areSchemaKeyApiRoutesEnabledForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  return resolveWorkerRuntimeRequestTopology(request, input).routePolicy.schemaKeyApiRoutes;
}

export function shouldHandlePublishedSiteDocument(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.profileKind !== "publishedSite") {
    return false;
  }

  if (
    topology.apiPath ||
    topology.publishedSitePreviewRedirectLocation ||
    topology.clientShellRoute ||
    topology.staticAssetPath
  ) {
    return false;
  }

  return topology.acceptsHtml;
}

export function shouldHandlePublishedSiteIndexingResource(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return (
    topology.readMethod &&
    topology.profileKind === "publishedSite" &&
    topology.publishedSiteIndexingResourcePath
  );
}

export function shouldResolveInstanceSiteDomainMappingForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.apiPath) {
    return false;
  }

  return topology.profileKind === "instance";
}

export function shouldHandleMappedSiteHostDocument(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (
    topology.apiPath ||
    mappedSiteHostRedirectForRequest(request, topology) ||
    topology.clientShellRoute ||
    topology.staticAssetPath
  ) {
    return false;
  }

  return topology.acceptsHtml;
}

export function shouldBlockMappedSiteHostBrowserRoute(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return (
    topology.readMethod &&
    !topology.apiPath &&
    !topology.staticAssetPath &&
    topology.clientShellRoute
  );
}

export function shouldHandleMappedSiteHostIndexingResource(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return topology.readMethod && topology.publishedSiteIndexingResourcePath;
}

export function shouldServeMappedAppHostClientShell(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "app" },
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  return (
    topology.readMethod && !topology.apiPath && !topology.staticAssetPath && topology.acceptsHtml
  );
}

export function shouldDeferToStaticAssets(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return false;
  }

  if (topology.apiPath || topology.dynamicSiteIconPath) {
    return false;
  }

  if (topology.profileKind === "publishedSite") {
    return topology.publishedProfileClientShellRoute || topology.staticAssetPath;
  }

  if (topology.profileKind === "instance") {
    return topology.instanceProfileClientShellRoute || topology.staticAssetPath;
  }

  return true;
}

export function shouldRedirectAnonymousOwnerBrowserRoute(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
  runtimeRoute?: InstanceRuntimeRouteResolution,
): boolean {
  return (
    protectedBrowserRouteCandidate(request, input) &&
    ownerBrowserRouteAccessForRequest(request, input, runtimeRoute) === "owner"
  );
}

export function shouldRedirectAnonymousProtectedBrowserRoute(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
  runtimeRoute?: InstanceRuntimeRouteResolution,
): boolean {
  return (
    protectedBrowserRouteCandidate(request, input) &&
    ownerBrowserRouteAccessForRequest(request, input, runtimeRoute) !== "anonymous"
  );
}

function protectedBrowserRouteCandidate(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): boolean {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (
    !topology.readMethod ||
    !topology.acceptsHtml ||
    topology.apiPath ||
    topology.staticAssetPath ||
    topology.pathname === runtimeTopologyRoutes.loginRoute ||
    topology.pathname === runtimeTopologyRoutes.setupRoute
  ) {
    return false;
  }

  return true;
}

export function ownerBrowserRouteAccessForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
  runtimeRoute?: InstanceRuntimeRouteResolution,
): RuntimeRouteAccess {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);
  const mountRoute = runtimeRoute?.kind === "mount" ? runtimeRoute : undefined;

  if (mountRoute?.matchHost !== undefined) {
    return mountRoute.access;
  }

  const instanceBrowserProfile =
    topology.profileKind === "instance" || topology.profileKind === "dev";

  if (!instanceBrowserProfile) {
    return "anonymous";
  }

  if (mountRoute) {
    return mountRoute.access;
  }

  if (topology.pathname === runtimeTopologyRoutes.accessRoute) {
    return "authenticated";
  }

  if (
    topology.pathname === runtimeTopologyRoutes.instanceRootRoute ||
    topology.pathname === runtimeTopologyRoutes.appRouteBase ||
    topology.pathname.startsWith(`${runtimeTopologyRoutes.appRouteBase}/`)
  ) {
    return "owner";
  }

  return "anonymous";
}

export function publishedSiteRedirectForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = {},
): PublishedSiteRedirect | undefined {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return undefined;
  }

  if (topology.profileKind !== "publishedSite" || topology.apiPath || topology.staticAssetPath) {
    return undefined;
  }

  const location = topology.publishedSitePreviewRedirectLocation;

  return location ? { location, status: PUBLISHED_SITE_REDIRECT_STATUS } : undefined;
}

export function mappedSiteHostRedirectForRequest(
  request: Request,
  input: WorkerRuntimeRouteInput = { profile: "publishedSite" },
): PublishedSiteRedirect | undefined {
  const topology = resolveWorkerRuntimeRequestTopology(request, input);

  if (!topology.readMethod) {
    return undefined;
  }

  if (topology.apiPath || topology.staticAssetPath) {
    return undefined;
  }

  const location = topology.publishedSitePreviewRedirectLocation;

  return location ? { location, status: PUBLISHED_SITE_REDIRECT_STATUS } : undefined;
}

export function isApiPath(pathname: string): boolean {
  return isRuntimeApiPath(pathname);
}

export function isClientShellRoute(pathname: string): boolean {
  return isRuntimeClientShellRoute(pathname);
}

function workerRuntimeRoutePolicyFromKind(
  profileKind: RuntimeProfileKind,
): WorkerRuntimeRoutePolicy {
  const policy = runtimeRoutePolicyForProfileKind(profileKind);

  return {
    instanceBrowserRoutes: policy.instanceBrowserRoutes,
    installedAppApiRoutes: policy.installedAppApiRoutes,
    schemaKeyApiRoutes: policy.schemaKeyApiRoutes,
    schemaKeyBrowserRoutes: policy.schemaKeyBrowserRoutes,
    workspaceGatewayApiRoutes: policy.workspaceGatewayApiRoutes,
  };
}

export function looksLikeStaticAssetPath(pathname: string): boolean {
  return looksLikeRuntimeStaticAssetPath(pathname);
}

export function isDynamicSiteIconPath(pathname: string): boolean {
  return isRuntimeDynamicSiteIconPath(pathname);
}

function isWorkerRuntimeRequestTopology(
  input: WorkerRuntimeRouteInput,
): input is WorkerRuntimeRequestTopology {
  return "profileKind" in input && "routePolicy" in input && "url" in input;
}
