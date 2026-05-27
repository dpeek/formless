import type { AlchemyOptions } from "alchemy";
import type { CustomDomain } from "alchemy/cloudflare";

import {
  type InstanceDomainProviderApplyJobResourceEvidence,
  type InstanceDomainProviderApplyReadyResponse,
} from "../shared/domain-provider-api.ts";
import type {
  DomainProviderApplyPolicy,
  DomainProviderCustomDomainResource,
  DomainProviderResource,
} from "../shared/domain-provider-protocol.ts";
import {
  applyAlchemyDomainProviderPlan,
  type AlchemyDomainProviderApplyResult,
  type AlchemyDomainProviderFactories,
  type AlchemyDomainProviderRunner,
} from "../worker/domain-provider-alchemy.ts";
import { normalizeFormlessInstanceWorkspaceTargetUrl } from "./instance-workspace-config.ts";
import {
  completeFormlessInstanceDomainProviderApplyJob,
  requestFormlessInstanceDomainProviderApply,
  type FormlessInstanceTargetClientDependencies,
} from "./instance-target-client.ts";

export const ALCHEMY_STATE_TOKEN_ENV_NAME = "ALCHEMY_STATE_TOKEN";

export type DomainProviderAlchemyRuntime = {
  factories: AlchemyDomainProviderFactories;
  password: string;
  rootDir?: string;
  runner: AlchemyDomainProviderRunner;
  stateStore: AlchemyOptions["stateStore"];
};

export type RunFormlessInstanceDomainProviderApplyInput = {
  adminToken?: string | null;
  host?: string | null;
  policy?: DomainProviderApplyPolicy;
  runnerId?: string | null;
  targetUrl: string;
};

export type RunFormlessInstanceDomainProviderApplyResult = {
  alchemy: AlchemyDomainProviderApplyResult;
  apply: InstanceDomainProviderApplyReadyResponse;
  completion: Awaited<ReturnType<typeof completeFormlessInstanceDomainProviderApplyJob>>;
  evidenceCount: number;
  runnerId: string;
  targetUrl: string;
};

export type RunFormlessInstanceDomainProviderApplyDependencies =
  FormlessInstanceTargetClientDependencies & {
    createRunnerId: () => string;
    env: NodeJS.ProcessEnv;
    runtime?: (input: {
      accountId: string;
      env: NodeJS.ProcessEnv;
    }) => Promise<DomainProviderAlchemyRuntime>;
  };

export async function runFormlessInstanceDomainProviderApply(
  input: RunFormlessInstanceDomainProviderApplyInput,
  dependencies: RunFormlessInstanceDomainProviderApplyDependencies,
): Promise<RunFormlessInstanceDomainProviderApplyResult> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const runnerId = normalizeRunnerId(input.runnerId ?? dependencies.createRunnerId());
  const apply = await requestFormlessInstanceDomainProviderApply(
    {
      adminToken: input.adminToken,
      request: {
        ...(input.host === null || input.host === undefined ? {} : { host: input.host }),
        ...(input.policy === undefined ? {} : { policy: input.policy }),
        runnerId,
      },
      targetUrl,
    },
    dependencies,
  );

  if (apply.status !== "ready") {
    throw new Error(`Domain provider apply did not create a runnable job: ${apply.code}.`);
  }

  const accountId = requireApplyAccountId(apply);
  const runtime = await (dependencies.runtime ?? nodeAlchemyDomainProviderRuntime)({
    accountId,
    env: dependencies.env,
  });

  try {
    const alchemy = await applyAlchemyDomainProviderPlan({
      appName: `formless-domain-${apply.plan.instanceId}`,
      factories: runtime.factories,
      password: runtime.password,
      plan: apply.job.plan,
      rootDir: runtime.rootDir,
      runner: runtime.runner,
      stateStore: runtime.stateStore,
    });
    const resources = applyEvidenceFromAlchemyResult({
      accountId,
      result: alchemy,
      runnerId,
      resources: apply.job.plan.resources,
    });
    const completion = await completeFormlessInstanceDomainProviderApplyJob(
      {
        adminToken: input.adminToken,
        jobId: apply.job.jobId,
        result: {
          resources,
          runnerId,
          status: "succeeded",
        },
        targetUrl,
      },
      dependencies,
    );

    return {
      alchemy,
      apply,
      completion,
      evidenceCount: resources.length,
      runnerId,
      targetUrl,
    };
  } catch (error) {
    await completeFormlessInstanceDomainProviderApplyJob(
      {
        adminToken: input.adminToken,
        jobId: apply.job.jobId,
        result: {
          error: errorMessage(error),
          runnerId,
          status: "failed",
        },
        targetUrl,
      },
      dependencies,
    );

    throw error;
  }
}

