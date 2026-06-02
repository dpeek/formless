import {
  canonicalizeDeploymentResourceGraph,
  deploymentResourceGraphCanonicalJson,
  type DeploymentResource,
  type DeploymentResourceGraph,
  type DeploymentDesiredStateSource,
  type DeploymentTarget,
} from "../shared/deployment-runtime.ts";
import type {
  DomainProviderRedirectIntent,
  DomainProviderRedirectStatusCode,
} from "../shared/domain-provider-protocol.ts";
import {
  domainProviderLogicalResourceId,
  domainProviderRedirectTargetUrl,
  normalizeDomainProviderRedirectIntent,
} from "../shared/domain-provider-planner.ts";
import { CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS } from "../shared/domain-provider-protocol.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import {
  readControlPlaneRecords,
  syncDeploymentProjectionToControlPlane,
} from "./deployment-control-plane-client.ts";
import { readDomainProviderRedirectIntents } from "./domain-provider-redirect-intents-state.ts";
import { readInstanceDomainMappings } from "./instance-domain-mappings-state.ts";

export type PrimaryInstanceDeploymentProjectionEnv = {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
};

export async function buildPrimaryInstanceDeploymentDesiredStateProjection(
  storage: DurableObjectStorage,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    now: string;
    requestUrl: string;
    target?: DeploymentTarget;
    targetId: DeploymentTarget["targetId"];
  },
) {
  const legacy = buildPrimaryInstanceDeploymentLegacyDesiredStateProjection(storage, input);
  const records = await readControlPlaneRecords({
    env: input.env,
    requestUrl: input.requestUrl,
  });

  if (records === undefined) {
    return legacy;
  }

  const projection = buildDeploymentDesiredStateProjectionFromControlPlaneRecords(records, {
    env: input.env,
    fallbackSource: legacy.source,
    targetId: input.targetId,
  });

  await syncDeploymentProjectionToControlPlane({
    env: input.env,
    now: input.now,
    requestUrl: input.requestUrl,
    resources: projection.resourceGraph.resources,
    sourceFingerprint: projection.source.fingerprint,
    target: input.target ?? {
      kind: "instance",
      targetId: input.targetId,
    },
  });

  return projection;
}

export function buildPrimaryInstanceDeploymentLegacyDesiredStateProjection(
  storage: DurableObjectStorage,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    targetId: DeploymentTarget["targetId"];
  },
) {
  const resources: DeploymentResource[] = [
    ...readInstanceDomainMappings(storage)
      .filter((mapping) => mapping.enabled)
      .map((mapping) =>
        deploymentCustomDomainResourceFromMapping(mapping, {
          env: input.env,
          targetId: input.targetId,
        }),
      ),
    ...readDomainProviderRedirectIntents(storage)
      .filter((intent) => intent.enabled)
      .flatMap((intent) =>
        deploymentRedirectResourcesFromIntent(intent, {
          env: input.env,
          targetId: input.targetId,
        }),
      ),
  ];
  const resourceGraph: DeploymentResourceGraph = {
    resources,
    targetId: input.targetId,
  };

  if (resourceGraph.resources.length === 0) {
    return {
      resourceGraph,
      source: { fingerprint: "intent:instance.primary.empty", intentRevision: 0 },
    };
  }

  return {
    resourceGraph,
    source: {
      fingerprint: `intent:instance.primary.domain-provider:${deploymentResourceGraphCanonicalJson(
        resourceGraph,
      )}`,
      intentRevision: resourceGraph.resources.length,
    },
  };
}

export function buildDeploymentDesiredStateProjectionFromControlPlaneRecords(
  records: readonly StoredRecord[],
  input: {
    env?: PrimaryInstanceDeploymentProjectionEnv;
    fallbackSource: DeploymentDesiredStateSource;
    targetId: DeploymentTarget["targetId"];
  },
): {
  resourceGraph: DeploymentResourceGraph;
  source: DeploymentDesiredStateSource;
} {
  const activeRecords = records.filter((record) => !record.deletedAt);
  const target = activeRecords.find(
    (record) =>
      record.entity === "deploy-target" &&
      record.values.targetId === input.targetId &&
      record.values.enabled === true,
  );
  const providerConfigs = providerConfigRecordsById(activeRecords);
  const routeProjectionInput = {
    env: input.env ?? {},
    providerConfigs,
    targetId: input.targetId,
  };
  const routeResources = activeRecords.flatMap((record) =>
    deploymentResourcesFromRouteRecord(record, routeProjectionInput),
  );
  const routeLogicalIds = new Set(
    records.flatMap((record) => deploymentRouteLogicalIds(record, routeProjectionInput)),
  );
  const desiredResourceRecords = activeRecords.filter(
    (record) =>
      record.entity === "deploy-desired-resource" &&
      record.values.deployTarget === (target?.id ?? input.targetId) &&
      record.values.enabled === true,
  );
  const desiredResources = desiredResourceRecords
    .map(deploymentResourceFromControlPlaneRecord)
    .filter((resource) => !routeLogicalIds.has(resource.logicalId));
  const resources = [...routeResources, ...desiredResources];
  const hasRouteIntent = records.some(isRouteProviderIntentRecord);
  const resourceGraph = canonicalizeDeploymentResourceGraph({
    resources,
    targetId: input.targetId,
  });
  const sourceFingerprint = firstStringValue(
    desiredResourceRecords.map((record) => record.values.sourceFingerprint),
  );

  if (resourceGraph.resources.length === 0) {
    return {
      resourceGraph,
      source: hasRouteIntent
        ? { fingerprint: `intent:${input.targetId}.routes.empty`, intentRevision: 0 }
        : input.fallbackSource,
    };
  }

  return {
    resourceGraph,
    source: {
      fingerprint:
        routeResources.length > 0 || hasRouteIntent
          ? `intent:${input.targetId}.routes:${deploymentResourceGraphCanonicalJson(resourceGraph)}`
          : (sourceFingerprint ??
            `intent:${input.targetId}.control-plane:${deploymentResourceGraphCanonicalJson(
              resourceGraph,
            )}`),
      intentRevision: resourceGraph.resources.length,
    },
  };
}

