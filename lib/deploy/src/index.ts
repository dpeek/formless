import {
  DEPLOY_PUBLIC_CONTRACT_VERSION,
  type ControlPlaneAppInstallProjectionRecord,
  type ControlPlaneDomainMappingProfile,
  type ControlPlaneProviderConfigProjectionRecord,
  type ControlPlaneProjectionSourceRecord,
  type ControlPlaneRedirectStatusCode,
  type ControlPlaneRouteProjectionRecord,
  type DeployControlPlaneRecordsProjectionInput,
  type DeployDesiredStateProjection,
  type DeployDesiredStateProjectionInput,
  type DeployJsonValue,
  type DeployProjectionHashInput,
  type DeployResource,
  type DeployRouteTargetProjection,
} from "./types.ts";

export {
  CONTROL_PLANE_DEPLOYMENT_CONFIG_OBSERVED_FIELDS,
  DEPLOY_ACTOR_KINDS,
  DEPLOY_CONTROL_PLANE_ACTION_IDS,
  DEPLOY_PUBLIC_CONTRACT_VERSION,
} from "./types.ts";
export type {
  ControlPlaneAppRouteKind,
  ControlPlaneAppRouteSurface,
  ControlPlaneAppInstallProjectionRecord,
  ControlPlaneDeploymentConfigObservedField,
  ControlPlaneDeploymentConfigObservedStatus,
  ControlPlaneDomainMappingProfile,
  ControlPlaneProviderConfigProjectionRecord,
  ControlPlaneProjectionSourceRecord,
  ControlPlaneRedirectStatusCode,
  ControlPlaneRouteKind,
  ControlPlaneRouteProjectionRecord,
  ControlPlaneRouteSurface,
  ControlPlaneRouteTargetProfile,
  DeployActor,
  DeployActorKind,
  DeployAttemptMode,
  DeployAttemptStatus,
  DeployAttemptSummary,
  DeployControlPlaneRecordsProjectionInput,
  DeployControlPlaneActionId,
  DeployDesiredStateProjection,
  DeployDesiredStateProjectionInput,
  DeployDriftStatus,
  DeployDriftSummary,
  DeployEvidenceAction,
  DeployEvidenceSummary,
  DeployJsonPrimitive,
  DeployJsonValue,
  DeployProjectionHashInput,
  DeployProviderFamily,
  DeployResource,
  DeployResourceDependency,
  DeployResourceGraph,
  DeployResourceKind,
  DeployRouteTargetProjection,
  DeploySecretReference,
} from "./types.ts";

const redirectPlaceholderDnsRecord = {
  content: "100::",
  proxied: true,
  ttl: 1,
  type: "AAAA",
} as const;

type DeploymentConfigProjectionRecord = ControlPlaneProviderConfigProjectionRecord & {
  targetId: string;
};

export function deployDesiredStateProjectionInputFromControlPlaneRecords(
  input: DeployControlPlaneRecordsProjectionInput,
): DeployDesiredStateProjectionInput {
  const activeRecords = input.records.filter((record) => record.deletedAt === undefined);
  const providerConfigs = providerConfigProjectionRecordsFromControlPlaneRecords(activeRecords);
  const providerConfigsById = new Map(providerConfigs.map((config) => [config.id, config]));
  const primaryProviderConfig = primaryProviderConfigForTarget(providerConfigs, input.targetId);
  const routes = routeProjectionRecordsFromControlPlaneRecords(activeRecords).filter((route) =>
    routeMatchesProjectionTarget(route, {
      primaryProviderConfig,
      providerConfigs: providerConfigsById,
      targetId: input.targetId,
    }),
  );
  const workerName = primaryProviderConfig?.workerName ?? input.workerName;

  return {
    appInstalls: appInstallProjectionRecordsFromControlPlaneRecords(activeRecords),
    instanceId: input.instanceId,
    providerConfigs: providerConfigProjectionInputRecords(providerConfigs),
    routes,
    targetId: input.targetId,
    ...(workerName === undefined ? {} : { workerName }),
  };
}

