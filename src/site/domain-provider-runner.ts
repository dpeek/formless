import type { AlchemyOptions } from "alchemy";

import {
  type InstanceDomainProviderDeleteJobResourceEvidence,
  type InstanceDomainProviderDeleteReadyResponse,
} from "../shared/domain-provider-api.ts";
import type {
  DomainProviderPlan,
  DomainProviderResourceKind,
} from "../shared/domain-provider-protocol.ts";
import {
  type AlchemyDomainProviderFactories,
  type AlchemyDomainProviderRunResult,
  type AlchemyDomainProviderRunner,
  runAlchemyDomainProviderPlan,
} from "../worker/domain-provider-alchemy.ts";
import { normalizeFormlessInstanceWorkspaceTargetUrl } from "./instance-workspace-config.ts";
import {
  completeFormlessInstanceDomainProviderDeleteJob,
  requestFormlessInstanceDomainProviderDelete,
  type FormlessInstanceTargetClientDependencies,
} from "./instance-target-client.ts";

export const ALCHEMY_STATE_TOKEN_ENV_NAME = "ALCHEMY_STATE_TOKEN";

export type DomainProviderAlchemyRuntime = {
  appName?: string;
  factories: AlchemyDomainProviderFactories;
  password: string;
  rootDir?: string;
  runner: AlchemyDomainProviderRunner;
  stage?: string;
  stateStore?: AlchemyOptions["stateStore"];
};

export type RunFormlessInstanceDomainProviderDeleteInput = {
  adminToken?: string | null;
  host?: string | null;
  kind?: DomainProviderResourceKind | null;
  logicalId?: string | null;
  runnerId?: string | null;
  targetUrl: string;
};

export type RunFormlessInstanceDomainProviderDeleteResult = {
  alchemy: AlchemyDomainProviderRunResult;
  delete: InstanceDomainProviderDeleteReadyResponse;
  completion: Awaited<ReturnType<typeof completeFormlessInstanceDomainProviderDeleteJob>>;
  evidenceCount: number;
  runnerId: string;
  targetUrl: string;
};

export type RunFormlessInstanceDomainProviderDeleteDependencies =
  FormlessInstanceTargetClientDependencies & {
    createRunnerId: () => string;
    env: NodeJS.ProcessEnv;
    runtime?: (input: {
      accountId: string;
      env: NodeJS.ProcessEnv;
    }) => Promise<DomainProviderAlchemyRuntime>;
  };

