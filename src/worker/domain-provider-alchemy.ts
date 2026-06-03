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
  DomainProviderCustomDomainResource,
  DomainProviderDnsRecordsResource,
  DomainProviderPlan,
  DomainProviderRedirectRuleResource,
  DomainProviderResource,
} from "../shared/domain-provider-protocol.ts";

export type AlchemyDomainProviderPhase = "destroy" | "read" | "up";

export type AlchemyDomainProviderRunOptions = Pick<
  AlchemyOptions,
  "noTrack" | "password" | "phase" | "quiet" | "rootDir" | "stage" | "stateStore"
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

export type AlchemyDomainProviderResourceResult = {
  kind: DomainProviderResource["kind"];
  logicalId: string;
  output: unknown;
};

export type AlchemyDomainProviderRunResult = {
  appName: string;
  resources: AlchemyDomainProviderResourceResult[];
  stage: string;
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
