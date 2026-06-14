import type { AlchemyOptions } from "alchemy";
import type {
  CustomDomain,
  CustomDomainProps,
  DnsRecords,
  DnsRecordsProps,
  RedirectRule,
  RedirectRuleProps,
} from "alchemy/cloudflare";
import type {
  DeployEvidenceSummary,
  DeployJsonValue,
  DeployResource,
  DeployResourceGraph,
} from "@dpeek/formless-deploy";
import type {
  DomainProviderCustomDomainResource,
  DomainProviderDnsRecordsResource,
  DomainProviderPlan,
  DomainProviderRedirectRuleResource,
  DomainProviderResource,
} from "../shared/domain-provider-protocol.ts";

export type AlchemyDomainProviderPhase = "destroy" | "read" | "up";

export type AlchemyDomainProviderRunOptions = Pick<
  AlchemyOptions,
  "adopt" | "noTrack" | "password" | "phase" | "quiet" | "rootDir" | "stage" | "stateStore"
>;

export type AlchemyDomainProviderRunner = <T>(
  appName: string,
  options: AlchemyDomainProviderRunOptions,
  apply: () => Promise<T>,
) => Promise<T>;

export type AlchemyDomainProviderFactories = {
  CustomDomain: (id: string, props: CustomDomainProps) => Promise<CustomDomain>;
  DnsRecords: (id: string, props: DnsRecordsProps) => Promise<DnsRecords>;
  RedirectRule: (id: string, props: RedirectRuleProps) => Promise<RedirectRule>;
};

export type AlchemyDeployResourceZoneResolverInput = {
  host: string;
  resource: DeployResource;
};

export type AlchemyDeployResourceZoneResolver = (
  input: AlchemyDeployResourceZoneResolverInput,
) => Promise<string | undefined> | string | undefined;

export type RunAlchemyDomainProviderPlanInput = {
  appName?: string;
  factories: AlchemyDomainProviderFactories;
  password?: string;
  phase?: AlchemyDomainProviderPhase;
  plan: DomainProviderPlan;
  rootDir?: string;
  runner: AlchemyDomainProviderRunner;
  stage?: string;
  stateStore?: AlchemyOptions["stateStore"];
};

export type RunAlchemyDeployResourceGraphInput = {
  adopt?: boolean;
  appName?: string;
  factories: AlchemyDomainProviderFactories;
  password?: string;
  phase?: AlchemyDomainProviderPhase;
  resourceGraph: DeployResourceGraph;
  resolveZoneIdForHost?: AlchemyDeployResourceZoneResolver;
  rootDir?: string;
  runner: AlchemyDomainProviderRunner;
  stage?: string;
  stateStore?: AlchemyOptions["stateStore"];
};

export type AlchemyDomainProviderResourceResult = {
  kind: DomainProviderResource["kind"];
  logicalId: string;
  output: unknown;
};

export type AlchemyDeployResourceGraphResourceResult = {
  kind: DeployResource["kind"];
  logicalId: string;
  output: unknown;
};

export type AlchemyDomainProviderRunResult = {
  appName: string;
  resources: AlchemyDomainProviderResourceResult[];
  stage: string;
};

export type AlchemyDeployResourceGraphApplyResult = {
  evidence: DeployEvidenceSummary[];
  resources: AlchemyDeployResourceGraphResourceResult[];
};

export type AlchemyDeployResourceGraphRunResult = AlchemyDeployResourceGraphApplyResult & {
  appName: string;
  stage: string;
  targetId: string;
};

