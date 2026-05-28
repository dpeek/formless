import {
  DEPLOY_PUBLIC_CONTRACT_VERSION,
  type ControlPlaneAppRouteProjectionRecord,
  type ControlPlaneDomainMappingProjectionRecord,
  type ControlPlaneRedirectIntentProjectionRecord,
  type DeployDesiredStateProjection,
  type DeployDesiredStateProjectionInput,
  type DeployJsonValue,
  type DeployProjectionHashInput,
  type DeployResource,
  type DeployRouteTargetProjection,
} from "./types.ts";

export {
  DEPLOY_ACTOR_KINDS,
  DEPLOY_CONTROL_PLANE_ACTION_IDS,
  DEPLOY_PUBLIC_CONTRACT_VERSION,
} from "./types.ts";
export type {
  ControlPlaneAppRouteKind,
  ControlPlaneAppRouteProjectionRecord,
  ControlPlaneAppRouteSurface,
  ControlPlaneDomainMappingProfile,
  ControlPlaneDomainMappingProjectionRecord,
  ControlPlaneRedirectIntentProjectionRecord,
  ControlPlaneRedirectStatusCode,
  DeployActor,
  DeployActorKind,
  DeployAttemptMode,
  DeployAttemptStatus,
  DeployAttemptSummary,
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

export function projectDeployControlPlaneDesiredState(
  input: DeployDesiredStateProjectionInput,
): DeployDesiredStateProjection {
  const routeTargets = projectDeployRouteTargets(input.appRoutes ?? []);
  const resources = [
    ...projectDomainMappingResources(input.domainMappings ?? [], {
      instanceId: input.instanceId,
      routeTargets,
      targetId: input.targetId,
      workerName: input.workerName,
    }),
    ...projectRedirectIntentResources(input.redirectIntents ?? [], {
      instanceId: input.instanceId,
      targetId: input.targetId,
    }),
  ].sort(compareDeployResources);
  const projectionIntent = {
    domainMappings: normalizeDomainMappingInputs(input.domainMappings ?? []),
    redirectIntents: normalizeRedirectIntentInputs(input.redirectIntents ?? []),
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
  routes: readonly ControlPlaneAppRouteProjectionRecord[],
): DeployRouteTargetProjection[] {
  return routes
    .filter((route) => route.enabled)
    .map((route) => ({
      appInstallId: route.appInstallId,
      packageAppKey: route.packageAppKey,
      path: route.path,
      ...(route.prefix === undefined ? {} : { prefix: route.prefix }),
      routeId: route.id,
      routeKind: route.routeKind,
      surface: route.surface,
    }))
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

function projectDomainMappingResources(
  mappings: readonly ControlPlaneDomainMappingProjectionRecord[],
  input: {
    instanceId: string;
    routeTargets: readonly DeployRouteTargetProjection[];
    targetId: string;
    workerName?: string;
  },
): DeployResource[] {
  const routeTargetsById = new Map(input.routeTargets.map((route) => [route.routeId, route]));

  return mappings
    .filter((mapping) => mapping.enabled)
    .map((mapping) => {
      const routeTarget =
        mapping.appRouteId === undefined ? undefined : routeTargetsById.get(mapping.appRouteId);

      return {
        dependencies: [],
        inputs: {
          adopt: false,
          host: normalizeHost(mapping.host),
          name: normalizeHost(mapping.host),
          overrideExistingOrigin: false,
          profile: mapping.profile,
          ...(mapping.appInstallId === undefined ? {} : { appInstallId: mapping.appInstallId }),
          ...(mapping.appRouteId === undefined ? {} : { appRouteId: mapping.appRouteId }),
          ...(routeTarget === undefined ? {} : { routePath: routeTarget.path }),
          ...(input.workerName === undefined ? {} : { workerName: input.workerName }),
        },
        kind: "cloudflare-worker-custom-domain",
        logicalId: deployLogicalResourceId(
          input.instanceId,
          "custom-domain",
          mapping.host,
          mapping.profile,
          mapping.appInstallId,
          mapping.appRouteId,
        ),
        providerFamily: "cloudflare",
        targetId: input.targetId,
      } satisfies DeployResource;
    })
    .sort(compareDeployResources);
}

function projectRedirectIntentResources(
  redirects: readonly ControlPlaneRedirectIntentProjectionRecord[],
  input: { instanceId: string; targetId: string },
): DeployResource[] {
  return redirects
    .filter((redirect) => redirect.enabled)
    .flatMap((redirect) => {
      const fromHost = normalizeHost(redirect.fromHost);
      const targetUrl = redirectTargetUrl(redirect);
      const targetHost = redirect.toHost ?? hostFromUrl(redirect.toUrl) ?? "";
      const dnsLogicalId = deployLogicalResourceId(input.instanceId, "redirect-dns", fromHost);

      const resources: DeployResource[] = [
        {
          dependencies: [],
          inputs: {
            fromHost,
            records: [
              {
                ...redirectPlaceholderDnsRecord,
                name: fromHost,
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
            description: `Formless redirect ${fromHost} to ${targetHost}`,
            fromHost,
            preservePath: redirect.preservePath,
            preserveQueryString: redirect.preserveQueryString,
            requestUrl: redirect.preservePath ? `https://${fromHost}/*` : `https://${fromHost}/`,
            statusCode: redirect.statusCode,
            targetHost,
            targetUrl,
          },
          kind: "cloudflare-redirect-rule",
          logicalId: deployLogicalResourceId(
            input.instanceId,
            "redirect-rule",
            fromHost,
            targetHost,
          ),
          providerFamily: "cloudflare",
          targetId: input.targetId,
        },
      ];

      return resources;
    })
    .sort(compareDeployResources);
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

function normalizeDomainMappingInputs(
  mappings: readonly ControlPlaneDomainMappingProjectionRecord[],
): DeployJsonValue[] {
  return mappings
    .filter((mapping) => mapping.enabled)
    .map((mapping) => ({
      appInstallId: mapping.appInstallId ?? null,
      appRouteId: mapping.appRouteId ?? null,
      host: normalizeHost(mapping.host),
      id: mapping.id,
      profile: mapping.profile,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function normalizeRedirectIntentInputs(
  redirects: readonly ControlPlaneRedirectIntentProjectionRecord[],
): DeployJsonValue[] {
  return redirects
    .filter((redirect) => redirect.enabled)
    .map((redirect) => ({
      fromHost: normalizeHost(redirect.fromHost),
      id: redirect.id,
      preservePath: redirect.preservePath,
      preserveQueryString: redirect.preserveQueryString,
      statusCode: redirect.statusCode,
      toHost: redirect.toHost ?? null,
      toUrl: redirect.toUrl ?? null,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function redirectTargetUrl(redirect: ControlPlaneRedirectIntentProjectionRecord): string {
  if (redirect.toUrl !== undefined) {
    return redirect.toUrl;
  }

  const targetHost = redirect.toHost ?? redirect.fromHost;

  return redirect.preservePath ? `https://${targetHost}/${"$"}{1}` : `https://${targetHost}/`;
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