type ProviderConfigProjection = {
  workerName?: string;
};

function providerConfigRecordsById(
  records: readonly StoredRecord[],
): ReadonlyMap<string, ProviderConfigProjection> {
  const configs = new Map<string, ProviderConfigProjection>();

  for (const record of records) {
    if (record.entity !== "provider-config-ref" || record.values.providerFamily !== "cloudflare") {
      continue;
    }

    const workerName = optionalString(record.values.workerName);

    configs.set(record.id, workerName === undefined ? {} : { workerName });
  }

  return configs;
}

function deploymentResourcesFromRouteRecord(
  record: StoredRecord,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: DeploymentTarget["targetId"];
  },
): DeploymentResource[] {
  if (
    record.deletedAt ||
    record.entity !== "route" ||
    record.values.enabled !== true ||
    typeof record.values.matchHost !== "string"
  ) {
    return [];
  }

  if (record.values.kind === "mount") {
    const resource = deploymentCustomDomainResourceFromRoute(record, input);

    return resource === undefined ? [] : [resource];
  }

  if (record.values.kind === "redirect") {
    return deploymentRedirectResourcesFromRoute(record, input);
  }

  return [];
}

function deploymentRouteLogicalIds(
  record: StoredRecord,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: DeploymentTarget["targetId"];
  },
): string[] {
  if (record.entity !== "route" || typeof record.values.matchHost !== "string") {
    return [];
  }

  try {
    if (record.values.kind === "mount") {
      const resource = deploymentCustomDomainResourceFromRoute(record, input);

      return resource === undefined ? [] : [resource.logicalId];
    }

    if (record.values.kind === "redirect") {
      return deploymentRedirectResourcesFromRoute(record, input).map(
        (resource) => resource.logicalId,
      );
    }
  } catch {
    return [];
  }

  return [];
}

function isRouteProviderIntentRecord(record: StoredRecord): boolean {
  return (
    record.entity === "route" &&
    typeof record.values.matchHost === "string" &&
    (record.values.kind === "mount" || record.values.kind === "redirect")
  );
}

function deploymentCustomDomainResourceFromRoute(
  record: StoredRecord,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: DeploymentTarget["targetId"];
  },
): DeploymentResource | undefined {
  const host = optionalString(record.values.matchHost);
  const profile = domainMappingProfileFromRouteTarget(record.values.targetProfile);

  if (host === undefined || profile === undefined) {
    return undefined;
  }

  const targetInstallId = optionalString(record.values.appInstall);
  const workerName = routeWorkerName(record.values.providerConfig, input);

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
    logicalId: domainProviderLogicalResourceId(
      optionalDeploymentEnv(input.env.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID) ??
        "unconfigured-instance",
      "custom-domain",
      host,
      profile,
      targetInstallId,
    ),
    providerFamily: "cloudflare",
    targetId: input.targetId,
  };
}

function deploymentRedirectResourcesFromRoute(
  record: StoredRecord,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
    targetId: DeploymentTarget["targetId"];
  },
): DeploymentResource[] {
  const fromHost = optionalString(record.values.matchHost);

  if (fromHost === undefined) {
    return [];
  }

  return deploymentRedirectResourcesFromIntent(
    {
      enabled: true,
      fromHost,
      preservePath: record.values.preservePath !== false,
      preserveQueryString: record.values.preserveQueryString !== false,
      statusCode: redirectStatusCodeFromRoute(record.values.statusCode),
      ...(optionalString(record.values.toHost) === undefined
        ? {}
        : { toHost: optionalString(record.values.toHost) }),
      ...(optionalString(record.values.toUrl) === undefined
        ? {}
        : { toUrl: optionalString(record.values.toUrl) }),
    },
    input,
  );
}

