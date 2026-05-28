import {
  canonicalizeDeploymentResourceGraph,
  deploymentResourceGraphCanonicalJson,
  type DeploymentResource,
  type DeploymentResourceGraph,
  type DeploymentDesiredStateSource,
  type DeploymentTarget,
} from "../shared/deployment-runtime.ts";
import type { InstanceDomainProviderRedirectIntent } from "../shared/domain-provider-api.ts";
import {
  domainProviderLogicalResourceId,
  domainProviderRedirectTargetUrl,
  normalizeDomainProviderRedirectIntent,
} from "../shared/domain-provider-planner.ts";
import { CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS } from "../shared/domain-provider-protocol.ts";
import type { InstanceDomainMapping } from "../shared/instance-domain-mappings.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import { syncDeploymentProjectionToControlPlane } from "./deployment-control-plane-client.ts";
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
  const records = await syncDeploymentProjectionToControlPlane({
    env: input.env,
    now: input.now,
    requestUrl: input.requestUrl,
    resources: legacy.resourceGraph.resources,
    sourceFingerprint: legacy.source.fingerprint,
    target: input.target ?? {
      kind: "instance",
      targetId: input.targetId,
    },
  });

  return records === undefined
    ? legacy
    : buildDeploymentDesiredStateProjectionFromControlPlaneRecords(records, {
        fallbackSource: legacy.source,
        targetId: input.targetId,
      });
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
      record.entity === "deployTarget" &&
      record.values.targetId === input.targetId &&
      record.values.enabled === true,
  );
  const resources = activeRecords
    .filter(
      (record) =>
        record.entity === "deployDesiredResource" &&
        record.values.deployTarget === (target?.id ?? input.targetId) &&
        record.values.enabled === true,
    )
    .map(deploymentResourceFromControlPlaneRecord);
  const resourceGraph = canonicalizeDeploymentResourceGraph({
    resources,
    targetId: input.targetId,
  });
  const sourceFingerprint = firstStringValue(
    activeRecords
      .filter(
        (record) =>
          record.entity === "deployDesiredResource" &&
          record.values.deployTarget === (target?.id ?? input.targetId) &&
          record.values.enabled === true,
      )
      .map((record) => record.values.sourceFingerprint),
  );

  if (resourceGraph.resources.length === 0) {
    return {
      resourceGraph,
      source: input.fallbackSource,
    };
  }

  return {
    resourceGraph,
    source: {
      fingerprint:
        sourceFingerprint ??
        `intent:${input.targetId}.control-plane:${deploymentResourceGraphCanonicalJson(
          resourceGraph,
        )}`,
      intentRevision: resourceGraph.resources.length,
    },
  };
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
  intent: InstanceDomainProviderRedirectIntent,
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

  throw new Error("Control-plane deployDesiredResource inputsJson must be an object.");
}

function parseJsonArray(value: unknown): DeploymentResource["dependencies"] {
  if (value === undefined) {
    return [];
  }

  if (typeof value !== "string") {
    throw new Error("Control-plane deployDesiredResource dependenciesJson must be a string.");
  }

  const parsed = JSON.parse(value) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as DeploymentResource["dependencies"];
  }

  throw new Error("Control-plane deployDesiredResource dependenciesJson must be an array.");
}

function firstStringValue(values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string");
}

function optionalDeploymentEnv(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
