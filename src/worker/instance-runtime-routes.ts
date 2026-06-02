import { findAppInstall, type AppInstall } from "../shared/app-installs.ts";
import {
  installedAppStorageIdentity,
  type InstalledAppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  type InstanceControlPlaneRedirectStatusCode,
  type InstanceControlPlaneRouteSurface,
  type InstanceControlPlaneRouteTargetProfile,
  type InstanceControlPlaneRouteValues,
} from "../shared/instance-control-plane.ts";
import type { StoredRecord } from "../shared/protocol.ts";

export const INTERNAL_RESOLVE_INSTANCE_RUNTIME_ROUTE_PATH = "/_internal/resolve-runtime-route";

export type InstanceRuntimeRedirectStatus = 301 | 302 | 303 | 307 | 308;

export type InstanceRuntimeMountRouteResolution = {
  id: string;
  kind: "mount";
  matchHost?: string;
  matchPath: `/${string}`;
  matchPrefix?: `/${string}`;
  surface?: InstanceControlPlaneRouteSurface;
  target?: InstalledAppStorageIdentity;
  targetProfile: InstanceControlPlaneRouteTargetProfile;
};

export type InstanceRuntimeRedirectRouteResolution = {
  id: string;
  kind: "redirect";
  location: string;
  matchHost: string;
  matchPath: `/${string}`;
  matchPrefix?: `/${string}`;
  status: InstanceRuntimeRedirectStatus;
};

export type InstanceRuntimeRouteResolution =
  | InstanceRuntimeMountRouteResolution
  | InstanceRuntimeRedirectRouteResolution;

export type InstanceRuntimeRouteRequest = {
  host: string;
  pathname: string;
  search?: string;
};

export type InstanceRuntimeRouteResolutionOptions = {
  includeHostless?: boolean;
};

type InstanceRuntimeRoutesEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type RouteCandidate = {
  id: string;
  kindRank: number;
  matchHost?: string;
  pathRank: number;
  specificity: number;
  values: InstanceControlPlaneRouteValues;
};