export async function nodeAlchemyDomainProviderRuntime(input: {
  accountId: string;
  env: NodeJS.ProcessEnv;
}): Promise<DomainProviderAlchemyRuntime> {
  const [{ default: alchemy }, cloudflare, state] = await Promise.all([
    import("alchemy"),
    import("alchemy/cloudflare"),
    import("alchemy/state"),
  ]);
  const alchemyPassword = requiredEnv(input.env, "ALCHEMY_PASSWORD");
  const alchemyStateToken = requiredEnv(input.env, ALCHEMY_STATE_TOKEN_ENV_NAME);
  const cloudflareApiToken = cloudflareApiTokenFromEnv(input.env);
  const apiToken = alchemy.secret(cloudflareApiToken);
  const stateToken = alchemy.secret(alchemyStateToken);

  return {
    factories: {
      CustomDomain: (id, props) =>
        cloudflare.CustomDomain(id, {
          ...props,
          accountId: input.accountId,
          apiToken,
        }),
      DnsRecords: (id, props) =>
        cloudflare.DnsRecords(id, {
          ...props,
          apiToken,
        }),
      RedirectRule: (id, props) =>
        cloudflare.RedirectRule(id, {
          ...props,
          apiToken,
        }),
    },
    password: alchemyPassword,
    runner: async (appName, options, apply) => {
      const app = await alchemy(appName, options);
      const result = await apply();

      await app.finalize();

      return result;
    },
    stateStore: (scope) =>
      new state.CloudflareStateStore(scope, {
        accountId: input.accountId,
        apiToken,
        stateToken,
      }),
  };
}

function applyEvidenceFromAlchemyResult(input: {
  accountId: string;
  resources: readonly DomainProviderResource[];
  result: AlchemyDomainProviderApplyResult;
  runnerId: string;
}): InstanceDomainProviderApplyJobResourceEvidence[] {
  const planned = new Map(input.resources.map((resource) => [resource.logicalId, resource]));
  const evidence: InstanceDomainProviderApplyJobResourceEvidence[] = [];

  for (const resourceResult of input.result.resources) {
    const resource = planned.get(resourceResult.logicalId);

    if (!resource) {
      throw new Error(
        `Domain provider runner output "${resourceResult.logicalId}" was not in the apply job.`,
      );
    }

    if (resource.kind !== "cloudflare-worker-custom-domain") {
      throw new Error(
        `Domain provider runner cannot write evidence for resource kind "${resource.kind}" yet.`,
      );
    }

    evidence.push(customDomainEvidence(input.accountId, resource, resourceResult.output));
  }

  return evidence;
}

function customDomainEvidence(
  accountId: string,
  resource: DomainProviderCustomDomainResource,
  output: unknown,
): InstanceDomainProviderApplyJobResourceEvidence {
  const customDomain = parseCustomDomainOutput(output, resource.logicalId);

  return {
    accountId,
    action: customDomainAction(resource),
    alchemyResourceId: resource.logicalId,
    host: resource.host,
    kind: resource.kind,
    logicalId: resource.logicalId,
    profile: resource.profile,
    ...(resource.targetInstallId === undefined
      ? {}
      : { targetInstallId: resource.targetInstallId }),
    workerDomainId: customDomain.id,
    workerName: resource.props.workerName,
    zoneId: resource.zone.id,
    zoneName: resource.zone.name,
  };
}

function parseCustomDomainOutput(output: unknown, logicalId: string): Pick<CustomDomain, "id"> {
  if (!isRecord(output) || typeof output.id !== "string" || output.id.trim() === "") {
    throw new Error(`Alchemy CustomDomain "${logicalId}" did not return a provider id.`);
  }

  return { id: output.id };
}

function customDomainAction(
  resource: DomainProviderCustomDomainResource,
): InstanceDomainProviderApplyJobResourceEvidence["action"] {
  if (resource.props.overrideExistingOrigin) {
    return "overridden";
  }

  if (resource.props.adopt) {
    return "adopted";
  }

  return "created";
}

function requireApplyAccountId(apply: InstanceDomainProviderApplyReadyResponse): string {
  const accountId = apply.config.accountId?.trim();

  if (!accountId) {
    throw new Error("Domain provider apply job did not include a Cloudflare account id.");
  }

  return accountId;
}

function normalizeRunnerId(value: string | null): string {
  const runnerId = value?.trim();

  if (!runnerId) {
    throw new Error("Domain provider runner id must be a non-empty string.");
  }

  return runnerId;
}

function cloudflareApiTokenFromEnv(env: NodeJS.ProcessEnv): string {
  const value = env.CLOUDFLARE_API_TOKEN?.trim() ?? env.CF_API_TOKEN?.trim();

  if (!value) {
    throw new Error("Domain provider runner requires CLOUDFLARE_API_TOKEN or CF_API_TOKEN.");
  }

  return value;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`Domain provider runner requires ${name}.`);
  }

  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