export async function runAlchemyDomainProviderPlan(
  input: RunAlchemyDomainProviderPlanInput,
): Promise<AlchemyDomainProviderRunResult> {
  if (input.plan.blockers.length > 0) {
    throw new Error(
      `Domain provider plan has blockers: ${input.plan.blockers
        .map((blocker) => blocker.code)
        .join(", ")}.`,
    );
  }

  const appName = input.appName ?? `formless-domain-${input.plan.instanceId}`;
  const stage = input.stage ?? "production";

  return input.runner(
    appName,
    {
      noTrack: true,
      ...(input.password === undefined ? {} : { password: input.password }),
      phase: input.phase ?? "up",
      quiet: true,
      ...(input.rootDir === undefined ? {} : { rootDir: input.rootDir }),
      stage,
      ...(input.stateStore === undefined ? {} : { stateStore: input.stateStore }),
    },
    async () => ({
      appName,
      resources: await applyDomainProviderResources(input.plan.resources, input.factories),
      stage,
    }),
  );
}

export async function runAlchemyDeployResourceGraph(
  input: RunAlchemyDeployResourceGraphInput,
): Promise<AlchemyDeployResourceGraphRunResult> {
  const appName =
    input.appName ??
    `formless-deployment-${normalizeAlchemyNamePart(input.resourceGraph.targetId)}`;
  const stage = input.stage ?? "production";

  return input.runner(
    appName,
    {
      ...(input.adopt === undefined ? {} : { adopt: input.adopt }),
      ...(input.password === undefined ? {} : { password: input.password }),
      phase: input.phase ?? "up",
      quiet: true,
      ...(input.rootDir === undefined ? {} : { rootDir: input.rootDir }),
      stage,
      ...(input.stateStore === undefined ? {} : { stateStore: input.stateStore }),
    },
    async () => ({
      appName,
      ...(await applyAlchemyDeployResourceGraph({
        factories: input.factories,
        adopt: input.adopt,
        resolveZoneIdForHost: input.resolveZoneIdForHost,
        resourceGraph: input.resourceGraph,
      })),
      stage,
      targetId: input.resourceGraph.targetId,
    }),
  );
}

export async function applyAlchemyDeployResourceGraph(input: {
  adopt?: boolean;
  factories: AlchemyDomainProviderFactories;
  resolveZoneIdForHost?: AlchemyDeployResourceZoneResolver;
  resourceGraph: DeployResourceGraph;
}): Promise<AlchemyDeployResourceGraphApplyResult> {
  const resources: AlchemyDeployResourceGraphResourceResult[] = [];

  for (const resource of input.resourceGraph.resources) {
    const output = await applyDeployResourceGraphResource(resource, input);

    resources.push({
      kind: resource.kind,
      logicalId: resource.logicalId,
      output,
    });
  }

  return {
    evidence: resources.map((resourceResult) =>
      deploymentEvidenceFromAlchemyResult({
        result: resourceResult,
        resource:
          input.resourceGraph.resources.find(
            (resource) => resource.logicalId === resourceResult.logicalId,
          ) ?? missingResource(resourceResult.logicalId),
      }),
    ),
    resources,
  };
}

async function applyDomainProviderResources(
  resources: readonly DomainProviderResource[],
  factories: AlchemyDomainProviderFactories,
): Promise<AlchemyDomainProviderResourceResult[]> {
  const results: AlchemyDomainProviderResourceResult[] = [];

  for (const resource of resources) {
    results.push({
      kind: resource.kind,
      logicalId: resource.logicalId,
      output: await applyDomainProviderResource(resource, factories),
    });
  }

  return results;
}

function applyDomainProviderResource(
  resource: DomainProviderResource,
  factories: AlchemyDomainProviderFactories,
): Promise<unknown> {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      return applyCustomDomainResource(resource, factories);
    case "cloudflare-redirect-rule":
      return applyRedirectRuleResource(resource, factories);
    case "cloudflare-dns-records":
      return applyDnsRecordsResource(resource, factories);
  }
}

function applyCustomDomainResource(
  resource: DomainProviderCustomDomainResource,
  factories: AlchemyDomainProviderFactories,
): Promise<CustomDomain> {
  return factories.CustomDomain(resource.logicalId, resource.props);
}

function applyRedirectRuleResource(
  resource: DomainProviderRedirectRuleResource,
  factories: AlchemyDomainProviderFactories,
): Promise<RedirectRule> {
  return factories.RedirectRule(resource.logicalId, resource.props);
}