function domainMappingProfileFromRouteTarget(
  value: unknown,
): InstanceDomainMapping["profile"] | undefined {
  if (value === "instance" || value === "app") {
    return value;
  }

  if (value === "public-site") {
    return "publicSite";
  }

  return undefined;
}

function routeWorkerName(
  providerConfigId: unknown,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    providerConfigs: ReadonlyMap<string, ProviderConfigProjection>;
  },
): string | undefined {
  const providerConfig = optionalString(providerConfigId);

  if (providerConfig !== undefined) {
    return (
      input.providerConfigs.get(providerConfig)?.workerName ??
      optionalDeploymentEnv(input.env.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME)
    );
  }

  return optionalDeploymentEnv(input.env.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME);
}

function redirectStatusCodeFromRoute(value: unknown): DomainProviderRedirectStatusCode {
  switch (value) {
    case "302":
      return 302;
    case "303":
      return 303;
    case "307":
      return 307;
    case "308":
      return 308;
    default:
      return 301;
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function deploymentCustomDomainResourceFromMapping(
  mapping: InstanceDomainMapping,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    targetId: DeploymentTarget["targetId"];
  },
): DeploymentResourceGraph["resources"][number] {
  const workerName = optionalDeploymentEnv(input.env.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME);

  return {
    dependencies: [],
    inputs: {
      adopt: false,
      host: mapping.host,
      name: mapping.host,
      overrideExistingOrigin: false,
      profile: mapping.profile,
      ...(mapping.targetInstallId === undefined
        ? {}
        : { targetInstallId: mapping.targetInstallId }),
      ...(workerName === undefined ? {} : { workerName }),
    },
    kind: "cloudflare-worker-custom-domain",
    logicalId: domainProviderLogicalResourceId(
      optionalDeploymentEnv(input.env.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID) ??
        "unconfigured-instance",
      "custom-domain",
      mapping.host,
      mapping.profile,
      mapping.targetInstallId,
    ),
    providerFamily: "cloudflare",
    targetId: input.targetId,
  };
}

function deploymentRedirectResourcesFromIntent(
  intent: DomainProviderRedirectIntent,
  input: {
    env: PrimaryInstanceDeploymentProjectionEnv;
    targetId: DeploymentTarget["targetId"];
  },
): DeploymentResource[] {
  const normalized = normalizeDomainProviderRedirectIntent(intent);

  if (!normalized.ok) {
    throw new Error(normalized.blocker.message);
  }

  const instanceId =
    optionalDeploymentEnv(input.env.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID) ??
    "unconfigured-instance";
  const redirect = normalized.redirect;
  const dnsLogicalId = domainProviderLogicalResourceId(
    instanceId,
    "redirect-dns",
    redirect.fromHost,
  );
  const targetUrl = domainProviderRedirectTargetUrl(redirect);

  return [
    {
      dependencies: [],
      inputs: {
        fromHost: redirect.fromHost,
        records: [
          {
            ...CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS,
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
        description: `Formless redirect ${redirect.fromHost} to ${redirect.targetHost}`,
        fromHost: redirect.fromHost,
        preservePath: redirect.preservePath,
        preserveQueryString: redirect.preserveQueryString,
        requestUrl: redirect.preservePath
          ? `https://${redirect.fromHost}/*`
          : `https://${redirect.fromHost}/`,
        statusCode: redirect.statusCode,
        targetHost: redirect.targetHost,
        targetUrl,
      },
      kind: "cloudflare-redirect-rule",
      logicalId: domainProviderLogicalResourceId(
        instanceId,
        "redirect-rule",
        redirect.fromHost,
        redirect.targetHost,
      ),
      providerFamily: "cloudflare",
      targetId: input.targetId,
    },
  ];
}

function deploymentResourceFromControlPlaneRecord(record: StoredRecord): DeploymentResource {
  return {
    dependencies: parseJsonArray(record.values.dependenciesJson),
    inputs: parseJsonObject(record.values.inputsJson),
    kind: String(record.values.kind) as DeploymentResource["kind"],
    logicalId: String(record.values.logicalId),
    providerFamily: String(record.values.providerFamily) as DeploymentResource["providerFamily"],
    targetId: String(record.values.deployTarget) as DeploymentResource["targetId"],
  };
}

function parseJsonObject(value: unknown): DeploymentResource["inputs"] {
  if (typeof value !== "string") {
    return {};
  }

  const parsed = JSON.parse(value) as unknown;

  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as DeploymentResource["inputs"];
  }

  throw new Error("Control-plane deploy-desired-resource inputsJson must be an object.");
}

function parseJsonArray(value: unknown): DeploymentResource["dependencies"] {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string") {
    throw new Error("Control-plane deploy-desired-resource dependenciesJson must be a string.");
  }

  const parsed = JSON.parse(value) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as DeploymentResource["dependencies"];
  }

  throw new Error("Control-plane deploy-desired-resource dependenciesJson must be an array.");
}

function firstStringValue(values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string");
}

function optionalDeploymentEnv(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