export async function resolveInstanceRuntimeRouteForRequest(
  request: Request,
  env: InstanceRuntimeRoutesEnv,
  options: InstanceRuntimeRouteResolutionOptions = {},
): Promise<InstanceRuntimeRouteResolution | undefined> {
  const requestUrl = new URL(request.url);
  const resolveUrl = new URL(
    `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}${INTERNAL_RESOLVE_INSTANCE_RUNTIME_ROUTE_PATH}`,
    request.url,
  );

  resolveUrl.searchParams.set("host", requestUrl.hostname);
  resolveUrl.searchParams.set("path", requestUrl.pathname);
  resolveUrl.searchParams.set("search", requestUrl.search);

  if (options.includeHostless === false) {
    resolveUrl.searchParams.set("includeHostless", "false");
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(resolveUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as {
    route?: InstanceRuntimeRouteResolution | null;
  };

  return body.route ?? undefined;
}

export function resolveInstanceRuntimeRouteFromRecords(input: {
  appInstalls: readonly AppInstall[];
  records: readonly StoredRecord[];
  request: InstanceRuntimeRouteRequest;
  options?: InstanceRuntimeRouteResolutionOptions;
}): InstanceRuntimeRouteResolution | undefined {
  const candidate = selectInstanceRuntimeRouteCandidate({
    records: input.records,
    request: input.request,
    options: input.options,
  });

  if (!candidate) {
    return undefined;
  }

  return runtimeRouteResolutionFromCandidate(candidate, input.appInstalls, input.request);
}

function selectInstanceRuntimeRouteCandidate(input: {
  records: readonly StoredRecord[];
  request: InstanceRuntimeRouteRequest;
  options?: InstanceRuntimeRouteResolutionOptions;
}): RouteCandidate | undefined {
  const normalizedHost = normalizedRequestHost(input.request.host);
  const candidates = input.records
    .flatMap((record) => {
      const candidate = routeCandidateFromRecord(record, {
        includeHostless: input.options?.includeHostless ?? true,
        normalizedHost,
        pathname: input.request.pathname,
      });

      return candidate ? [candidate] : [];
    })
    .sort(compareRouteCandidates);

  return candidates[0];
}

function routeCandidateFromRecord(
  record: StoredRecord,
  input: { includeHostless: boolean; normalizedHost?: string; pathname: string },
): RouteCandidate | undefined {
  if (record.deletedAt || record.entity !== "route") {
    return undefined;
  }

  const values = routeValues(record.values);

  if (!values || values.enabled !== true) {
    return undefined;
  }

  const matchHost = values.matchHost;

  if (matchHost === undefined) {
    if (!input.includeHostless) {
      return undefined;
    }
  } else if (matchHost !== input.normalizedHost) {
    return undefined;
  }

  const pathMatch = routePathMatch(values, input.pathname);

  if (!pathMatch) {
    return undefined;
  }

  return {
    id: record.id,
    kindRank: values.kind === "redirect" ? 0 : 1,
    ...(matchHost === undefined ? {} : { matchHost }),
    pathRank: pathMatch.rank,
    specificity: pathMatch.specificity,
    values,
  };
}

function routeValues(values: StoredRecord["values"]): InstanceControlPlaneRouteValues | undefined {
  const kind = values.kind;
  const matchHost = optionalString(values.matchHost);
  const matchPath = optionalAbsolutePath(values.matchPath);
  const matchPrefix = optionalAbsolutePath(values.matchPrefix);

  if ((kind !== "mount" && kind !== "redirect") || !matchPath) {
    return undefined;
  }

  return {
    enabled: values.enabled === true,
    ...(matchHost === undefined ? {} : { matchHost }),
    matchPath,
    ...(matchPrefix === undefined ? {} : { matchPrefix }),
    kind,
    ...(values.targetProfile === "app" ||
    values.targetProfile === "instance" ||
    values.targetProfile === "public-site"
      ? { targetProfile: values.targetProfile }
      : {}),
    ...(typeof values.appInstall === "string" ? { appInstall: values.appInstall } : {}),
    ...(values.surface === "admin" ||
    values.surface === "schema" ||
    values.surface === "public-site"
      ? { surface: values.surface }
      : {}),
    ...(typeof values.providerConfig === "string" ? { providerConfig: values.providerConfig } : {}),
    ...(typeof values.toHost === "string" ? { toHost: values.toHost } : {}),
    ...(typeof values.toUrl === "string" ? { toUrl: values.toUrl } : {}),
    ...(isRedirectStatusCode(values.statusCode) ? { statusCode: values.statusCode } : {}),
    ...(typeof values.preservePath === "boolean" ? { preservePath: values.preservePath } : {}),
    ...(typeof values.preserveQueryString === "boolean"
      ? { preserveQueryString: values.preserveQueryString }
      : {}),
    createdAt: typeof values.createdAt === "string" ? values.createdAt : "",
    updatedAt: typeof values.updatedAt === "string" ? values.updatedAt : "",
  };
}

function routePathMatch(
  values: InstanceControlPlaneRouteValues,
  pathname: string,
): { rank: number; specificity: number } | undefined {
  if (pathname === values.matchPath) {
    return { rank: 0, specificity: values.matchPath.length };
  }

  const prefix = values.matchPrefix;

  if (prefix === undefined) {
    return undefined;
  }

  if (prefix === "/" || pathname.startsWith(prefix)) {
    return { rank: 1, specificity: prefix.length };
  }

  return undefined;
}

function compareRouteCandidates(left: RouteCandidate, right: RouteCandidate): number {
  return (
    hostRank(left) - hostRank(right) ||
    left.pathRank - right.pathRank ||
    right.specificity - left.specificity ||
    left.kindRank - right.kindRank ||
    left.id.localeCompare(right.id)
  );
}

function hostRank(candidate: RouteCandidate): number {
  return candidate.matchHost === undefined ? 1 : 0;
}

function runtimeRouteResolutionFromCandidate(
  candidate: RouteCandidate,
  appInstalls: readonly AppInstall[],
  request: InstanceRuntimeRouteRequest,
): InstanceRuntimeRouteResolution | undefined {
  const values = candidate.values;

  if (values.kind === "redirect") {
    if (!candidate.matchHost || !values.statusCode) {
      return undefined;
    }

    return {
      id: candidate.id,
      kind: "redirect",
      location: redirectLocation(values, request),
      matchHost: candidate.matchHost,
      matchPath: values.matchPath,
      ...(values.matchPrefix === undefined ? {} : { matchPrefix: values.matchPrefix }),
      status: redirectStatus(values.statusCode),
    };
  }

  const targetProfile = values.targetProfile;

  if (!targetProfile) {
    return undefined;
  }

  const target = installTarget(values, appInstalls);

  if ((targetProfile === "app" || targetProfile === "public-site") && !target) {
    return undefined;
  }

  return {
    id: candidate.id,
    kind: "mount",
    ...(candidate.matchHost === undefined ? {} : { matchHost: candidate.matchHost }),
    matchPath: values.matchPath,
    ...(values.matchPrefix === undefined ? {} : { matchPrefix: values.matchPrefix }),
    ...(values.surface === undefined ? {} : { surface: values.surface }),
    ...(target === undefined ? {} : { target }),
    targetProfile,
  };
}

function installTarget(
  values: InstanceControlPlaneRouteValues,
  appInstalls: readonly AppInstall[],
): InstalledAppStorageIdentity | undefined {
  const installId = values.appInstall;

  if (!installId) {
    return undefined;
  }

  const install = findAppInstall(appInstalls, installId);

  return install
    ? installedAppStorageIdentity({
        installId: install.installId,
        packageAppKey: install.packageAppKey,
      })
    : undefined;
}

function redirectLocation(
  values: InstanceControlPlaneRouteValues,
  request: InstanceRuntimeRouteRequest,
) {
  const target = new URL(
    values.toHost ? `https://${values.toHost}` : (values.toUrl ?? "https://invalid"),
  );

  if (values.preservePath === true) {
    target.pathname = joinUrlPaths(target.pathname, request.pathname);
  }

  if (values.preserveQueryString === true) {
    target.search = request.search ?? "";
  }

  return target.toString();
}

function joinUrlPaths(basePath: string, requestPath: string) {
  const base = basePath.replace(/\/+$/, "");
  const suffix = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;

  return `${base}${suffix}` || "/";
}

function redirectStatus(
  value: InstanceControlPlaneRedirectStatusCode,
): InstanceRuntimeRedirectStatus {
  return Number(value) as InstanceRuntimeRedirectStatus;
}

function normalizedRequestHost(host: string): string | undefined {
  const normalized = normalizeInstanceDomainHost(host);

  return normalized.ok ? normalized.host : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalAbsolutePath(value: unknown): `/${string}` | undefined {
  return typeof value === "string" && value.startsWith("/") ? (value as `/${string}`) : undefined;
}

function isRedirectStatusCode(value: unknown): value is InstanceControlPlaneRedirectStatusCode {
  return (
    value === "301" || value === "302" || value === "303" || value === "307" || value === "308"
  );
}