function applyDnsRecordsResource(
  resource: DomainProviderDnsRecordsResource,
  factories: AlchemyDomainProviderFactories,
): Promise<DnsRecords> {
  return factories.DnsRecords(resource.logicalId, resource.props);
}

async function applyDeployResourceGraphResource(
  resource: DeployResource,
  input: {
    adopt?: boolean;
    factories: AlchemyDomainProviderFactories;
    resolveZoneIdForHost?: AlchemyDeployResourceZoneResolver;
  },
): Promise<unknown> {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      return input.factories.CustomDomain(
        resource.logicalId,
        customDomainPropsFromDeployResource(resource, input.adopt),
      );
    case "cloudflare-dns-records":
      return input.factories.DnsRecords(
        resource.logicalId,
        await dnsRecordsPropsFromDeployResource(resource, input.resolveZoneIdForHost),
      );
    case "cloudflare-redirect-rule":
      return input.factories.RedirectRule(
        resource.logicalId,
        await redirectRulePropsFromDeployResource(resource, input.resolveZoneIdForHost),
      );
  }
}

function customDomainPropsFromDeployResource(
  resource: DeployResource,
  adoptOverride: boolean | undefined,
): CustomDomainProps {
  const name = requiredStringInput(resource, "name", optionalStringInput(resource, "host"));
  const workerName = requiredStringInput(resource, "workerName");
  const zoneId = optionalStringInput(resource, "zoneId");

  return {
    adopt: adoptOverride ?? booleanInput(resource, "adopt", false),
    name,
    overrideExistingOrigin: booleanInput(resource, "overrideExistingOrigin", false),
    workerName,
    ...(zoneId === undefined ? {} : { zoneId }),
  };
}

async function dnsRecordsPropsFromDeployResource(
  resource: DeployResource,
  resolveZoneIdForHost: AlchemyDeployResourceZoneResolver | undefined,
): Promise<DnsRecordsProps> {
  const records = dnsRecordsInput(resource);
  const host = optionalStringInput(resource, "fromHost") ?? records[0]?.name;
  const zoneId =
    optionalStringInput(resource, "zoneId") ??
    (host === undefined ? undefined : await resolveZoneId(resource, host, resolveZoneIdForHost));

  if (zoneId === undefined) {
    throw new Error(
      `Deployment resource "${resource.logicalId}" requires zoneId or a resolvable host for DNS records.`,
    );
  }

  return {
    records,
    zoneId,
  };
}

async function redirectRulePropsFromDeployResource(
  resource: DeployResource,
  resolveZoneIdForHost: AlchemyDeployResourceZoneResolver | undefined,
): Promise<RedirectRuleProps> {
  const targetUrl = requiredStringInput(resource, "targetUrl");
  const requestUrl = optionalStringInput(resource, "requestUrl");
  const fromHost =
    optionalStringInput(resource, "fromHost") ??
    (requestUrl === undefined ? undefined : hostFromUrl(requestUrl));
  const zone =
    optionalStringInput(resource, "zone") ??
    optionalStringInput(resource, "zoneId") ??
    (fromHost === undefined
      ? undefined
      : await resolveZoneId(resource, fromHost, resolveZoneIdForHost));

  if (zone === undefined) {
    throw new Error(
      `Deployment resource "${resource.logicalId}" requires zone, zoneId, or a resolvable host for redirect rules.`,
    );
  }

  return {
    ...(optionalStringInput(resource, "description") === undefined
      ? {}
      : { description: optionalStringInput(resource, "description") }),
    preserveQueryString: booleanInput(resource, "preserveQueryString", true),
    ...(requestUrl === undefined ? {} : { requestUrl }),
    statusCode: redirectStatusCodeInput(resource),
    targetUrl,
    zone,
  };
}