export function projectDeployControlPlaneDesiredState(
  input: DeployDesiredStateProjectionInput,
): DeployDesiredStateProjection {
  const routes = input.routes ?? [];
  const providerConfigs = input.providerConfigs ?? [];
  const routeTargets = projectDeployRouteTargets(routes, input.appInstalls ?? []);
  const providerConfigsById = providerConfigRecordsById(providerConfigs);
  const resources = [
    ...projectRouteProviderResources(routes, {
      instanceId: input.instanceId,
      providerConfigs: providerConfigsById,
      targetId: input.targetId,
      workerName: input.workerName,
    }),
  ].sort(compareDeployResources);
  const projectionIntent = {
    providerConfigs: normalizeProviderConfigInputs(providerConfigs, routes),
    routes: normalizeRouteInputs(routes),
    routeTargets,
    targetId: input.targetId,
  };
  const sourceFingerprint = `control-plane:${stableDeployJsonStringify(projectionIntent)}`;

  return {
    resourceGraph: {
      resources,
      targetId: input.targetId,
    },
    routeTargets,
    sourceFingerprint,
    targetId: input.targetId,
  };
}

export function projectDeployRouteTargets(
  routes: readonly ControlPlaneRouteProjectionRecord[],
  appInstalls: readonly ControlPlaneAppInstallProjectionRecord[] = [],
): DeployRouteTargetProjection[] {
  const appInstallsByInstallId = new Map(
    appInstalls.map((install) => [install.installId, install]),
  );

  return routes
    .filter(
      (route) =>
        route.enabled &&
        route.kind === "mount" &&
        route.matchHost === undefined &&
        route.appInstall !== undefined &&
        routeTargetSurface(route) !== undefined,
    )
    .map((route) => {
      const appInstallId = route.appInstall ?? "";
      const appInstall = appInstallsByInstallId.get(appInstallId);
      const surface = routeTargetSurface(route) ?? "admin";

      return {
        appInstallId,
        path: route.matchPath,
        ...(appInstall?.packageAppKey === undefined
          ? {}
          : { packageAppKey: appInstall.packageAppKey }),
        ...(route.matchPrefix === undefined ? {} : { prefix: route.matchPrefix }),
        routeId: route.id,
        routeKind: surface,
        surface,
      };
    })
    .sort(compareRouteTargets);
}

export function deployProjectionCanonicalJson(projection: DeployDesiredStateProjection): string {
  return stableDeployJsonStringify(canonicalizeDeployProjection(projection));
}

export function deployProjectionHashInputCanonicalJson(input: DeployProjectionHashInput): string {
  return stableDeployJsonStringify({
    projection: canonicalizeDeployProjection(input.projection),
    schemaVersion: input.schemaVersion,
  });
}

