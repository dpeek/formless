import {
  deploymentResourceGraphCanonicalJson,
  type DeploymentResource,
  type DeploymentResourceGraph,
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
import { readDomainProviderRedirectIntents } from "./domain-provider-redirect-intents-state.ts";
import { readInstanceDomainMappings } from "./instance-domain-mappings-state.ts";

export type PrimaryInstanceDeploymentProjectionEnv = {
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
};

export function buildPrimaryInstanceDeploymentDesiredStateProjection(
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

function optionalDeploymentEnv(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