function deploymentEvidenceFromAlchemyResult(input: {
  resource: DeployResource;
  result: AlchemyDeployResourceGraphResourceResult;
}): DeployEvidenceSummary {
  return {
    action: "updated",
    alchemyResourceId: input.resource.logicalId,
    ...(resourceDisplayName(input.resource) === undefined
      ? {}
      : { displayName: resourceDisplayName(input.resource) }),
    kind: input.resource.kind,
    logicalId: input.resource.logicalId,
    providerFamily: input.resource.providerFamily,
    providerResourceIds: providerResourceIdsFromOutput(input.resource.kind, input.result.output),
    targetId: input.resource.targetId,
  };
}

function providerResourceIdsFromOutput(kind: DeployResource["kind"], output: unknown): string[] {
  const record = isRecord(output) ? output : {};

  switch (kind) {
    case "cloudflare-worker-custom-domain":
      return stringValues([record.id]);
    case "cloudflare-dns-records":
      return Array.isArray(record.records)
        ? stringValues(record.records.map((entry) => (isRecord(entry) ? entry.id : undefined)))
        : [];
    case "cloudflare-redirect-rule":
      return stringValues([record.ruleId, record.rulesetId]);
  }
}

function resourceDisplayName(resource: DeployResource): string | undefined {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      return optionalStringInput(resource, "host") ?? optionalStringInput(resource, "name");
    case "cloudflare-dns-records":
      return optionalStringInput(resource, "fromHost") ?? dnsRecordsInput(resource)[0]?.name;
    case "cloudflare-redirect-rule":
      return (
        optionalStringInput(resource, "fromHost") ?? optionalStringInput(resource, "requestUrl")
      );
  }
}

function dnsRecordsInput(resource: DeployResource): DnsRecordsProps["records"] {
  const records = resource.inputs.records;

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`Deployment resource "${resource.logicalId}" records input must be an array.`);
  }

  return records.map((record, index) => {
    if (!isRecord(record)) {
      throw new Error(
        `Deployment resource "${resource.logicalId}" records[${index}] input must be an object.`,
      );
    }

    return {
      content: requiredRecordString(record, "content", resource, index),
      name: requiredRecordString(record, "name", resource, index),
      proxied: record.proxied === true,
      ttl: numberRecordValue(record.ttl, 1),
      type: requiredRecordString(
        record,
        "type",
        resource,
        index,
      ) as DnsRecordsProps["records"][number]["type"],
    };
  });
}

function redirectStatusCodeInput(resource: DeployResource): RedirectRuleProps["statusCode"] {
  const value = resource.inputs.statusCode;

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

async function resolveZoneId(
  resource: DeployResource,
  host: string,
  resolveZoneIdForHost: AlchemyDeployResourceZoneResolver | undefined,
): Promise<string | undefined> {
  const resolved = await resolveZoneIdForHost?.({ host, resource });
  const normalized = resolved?.trim();

  return normalized ? normalized : undefined;
}

function requiredStringInput(resource: DeployResource, key: string, fallback?: string): string {
  const value = optionalStringInput(resource, key) ?? fallback;

  if (value === undefined) {
    throw new Error(`Deployment resource "${resource.logicalId}" ${key} input must be a string.`);
  }

  return value;
}

function optionalStringInput(resource: DeployResource, key: string): string | undefined {
  const value = resource.inputs[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanInput(resource: DeployResource, key: string, fallback: boolean): boolean {
  const value = resource.inputs[key];

  return typeof value === "boolean" ? value : fallback;
}

function requiredRecordString(
  record: Record<string, DeployJsonValue>,
  key: string,
  resource: DeployResource,
  index: number,
): string {
  const value = record[key];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error(
    `Deployment resource "${resource.logicalId}" records[${index}].${key} input must be a string.`,
  );
}

function numberRecordValue(value: DeployJsonValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValues(values: unknown[]): string[] {
  return values.filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
}

function isRecord(value: unknown): value is Record<string, DeployJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function normalizeAlchemyNamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function missingResource(logicalId: string): DeployResource {
  throw new Error(`Deployment resource "${logicalId}" was not found in the graph.`);
}