export async function computeDeployProjectionHash(
  projection: DeployDesiredStateProjection,
): Promise<string> {
  const input: DeployProjectionHashInput = {
    projection,
    schemaVersion: DEPLOY_PUBLIC_CONTRACT_VERSION,
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(deployProjectionHashInputCanonicalJson(input)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export function stableDeployJsonStringify(value: DeployJsonValue): string {
  return JSON.stringify(canonicalizeDeployJsonValue(value));
}

export function normalizeDeployLogicalIdPart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized === "" ? fallback : normalized;
}

export function deployLogicalResourceId(
  instanceId: string,
  kind: string,
  host: string,
  ...parts: readonly (string | undefined)[]
): string {
  return [instanceId, kind, host, ...parts]
    .filter((part): part is string => part !== undefined && part !== "")
    .map((part) => normalizeDeployLogicalIdPart(part, "value"))
    .join("-");
}

function appInstallProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): ControlPlaneAppInstallProjectionRecord[] {
  return records
    .filter((record) => record.entity === "app-install")
    .map((record) => {
      const installId = stringRecordValue(record, "installId");
      const packageAppKey = stringRecordValue(record, "packageAppKey");

      if (installId === undefined || packageAppKey === undefined) {
        return undefined;
      }

      return {
        id: record.id,
        installId,
        packageAppKey,
      };
    })
    .filter((record): record is ControlPlaneAppInstallProjectionRecord => record !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function routeProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): ControlPlaneRouteProjectionRecord[] {
  return records
    .filter((record) => record.entity === "route")
    .map(routeProjectionRecordFromControlPlaneRecord)
    .filter((record): record is ControlPlaneRouteProjectionRecord => record !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function routeProjectionRecordFromControlPlaneRecord(
  record: ControlPlaneProjectionSourceRecord,
): ControlPlaneRouteProjectionRecord | undefined {
  const kind = stringRecordValue(record, "kind");
  const matchPath = stringRecordValue(record, "matchPath");

  if ((kind !== "mount" && kind !== "redirect") || matchPath === undefined) {
    return undefined;
  }

  const appInstall = stringRecordValue(record, "appInstall");
  const deploymentConfig = stringRecordValue(record, "deploymentConfig");
  const matchHost = stringRecordValue(record, "matchHost");
  const matchPrefix = stringRecordValue(record, "matchPrefix");
  const preservePath = booleanRecordValue(record, "preservePath");
  const preserveQueryString = booleanRecordValue(record, "preserveQueryString");
  const statusCode = redirectStatusCodeRecordValue(record, "statusCode");
  const surface = routeSurfaceRecordValue(record, "surface");
  const targetProfile = routeTargetProfileRecordValue(record, "targetProfile");
  const toHost = stringRecordValue(record, "toHost");
  const toUrl = stringRecordValue(record, "toUrl");

  return {
    enabled: booleanRecordValue(record, "enabled") ?? true,
    id: record.id,
    kind,
    matchPath,
    ...(appInstall === undefined ? {} : { appInstall }),
    ...(deploymentConfig === undefined ? {} : { providerConfig: deploymentConfig }),
    ...(matchHost === undefined ? {} : { matchHost }),
    ...(matchPrefix === undefined ? {} : { matchPrefix }),
    ...(preservePath === undefined ? {} : { preservePath }),
    ...(preserveQueryString === undefined ? {} : { preserveQueryString }),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(surface === undefined ? {} : { surface }),
    ...(targetProfile === undefined ? {} : { targetProfile }),
    ...(toHost === undefined ? {} : { toHost }),
    ...(toUrl === undefined ? {} : { toUrl }),
  };
}

function providerConfigProjectionRecordsFromControlPlaneRecords(
  records: readonly ControlPlaneProjectionSourceRecord[],
): DeploymentConfigProjectionRecord[] {
  return records
    .filter(
      (record) =>
        record.entity === "deployment-config" &&
        booleanRecordValue(record, "enabled") !== false &&
        stringRecordValue(record, "providerFamily") === "cloudflare",
    )
    .map((record) => {
      const targetId = stringRecordValue(record, "targetId") ?? record.id;
      const workerName = stringRecordValue(record, "workerName");

      return {
        id: record.id,
        providerFamily: "cloudflare" as const,
        targetId,
        ...(workerName === undefined ? {} : { workerName }),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function primaryProviderConfigForTarget(
  providerConfigs: readonly DeploymentConfigProjectionRecord[],
  targetId: string,
): DeploymentConfigProjectionRecord | undefined {
  const matchingPrimary = providerConfigs.find((config) => config.targetId === targetId);

  return matchingPrimary ?? (providerConfigs.length === 1 ? providerConfigs[0] : undefined);
}

function providerConfigProjectionInputRecords(
  providerConfigs: readonly DeploymentConfigProjectionRecord[],
): ControlPlaneProviderConfigProjectionRecord[] {
  return providerConfigs.map((providerConfig) => ({
    id: providerConfig.id,
    providerFamily: providerConfig.providerFamily,
    ...(providerConfig.workerName === undefined ? {} : { workerName: providerConfig.workerName }),
  }));
}

function routeMatchesProjectionTarget(
  route: ControlPlaneRouteProjectionRecord,
  input: {
    primaryProviderConfig?: DeploymentConfigProjectionRecord;
    providerConfigs: ReadonlyMap<string, DeploymentConfigProjectionRecord>;
    targetId: string;
  },
): boolean {
  const providerConfig =
    route.providerConfig === undefined
      ? input.primaryProviderConfig
      : input.providerConfigs.get(route.providerConfig);

  return providerConfig === undefined || providerConfig.targetId === input.targetId;
}

function stringRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): string | undefined {
  const value = record.values[fieldName];

  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function booleanRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): boolean | undefined {
  const value = record.values[fieldName];

  return typeof value === "boolean" ? value : undefined;
}

function redirectStatusCodeRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["statusCode"] | undefined {
  const value = record.values[fieldName];

  if (
    value === 301 ||
    value === 302 ||
    value === 303 ||
    value === 307 ||
    value === 308 ||
    value === "301" ||
    value === "302" ||
    value === "303" ||
    value === "307" ||
    value === "308"
  ) {
    return value;
  }

  return undefined;
}

function routeSurfaceRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["surface"] | undefined {
  const value = stringRecordValue(record, fieldName);

  if (value === "admin" || value === "public-site" || value === "schema") {
    return value;
  }

  return undefined;
}

function routeTargetProfileRecordValue(
  record: ControlPlaneProjectionSourceRecord,
  fieldName: string,
): ControlPlaneRouteProjectionRecord["targetProfile"] | undefined {
  const value = stringRecordValue(record, fieldName);

  if (value === "app" || value === "instance" || value === "public-site") {
    return value;
  }

  return undefined;
}

function projectRouteProviderResources(
  routes: readonly ControlPlaneRouteProjectionRecord[],
  input: {
    instanceId: string;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: string;
    workerName?: string;
  },
): DeployResource[] {
  return routes
    .filter((route) => route.enabled && typeof route.matchHost === "string")
    .flatMap((route) => {
      if (route.kind === "mount") {
        const resource = projectRouteCustomDomainResource(route, input);

        return resource === undefined ? [] : [resource];
      }

      if (route.kind === "redirect") {
        return projectRouteRedirectResources(route, input);
      }

      return [];
    })
    .sort(compareDeployResources);
}

type ProviderConfigProjection = {
  workerName?: string;
};

function providerConfigRecordsById(
  providerConfigs: readonly ControlPlaneProviderConfigProjectionRecord[],
): ReadonlyMap<string, ProviderConfigProjection> {
  const records = new Map<string, ProviderConfigProjection>();

  for (const providerConfig of providerConfigs) {
    if (providerConfig.providerFamily !== "cloudflare") {
      continue;
    }

    records.set(
      providerConfig.id,
      providerConfig.workerName === undefined ? {} : { workerName: providerConfig.workerName },
    );
  }

  return records;
}

function projectRouteCustomDomainResource(
  route: ControlPlaneRouteProjectionRecord,
  input: {
    instanceId: string;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: string;
    workerName?: string;
  },
): DeployResource | undefined {
  const host = normalizeOptionalHost(route.matchHost);
  const profile = domainMappingProfileFromRouteTarget(route.targetProfile);

  if (host === undefined || profile === undefined) {
    return undefined;
  }

  const targetInstallId = optionalText(route.appInstall);
  const workerName = routeWorkerName(route.providerConfig, input);

  return {
    dependencies: [],
    inputs: {
      adopt: false,
      host,
      name: host,
      overrideExistingOrigin: false,
      profile,
      ...(targetInstallId === undefined ? {} : { targetInstallId }),
      ...(workerName === undefined ? {} : { workerName }),
    },
    kind: "cloudflare-worker-custom-domain",
    logicalId: deployLogicalResourceId(
      input.instanceId,
      "custom-domain",
      host,
      profile,
      targetInstallId,
    ),
    providerFamily: "cloudflare",
    targetId: input.targetId,
  };
}

function projectRouteRedirectResources(
  route: ControlPlaneRouteProjectionRecord,
  input: { instanceId: string; targetId: string },
): DeployResource[] {
  const redirect = redirectRouteIntent(route);

  if (redirect === undefined) {
    return [];
  }

  const targetUrl = redirectTargetUrl(redirect);
  const targetHost = redirect.toHost ?? hostFromUrl(redirect.toUrl) ?? "";
  const dnsLogicalId = deployLogicalResourceId(input.instanceId, "redirect-dns", redirect.fromHost);

  const resources: DeployResource[] = [
    {
      dependencies: [],
      inputs: {
        fromHost: redirect.fromHost,
        records: [
          {
            ...redirectPlaceholderDnsRecord,
            name: redirect.fromHost,
          },
        ],
      },
      kind: "cloudflare-dns-records",
      logicalId: dnsLogicalId,
      providerFamily: "cloudflare",
      targetId: input.targetId,
    },
    {
      dependencies: [{ logicalId: dnsLogicalId, reason: "redirect placeholder dns" }],
      inputs: {
        description: `Formless redirect ${redirect.fromHost} to ${targetHost}`,
        fromHost: redirect.fromHost,
        preservePath: redirect.preservePath,
        preserveQueryString: redirect.preserveQueryString,
        requestUrl: redirect.preservePath
          ? `https://${redirect.fromHost}/*`
          : `https://${redirect.fromHost}/`,
        statusCode: redirect.statusCode,
        targetHost,
        targetUrl,
      },
      kind: "cloudflare-redirect-rule",
      logicalId: deployLogicalResourceId(
        input.instanceId,
        "redirect-rule",
        redirect.fromHost,
        targetHost,
      ),
      providerFamily: "cloudflare",
      targetId: input.targetId,
    },
  ];

  return resources.sort(compareDeployResources);
}

type RedirectRouteIntent = {
  fromHost: string;
  preservePath: boolean;
  preserveQueryString: boolean;
  statusCode: ControlPlaneRedirectStatusCode;
  toHost?: string;
  toUrl?: string;
};

function redirectRouteIntent(
  route: ControlPlaneRouteProjectionRecord,
): RedirectRouteIntent | undefined {
  const fromHost = normalizeOptionalHost(route.matchHost);

  if (fromHost === undefined) {
    return undefined;
  }

  const toHost = normalizeOptionalHost(route.toHost);
  const toUrl = optionalText(route.toUrl);

  return {
    fromHost,
    preservePath: route.preservePath !== false,
    preserveQueryString: route.preserveQueryString !== false,
    statusCode: redirectStatusCode(route.statusCode),
    ...(toHost === undefined ? {} : { toHost }),
    ...(toUrl === undefined ? {} : { toUrl }),
  };
}

function routeTargetSurface(
  route: ControlPlaneRouteProjectionRecord,
): DeployRouteTargetProjection["surface"] | undefined {
  if (route.surface === "admin" || route.surface === "schema") {
    return route.surface;
  }

  if (route.surface === "public-site" || route.targetProfile === "public-site") {
    return "publicSite";
  }

  return undefined;
}

function domainMappingProfileFromRouteTarget(
  value: ControlPlaneRouteProjectionRecord["targetProfile"],
): ControlPlaneDomainMappingProfile | undefined {
  if (value === "app" || value === "instance") {
    return value;
  }

  if (value === "public-site") {
    return "publicSite";
  }

  return undefined;
}

function routeWorkerName(
  providerConfigId: string | undefined,
  input: {
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    workerName?: string;
  },
): string | undefined {
  if (providerConfigId === undefined) {
    return input.workerName;
  }

  return input.providerConfigs.get(providerConfigId)?.workerName ?? input.workerName;
}

function redirectStatusCode(
  value: ControlPlaneRouteProjectionRecord["statusCode"],
): ControlPlaneRedirectStatusCode {
  switch (value) {
    case 302:
    case "302":
      return 302;
    case 303:
    case "303":
      return 303;
    case 307:
    case "307":
      return 307;
    case 308:
    case "308":
      return 308;
    default:
      return 301;
  }
}

function canonicalizeDeployProjection(
  projection: DeployDesiredStateProjection,
): DeployDesiredStateProjection {
  return {
    resourceGraph: {
      resources: projection.resourceGraph.resources
        .map(canonicalizeDeployResource)
        .sort(compareDeployResources),
      targetId: projection.resourceGraph.targetId,
    },
    routeTargets: [...projection.routeTargets].sort(compareRouteTargets),
    sourceFingerprint: projection.sourceFingerprint,
    targetId: projection.targetId,
  };
}

function canonicalizeDeployResource(resource: DeployResource): DeployResource {
  return {
    dependencies: resource.dependencies
      .map((dependency) => ({
        logicalId: dependency.logicalId,
        ...(dependency.reason === undefined ? {} : { reason: dependency.reason }),
      }))
      .sort((left, right) => left.logicalId.localeCompare(right.logicalId)),
    inputs: canonicalizeDeployJsonObject(resource.inputs),
    kind: resource.kind,
    logicalId: resource.logicalId,
    providerFamily: resource.providerFamily,
    targetId: resource.targetId,
  };
}

function canonicalizeDeployJsonValue(value: DeployJsonValue): DeployJsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeDeployJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return canonicalizeDeployJsonObject(value);
}

function canonicalizeDeployJsonObject(value: Record<string, DeployJsonValue>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, canonicalizeDeployJsonValue(entryValue)]),
  );
}

function normalizeProviderConfigInputs(
  providerConfigs: readonly ControlPlaneProviderConfigProjectionRecord[],
  routes: readonly ControlPlaneRouteProjectionRecord[],
): DeployJsonValue[] {
  const referencedConfigIds = new Set(
    routes
      .filter((route) => route.enabled && route.providerConfig !== undefined)
      .map((route) => route.providerConfig ?? ""),
  );

  return providerConfigs
    .filter((providerConfig) => referencedConfigIds.has(providerConfig.id))
    .map((providerConfig) => ({
      id: providerConfig.id,
      providerFamily: providerConfig.providerFamily,
      workerName: providerConfig.workerName ?? null,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeRouteInputs(
  routes: readonly ControlPlaneRouteProjectionRecord[],
): DeployJsonValue[] {
  return routes
    .filter((route) => route.enabled)
    .map((route) => ({
      appInstall: route.appInstall ?? null,
      id: route.id,
      kind: route.kind,
      matchHost: normalizeOptionalHost(route.matchHost) ?? null,
      matchPath: route.matchPath,
      matchPrefix: route.matchPrefix ?? null,
      preservePath: route.kind === "redirect" ? route.preservePath !== false : null,
      preserveQueryString: route.kind === "redirect" ? route.preserveQueryString !== false : null,
      providerConfig: route.providerConfig ?? null,
      statusCode: route.kind === "redirect" ? redirectStatusCode(route.statusCode) : null,
      surface: route.surface ?? null,
      targetProfile: route.targetProfile ?? null,
      toHost: normalizeOptionalHost(route.toHost) ?? null,
      toUrl: route.toUrl ?? null,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function redirectTargetUrl(redirect: RedirectRouteIntent): string {
  const targetUrlBase =
    redirect.toUrl === undefined ? undefined : normalizeRedirectTargetUrlBase(redirect.toUrl);

  if (targetUrlBase !== undefined) {
    return redirect.preservePath ? `${targetUrlBase}/${"$"}{1}` : targetUrlBase;
  }

  const targetHost = redirect.toHost ?? redirect.fromHost;

  return redirect.preservePath ? `https://${targetHost}/${"$"}{1}` : `https://${targetHost}/`;
}

function normalizeRedirectTargetUrlBase(value: string): string | undefined {
  const normalized = optionalText(value);

  if (normalized === undefined) {
    return undefined;
  }

  try {
    const url = new URL(normalized);

    url.pathname = stripTrailingSlash(url.pathname);
    url.search = "";

    return url.toString().replace(/\/$/, "");
  } catch {
    return normalized;
  }
}

function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, "") || "/" : value;
}

function normalizeOptionalHost(value: string | undefined): string | undefined {
  const normalized = optionalText(value);

  return normalized === undefined ? undefined : normalizeHost(normalized);
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

function hostFromUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function compareDeployResources(left: DeployResource, right: DeployResource): number {
  return `${left.kind}\u0000${left.logicalId}`.localeCompare(
    `${right.kind}\u0000${right.logicalId}`,
  );
}

function compareRouteTargets(
  left: DeployRouteTargetProjection,
  right: DeployRouteTargetProjection,
): number {
  return `${left.path}\u0000${left.routeId}`.localeCompare(`${right.path}\u0000${right.routeId}`);
}