export async function runFormlessInstanceDomainProviderDelete(
  input: RunFormlessInstanceDomainProviderDeleteInput,
  dependencies: RunFormlessInstanceDomainProviderDeleteDependencies,
): Promise<RunFormlessInstanceDomainProviderDeleteResult> {
  const targetUrl = normalizeFormlessInstanceWorkspaceTargetUrl(input.targetUrl);
  const runnerId = normalizeRunnerId(input.runnerId ?? dependencies.createRunnerId());
  const deleteJob = await requestFormlessInstanceDomainProviderDelete(
    {
      adminToken: input.adminToken,
      request: {
        ...(input.host === null || input.host === undefined ? {} : { host: input.host }),
        ...(input.kind === null || input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.logicalId === null || input.logicalId === undefined
          ? {}
          : { logicalId: input.logicalId }),
        runnerId,
      },
      targetUrl,
    },
    dependencies,
  );

  if (deleteJob.status !== "ready") {
    throw new Error(`Domain provider delete did not create a runnable job: ${deleteJob.code}.`);
  }

  const accountId = requireConfiguredAccountId(deleteJob.config.accountId);

  try {
    const runtime = await (dependencies.runtime ?? nodeAlchemyDomainProviderRuntime)({
      accountId,
      env: dependencies.env,
    });

    const alchemy = await destroyDomainProviderDeleteTargets({
      appName: domainProviderAlchemyAppName(runtime, deleteJob.plan),
      plan: deleteJob.job.plan,
      runtime,
      rootDir: runtime.rootDir,
      stage: domainProviderAlchemyStage(runtime),
      targets: deleteJob.job.targets,
    });
    const resources = deleteEvidenceFromAlchemyResult({
      result: alchemy,
      targets: deleteJob.job.targets,
    });
    const completion = await completeFormlessInstanceDomainProviderDeleteJob(
      {
        adminToken: input.adminToken,
        jobId: deleteJob.job.jobId,
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
      completion,
      delete: deleteJob,
      evidenceCount: resources.length,
      runnerId,
      targetUrl,
    };
  } catch (error) {
    await completeFormlessInstanceDomainProviderDeleteJob(
      {
        adminToken: input.adminToken,
        jobId: deleteJob.job.jobId,
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

async function destroyDomainProviderDeleteTargets(input: {
  appName: string;
  plan: InstanceDomainProviderDeleteReadyResponse["plan"];
  rootDir?: string;
  runtime: DomainProviderAlchemyRuntime;
  stage?: string;
  targets: Readonly<InstanceDomainProviderDeleteReadyResponse["targets"]>;
}): Promise<AlchemyDomainProviderRunResult> {
  const plannedResources = new Map(
    input.plan.resources.map((resource) => [resource.logicalId, resource]),
  );
  const resources: AlchemyDomainProviderRunResult["resources"] = [];
  let stage = input.stage ?? "production";

  for (const target of input.targets) {
    const resource = plannedResources.get(target.logicalId);

    if (!resource) {
      throw new Error(`Domain provider delete target "${target.logicalId}" was not in the plan.`);
    }

    try {
      const result = await runAlchemyDomainProviderPlan({
        appName: input.appName,
        factories: input.runtime.factories,
        password: input.runtime.password,
        phase: "destroy",
        plan: {
          ...input.plan,
          resources: [resource],
        },
        rootDir: input.rootDir,
        runner: input.runtime.runner,
        stage: input.stage,
        stateStore: input.runtime.stateStore,
      });

      stage = result.stage;
      resources.push(...result.resources);
    } catch (error) {
      if (!isProviderNotFoundError(error)) {
        throw error;
      }

      resources.push({
        kind: target.kind,
        logicalId: target.logicalId,
        output: { status: "already-missing" },
      });
    }
  }

  return {
    appName: input.appName,
    resources,
    stage,
  };
}

function domainProviderAlchemyAppName(
  runtime: DomainProviderAlchemyRuntime,
  plan: DomainProviderPlan,
): string {
  return runtime.appName ?? `formless-domain-${plan.instanceId}`;
}

function domainProviderAlchemyStage(runtime: DomainProviderAlchemyRuntime): string {
  return runtime.stage ?? "production";
}

export async function nodeAlchemyDomainProviderRuntime(input: {
  accountId: string;
  appName?: string;
  env: NodeJS.ProcessEnv;
  rootDir?: string;
  stage?: string;
}): Promise<DomainProviderAlchemyRuntime> {
  const alchemyPassword = requiredEnv(input.env, "ALCHEMY_PASSWORD");
  const alchemyStateToken =
    input.rootDir === undefined ? requiredEnv(input.env, ALCHEMY_STATE_TOKEN_ENV_NAME) : undefined;
  const cloudflareApiToken =
    input.rootDir === undefined
      ? cloudflareApiTokenFromEnv(input.env)
      : optionalCloudflareApiTokenFromEnv(input.env);
  const [{ default: alchemy }, cloudflare, state] = await Promise.all([
    import("alchemy"),
    import("alchemy/cloudflare"),
    import("alchemy/state"),
  ]);
  const apiToken =
    cloudflareApiToken === undefined ? undefined : alchemy.secret(cloudflareApiToken);
  const stateToken =
    alchemyStateToken === undefined ? undefined : alchemy.secret(alchemyStateToken);
  const profile = input.env.ALCHEMY_PROFILE?.trim() || input.env.CLOUDFLARE_PROFILE?.trim();
  const credentialOptions = apiToken === undefined ? (profile ? { profile } : {}) : { apiToken };

  return {
    ...(input.appName === undefined ? {} : { appName: input.appName }),
    factories: {
      CustomDomain: (id, props) =>
        cloudflare.CustomDomain(id, {
          ...props,
          accountId: input.accountId,
          ...credentialOptions,
        }),
      DnsRecords: (id, props) =>
        cloudflare.DnsRecords(id, {
          ...props,
          ...credentialOptions,
        }),
      RedirectRule: (id, props) =>
        cloudflare.RedirectRule(id, {
          ...props,
          ...credentialOptions,
        }),
    },
    password: alchemyPassword,
    ...(input.rootDir === undefined ? {} : { rootDir: input.rootDir }),
    runner: async (appName, options, apply) => {
      const app = await alchemy(appName, options);
      const result = await apply();

      await app.finalize();

      return result;
    },
    ...(input.stage === undefined ? {} : { stage: input.stage }),
    ...(input.rootDir !== undefined
      ? {}
      : {
          stateStore: (scope) =>
            new state.CloudflareStateStore(scope, {
              accountId: input.accountId,
              ...credentialOptions,
              stateToken,
            }),
        }),
  };
}

function deleteEvidenceFromAlchemyResult(input: {
  targets: Readonly<InstanceDomainProviderDeleteReadyResponse["targets"]>;
  result: AlchemyDomainProviderRunResult;
}): InstanceDomainProviderDeleteJobResourceEvidence[] {
  const targets = new Map(input.targets.map((target) => [target.logicalId, target]));
  const evidence: InstanceDomainProviderDeleteJobResourceEvidence[] = [];

  for (const resourceResult of input.result.resources) {
    const target = targets.get(resourceResult.logicalId);

    if (!target) {
      throw new Error(
        `Domain provider delete output "${resourceResult.logicalId}" was not in the delete job.`,
      );
    }

    evidence.push({
      action: "deleted",
      host: target.host,
      kind: target.kind,
      logicalId: target.logicalId,
    });
  }

  return evidence;
}

function requireConfiguredAccountId(value: string | undefined): string {
  const accountId = value?.trim();

  if (!accountId) {
    throw new Error("Domain provider job did not include a Cloudflare account id.");
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
  const value = optionalCloudflareApiTokenFromEnv(env);

  if (!value) {
    throw new Error("Domain provider runner requires CLOUDFLARE_API_TOKEN or CF_API_TOKEN.");
  }

  return value;
}

function optionalCloudflareApiTokenFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const value = env.CLOUDFLARE_API_TOKEN?.trim() ?? env.CF_API_TOKEN?.trim();

  return value || undefined;
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

function isProviderNotFoundError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();

  return (
    /\b404\b/.test(message) ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}
