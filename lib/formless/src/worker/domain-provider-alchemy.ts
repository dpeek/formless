import type { AlchemyOptions } from "alchemy";
import type {
  CustomDomain,
  CustomDomainProps,
  DnsRecords,
  DnsRecordsProps,
  EmailSender,
  EmailSenderProps,
} from "alchemy/cloudflare";
import type {
  DeployEvidenceSummary,
  DeployJsonValue,
  DeployResource,
  DeployResourceGraph,
} from "@dpeek/formless-deploy";
import type {
  DomainProviderCustomDomainResource,
  DomainProviderPlan,
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

export type CloudflareEmailSendingDomainProps = Omit<DnsRecordsProps, "records"> & {
  domain: string;
  name: string;
};

export type CloudflareEmailSendingDomain = {
  dkimSelector?: string;
  enabled?: boolean;
  id?: string;
  name: string;
  returnPathDomain?: string;
  tag?: string;
  zoneId: string;
};

export type CloudflareWorkerSendEmailBindingProps = EmailSenderProps & {
  bindingName: string;
  domain: string;
  workerName?: string;
};

export type AlchemyDomainProviderFactories = {
  CustomDomain: (id: string, props: CustomDomainProps) => Promise<CustomDomain>;
  DnsRecords: (id: string, props: DnsRecordsProps) => Promise<DnsRecords>;
  EmailSendingDomain?: (
    id: string,
    props: CloudflareEmailSendingDomainProps,
  ) => Promise<CloudflareEmailSendingDomain>;
  SendEmailBinding?: (
    id: string,
    props: CloudflareWorkerSendEmailBindingProps,
  ) => Promise<EmailSender>;
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
  }
}

function applyCustomDomainResource(
  resource: DomainProviderCustomDomainResource,
  factories: AlchemyDomainProviderFactories,
): Promise<CustomDomain> {
  return factories.CustomDomain(resource.logicalId, resource.props);
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
    case "cloudflare-email-sending-domain":
      return requiredFactory(
        input.factories.EmailSendingDomain,
        resource,
        "Cloudflare Email Sending domain",
      )(
        resource.logicalId,
        await emailSendingDomainPropsFromDeployResource(resource, input.resolveZoneIdForHost),
      );
    case "cloudflare-worker-send-email-binding":
      return requiredFactory(
        input.factories.SendEmailBinding,
        resource,
        "Cloudflare Worker send-email binding",
      )(resource.logicalId, sendEmailBindingPropsFromDeployResource(resource));
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

async function emailSendingDomainPropsFromDeployResource(
  resource: DeployResource,
  resolveZoneIdForHost: AlchemyDeployResourceZoneResolver | undefined,
): Promise<CloudflareEmailSendingDomainProps> {
  const domain = requiredStringInput(resource, "domain", optionalStringInput(resource, "name"));
  const zoneId =
    optionalStringInput(resource, "zoneId") ??
    (await resolveZoneId(resource, domain, resolveZoneIdForHost));

  if (zoneId === undefined) {
    throw new Error(
      `Deployment resource "${resource.logicalId}" requires zoneId or a resolvable domain for Email Sending.`,
    );
  }

  return {
    domain,
    name: optionalStringInput(resource, "name") ?? domain,
    zoneId,
  };
}

function sendEmailBindingPropsFromDeployResource(
  resource: DeployResource,
): CloudflareWorkerSendEmailBindingProps {
  const allowedSenderAddresses = stringArrayInput(resource, "allowedSenderAddresses");

  if (allowedSenderAddresses.length === 0) {
    throw new Error(
      `Deployment resource "${resource.logicalId}" allowedSenderAddresses input must not be empty.`,
    );
  }

  return {
    allowedSenderAddresses,
    bindingName: requiredStringInput(resource, "bindingName"),
    domain: requiredStringInput(resource, "domain"),
    ...(optionalStringInput(resource, "workerName") === undefined
      ? {}
      : { workerName: optionalStringInput(resource, "workerName") }),
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
    case "cloudflare-email-sending-domain":
      return uniqueStringValues([record.id, record.tag]);
    case "cloudflare-worker-send-email-binding":
      return uniqueStringValues([record.bindingName, record.name]);
  }
}

function resourceDisplayName(resource: DeployResource): string | undefined {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      return optionalStringInput(resource, "host") ?? optionalStringInput(resource, "name");
    case "cloudflare-dns-records":
      return optionalStringInput(resource, "fromHost") ?? dnsRecordsInput(resource)[0]?.name;
    case "cloudflare-email-sending-domain":
      return optionalStringInput(resource, "domain") ?? optionalStringInput(resource, "name");
    case "cloudflare-worker-send-email-binding":
      return (
        optionalStringInput(resource, "domain") ?? optionalStringInput(resource, "bindingName")
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

function stringArrayInput(resource: DeployResource, key: string): string[] {
  const value = resource.inputs[key];

  if (!Array.isArray(value)) {
    throw new Error(`Deployment resource "${resource.logicalId}" ${key} input must be an array.`);
  }

  return value.map((entry, index) => {
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }

    throw new Error(
      `Deployment resource "${resource.logicalId}" ${key}[${index}] input must be a string.`,
    );
  });
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

function uniqueStringValues(values: unknown[]): string[] {
  return [...new Set(stringValues(values))];
}

function requiredFactory<T>(factory: T | undefined, resource: DeployResource, label: string): T {
  if (factory === undefined) {
    throw new Error(`Deployment resource "${resource.logicalId}" requires ${label} factory.`);
  }

  return factory;
}

function isRecord(value: unknown): value is Record<string, DeployJsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
