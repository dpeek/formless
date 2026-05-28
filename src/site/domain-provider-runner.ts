import type { AlchemyOptions } from "alchemy";
import type { CustomDomain, DnsRecords, RedirectRule } from "alchemy/cloudflare";

import type {
  DeploymentActor,
  DeploymentDesiredStateVersion,
  DeploymentDesiredStateVersionRef,
  DeploymentEvidenceAction,
  DeploymentFailureSummary,
  DeploymentPlanSummary,
  DeploymentResourceEvidenceSummary,
  DeploymentResourceKind,
  DeploymentStatus,
  DeploymentTargetId,
} from "../shared/deployment-runtime.ts";
import {
  type InstanceDomainProviderApplyJobResourceEvidence,
  type InstanceDomainProviderApplyReadyResponse,
  type InstanceDomainProviderDeleteJobResourceEvidence,
  type InstanceDomainProviderDeleteReadyResponse,
} from "../shared/domain-provider-api.ts";
import type {
  DomainProviderApplyPolicy,
  DomainProviderCustomDomainResource,
  DomainProviderDnsRecordsResource,
  DomainProviderPlan,
  DomainProviderRedirectRuleResource,
  DomainProviderResource,
  DomainProviderResourceKind,
} from "../shared/domain-provider-protocol.ts";
import {
  applyAlchemyDomainProviderPlan,
  type AlchemyDomainProviderApplyResult,
  type AlchemyDomainProviderFactories,
  type AlchemyDomainProviderRunner,
} from "../worker/domain-provider-alchemy.ts";
import { normalizeFormlessInstanceWorkspaceTargetUrl } from "./instance-workspace-config.ts";
import {
  assertCloudflareDomainProviderResourcePreflight,
  createFetchCloudflareDomainClient,
} from "./cloudflare-domain-client.ts";
import {
  FormlessInstanceTargetRequestError,
  completeFormlessInstanceDomainProviderApplyJob,
  completeFormlessInstanceDomainProviderDeleteJob,
  readFormlessInstanceDeploymentDesiredState,
  readFormlessInstanceDeploymentStatus,
  requestFormlessInstanceDomainProviderApply,
  requestFormlessInstanceDomainProviderDelete,
  startFormlessInstanceDeploymentAttempt,
  type FormlessInstanceTargetClientDependencies,
  writeFormlessInstanceDeploymentAttemptFailure,
  writeFormlessInstanceDeploymentAttemptPlan,
  writeFormlessInstanceDeploymentAttemptSuccess,
} from "./instance-target-client.ts";

export const ALCHEMY_STATE_TOKEN_ENV_NAME = "ALCHEMY_STATE_TOKEN";

export type DomainProviderAlchemyRuntime = {
  factories: AlchemyDomainProviderFactories;
  password: string;
  preflight?: (input: { plan: InstanceDomainProviderApplyReadyResponse["plan"] }) => Promise<void>;
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

export type RunFormlessInstanceDomainProviderDeleteInput = {
  adminToken?: string | null;
  host?: string | null;
  kind?: DomainProviderResourceKind | null;
  logicalId?: string | null;
  runnerId?: string | null;
  targetUrl: string;
};

export type RunFormlessInstanceDomainProviderApplyResult = {
  alchemy: AlchemyDomainProviderApplyResult;
  apply: InstanceDomainProviderApplyReadyResponse;
  completion: Awaited<ReturnType<typeof completeFormlessInstanceDomainProviderApplyJob>>;
  deployment?: RunFormlessInstanceDomainProviderDeploymentFacts;
  evidenceCount: number;
  runnerId: string;
  targetUrl: string;
};

export type RunFormlessInstanceDomainProviderDeploymentFacts = {
  attemptId: string;
  desiredState: DeploymentDesiredStateVersionRef;
  resourceCount: number;
  resourcesByKind: Record<DeploymentResourceKind, number>;
  source: "domain-provider-job" | "runner";
  targetId: DeploymentTargetId;
  writebackStatus: "planned" | "started" | "succeeded";
};

type DeploymentApplyContext = RunFormlessInstanceDomainProviderDeploymentFacts & {
  leaseToken?: string;
};

export type RunFormlessInstanceDomainProviderDeleteResult = {
  alchemy: AlchemyDomainProviderApplyResult;
  delete: InstanceDomainProviderDeleteReadyResponse;
  completion: Awaited<ReturnType<typeof completeFormlessInstanceDomainProviderDeleteJob>>;
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

  let deployment = await prepareDeploymentApplyContext(
    {
      adminToken: input.adminToken,
      apply,
      runnerId,
      targetUrl,
    },
    dependencies,
  );
  deployment = await writeDeploymentApplyPlanIfAvailable(
    {
      adminToken: input.adminToken,
      apply,
      deployment,
      runnerId,
      targetUrl,
    },
    dependencies,
  );

  const accountId = requireApplyAccountId(apply);

  try {
    const runtime = await (dependencies.runtime ?? nodeAlchemyDomainProviderRuntime)({
      accountId,
      env: dependencies.env,
    });

    await runtime.preflight?.({ plan: apply.job.plan });

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
    deployment = await writeDeploymentApplySuccessIfNeeded(
      {
        adminToken: input.adminToken,
        alchemy,
        deployment,
        plan: apply.job.plan,
        resources,
        runnerId,
        targetUrl,
      },
      dependencies,
    );

    return {
      alchemy,
      apply,
      completion,
      ...(deployment === undefined ? {} : { deployment }),
      evidenceCount: resources.length,
      runnerId,
      targetUrl,
    };
  } catch (error) {
    let writebackError: unknown;

    try {
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
    } catch (completionError) {
      writebackError = completionError;
    }

    try {
      await writeDeploymentApplyFailureIfNeeded(
        {
          adminToken: input.adminToken,
          deployment,
          error,
          runnerId,
          targetUrl,
        },
        dependencies,
      );
    } catch (deploymentError) {
      writebackError ??= deploymentError;
    }

    if (writebackError !== undefined) {
      throw writebackError;
    }

    throw error;
  }
}

export async function runFormlessInstanceDomainProviderDelete(
  input: RunFormlessInstanceDomainProviderDeleteInput,
  dependencies: RunFormlessInstanceDomainProviderApplyDependencies,
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
      appName: `formless-domain-${deleteJob.plan.instanceId}`,
      plan: deleteJob.job.plan,
      runtime,
      rootDir: runtime.rootDir,
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

async function prepareDeploymentApplyContext(
  input: {
    adminToken?: string | null;
    apply: InstanceDomainProviderApplyReadyResponse;
    runnerId: string;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<DeploymentApplyContext | undefined> {
  try {
    const desiredState = await readFormlessInstanceDeploymentDesiredState(
      { targetUrl: input.targetUrl },
      dependencies,
    );
    const desiredStateRef = deploymentDesiredStateRef(desiredState.desiredState);
    const status = await readFormlessInstanceDeploymentStatus(
      { targetUrl: input.targetUrl },
      dependencies,
    );
    const bridgedAttempt = bridgedApplyAttemptFromStatus(status.status, input.runnerId);

    if (bridgedAttempt) {
      return {
        attemptId: bridgedAttempt.attemptId,
        desiredState: bridgedAttempt.desiredState,
        resourceCount: desiredState.desiredState.display.resourceCount,
        resourcesByKind: desiredState.desiredState.display.resourcesByKind,
        source: "domain-provider-job",
        targetId: bridgedAttempt.desiredState.targetId,
        writebackStatus: "started",
      };
    }

    const started = await startFormlessInstanceDeploymentAttempt(
      {
        adminToken: input.adminToken,
        request: {
          actor: domainProviderRunnerDeploymentActor(input.runnerId),
          desiredState: desiredStateRef,
          idempotencyKey: `domain-provider-runner:${input.apply.job.jobId}`,
          mode: "apply",
        },
        targetUrl: input.targetUrl,
      },
      dependencies,
    );

    if (!started.lease) {
      throw new Error("Deployment runtime apply attempt did not acquire a lease.");
    }

    return {
      attemptId: started.attempt.attemptId,
      desiredState: desiredStateRef,
      leaseToken: started.lease.token,
      resourceCount: desiredState.desiredState.display.resourceCount,
      resourcesByKind: desiredState.desiredState.display.resourcesByKind,
      source: "runner",
      targetId: desiredStateRef.targetId,
      writebackStatus: "started",
    };
  } catch (error) {
    if (isDeploymentRuntimeUnsupportedError(error)) {
      return undefined;
    }

    throw error;
  }
}

async function writeDeploymentApplyPlanIfAvailable(
  input: {
    adminToken?: string | null;
    apply: InstanceDomainProviderApplyReadyResponse;
    deployment: DeploymentApplyContext | undefined;
    runnerId: string;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<DeploymentApplyContext | undefined> {
  if (!input.deployment) {
    return undefined;
  }

  await writeFormlessInstanceDeploymentAttemptPlan(
    {
      adminToken: input.adminToken,
      request: {
        attemptId: input.deployment.attemptId,
        desiredState: input.deployment.desiredState,
        runnerId: input.runnerId,
        summary: deploymentPlanSummaryFromDomainProviderPlan(input.apply.job.plan),
      },
      targetUrl: input.targetUrl,
    },
    dependencies,
  );

  return {
    ...input.deployment,
    writebackStatus: "planned",
  };
}

async function writeDeploymentApplySuccessIfNeeded(
  input: {
    adminToken?: string | null;
    alchemy: AlchemyDomainProviderApplyResult;
    deployment: DeploymentApplyContext | undefined;
    plan: DomainProviderPlan;
    resources: readonly InstanceDomainProviderApplyJobResourceEvidence[];
    runnerId: string;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<DeploymentApplyContext | undefined> {
  if (!input.deployment) {
    return undefined;
  }

  const deployment = input.deployment;

  if (deployment.leaseToken) {
    await writeFormlessInstanceDeploymentAttemptSuccess(
      {
        adminToken: input.adminToken,
        request: {
          alchemy: {
            app: `formless-domain-${input.plan.instanceId}`,
            scope: deployment.targetId,
            stage: input.alchemy.stage,
          },
          attemptId: deployment.attemptId,
          desiredState: deployment.desiredState,
          evidence: input.resources.map((resource) =>
            deploymentEvidenceSummaryFromApplyEvidence(resource, deployment.targetId),
          ),
          leaseToken: deployment.leaseToken,
          runnerId: input.runnerId,
        },
        targetUrl: input.targetUrl,
      },
      dependencies,
    );
  }

  return {
    ...deployment,
    writebackStatus: "succeeded",
  };
}

async function writeDeploymentApplyFailureIfNeeded(
  input: {
    adminToken?: string | null;
    deployment: DeploymentApplyContext | undefined;
    error: unknown;
    runnerId: string;
    targetUrl: string;
  },
  dependencies: FormlessInstanceTargetClientDependencies,
): Promise<void> {
  if (!input.deployment?.leaseToken) {
    return;
  }

  await writeFormlessInstanceDeploymentAttemptFailure(
    {
      adminToken: input.adminToken,
      request: {
        actor: domainProviderRunnerDeploymentActor(input.runnerId),
        attemptId: input.deployment.attemptId,
        desiredState: input.deployment.desiredState,
        leaseToken: input.deployment.leaseToken,
        runnerId: input.runnerId,
        summary: deploymentFailureSummaryFromError(input.error),
      },
      targetUrl: input.targetUrl,
    },
    dependencies,
  );
}

async function destroyDomainProviderDeleteTargets(input: {
  appName: string;
  plan: InstanceDomainProviderDeleteReadyResponse["plan"];
  rootDir?: string;
  runtime: DomainProviderAlchemyRuntime;
  targets: Readonly<InstanceDomainProviderDeleteReadyResponse["targets"]>;
}): Promise<AlchemyDomainProviderApplyResult> {
  const plannedResources = new Map(
    input.plan.resources.map((resource) => [resource.logicalId, resource]),
  );
  const resources: AlchemyDomainProviderApplyResult["resources"] = [];
  let stage = "production";

  for (const target of input.targets) {
    const resource = plannedResources.get(target.logicalId);

    if (!resource) {
      throw new Error(`Domain provider delete target "${target.logicalId}" was not in the plan.`);
    }

    try {
      const result = await applyAlchemyDomainProviderPlan({
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

export async function nodeAlchemyDomainProviderRuntime(input: {
  accountId: string;
  env: NodeJS.ProcessEnv;
}): Promise<DomainProviderAlchemyRuntime> {
  const alchemyPassword = requiredEnv(input.env, "ALCHEMY_PASSWORD");
  const alchemyStateToken = requiredEnv(input.env, ALCHEMY_STATE_TOKEN_ENV_NAME);
  const cloudflareApiToken = cloudflareApiTokenFromEnv(input.env);
  const [{ default: alchemy }, cloudflare, state] = await Promise.all([
    import("alchemy"),
    import("alchemy/cloudflare"),
    import("alchemy/state"),
  ]);
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
    preflight: ({ plan }) =>
      assertCloudflareDomainProviderResourcePreflight({
        client: createFetchCloudflareDomainClient({
          apiToken: cloudflareApiToken,
          fetch: globalThis.fetch,
        }),
        plan,
      }),
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

    evidence.push(resourceEvidence(input.accountId, resource, resourceResult.output));
  }

  return evidence;
}

function deleteEvidenceFromAlchemyResult(input: {
  targets: Readonly<InstanceDomainProviderDeleteReadyResponse["targets"]>;
  result: AlchemyDomainProviderApplyResult;
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

function resourceEvidence(
  accountId: string,
  resource: DomainProviderResource,
  output: unknown,
): InstanceDomainProviderApplyJobResourceEvidence {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      return customDomainEvidence(accountId, resource, output);
    case "cloudflare-redirect-rule":
      return redirectRuleEvidence(accountId, resource, output);
    case "cloudflare-dns-records":
      return dnsRecordsEvidence(accountId, resource, output);
  }
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

function redirectRuleEvidence(
  accountId: string,
  resource: DomainProviderRedirectRuleResource,
  output: unknown,
): InstanceDomainProviderApplyJobResourceEvidence {
  const redirectRule = parseRedirectRuleOutput(output, resource.logicalId);

  return {
    accountId,
    action: "created",
    alchemyResourceId: resource.logicalId,
    host: resource.fromHost,
    kind: resource.kind,
    logicalId: resource.logicalId,
    preserveQueryString: resource.props.preserveQueryString,
    redirectRuleId: redirectRule.ruleId,
    redirectRulesetId: redirectRule.rulesetId,
    statusCode: resource.props.statusCode,
    targetUrl: resource.targetUrl,
    zoneId: resource.zone.id,
    zoneName: resource.zone.name,
  };
}

function dnsRecordsEvidence(
  accountId: string,
  resource: DomainProviderDnsRecordsResource,
  output: unknown,
): InstanceDomainProviderApplyJobResourceEvidence {
  const dnsRecords = parseDnsRecordsOutput(output, resource.logicalId);

  return {
    accountId,
    action: "created",
    alchemyResourceId: resource.logicalId,
    dnsRecordIds: dnsRecords.records.map((record) => record.id),
    host: resource.fromHost,
    kind: resource.kind,
    logicalId: resource.logicalId,
    zoneId: resource.zone.id,
    zoneName: resource.zone.name,
  };
}

function bridgedApplyAttemptFromStatus(
  status: DeploymentStatus,
  runnerId: string,
): { attemptId: string; desiredState: DeploymentDesiredStateVersionRef } | undefined {
  if (
    status.state !== "in-progress" ||
    status.mode !== "apply" ||
    status.actor.runnerId !== runnerId
  ) {
    return undefined;
  }

  return {
    attemptId: status.attemptId,
    desiredState: status.desiredState,
  };
}

function deploymentDesiredStateRef(
  desiredState: DeploymentDesiredStateVersion,
): DeploymentDesiredStateVersionRef {
  return {
    hash: desiredState.hash,
    revision: desiredState.revision,
    targetId: desiredState.targetId,
    versionId: desiredState.versionId,
  };
}

function deploymentPlanSummaryFromDomainProviderPlan(
  plan: DomainProviderPlan,
): DeploymentPlanSummary {
  return {
    blockers: plan.blockers.map((blocker) => ({
      code: blocker.code,
      ...(blocker.host === undefined ? {} : { logicalId: blocker.host }),
      message: blocker.message,
    })),
    changes: {
      create: plan.resources.length,
      delete: 0,
      noChange: 0,
      update: 0,
    },
    displayText: `${plan.resources.length} domain provider resource${
      plan.resources.length === 1 ? "" : "s"
    } planned.`,
    warnings: [],
  };
}

function deploymentEvidenceSummaryFromApplyEvidence(
  evidence: InstanceDomainProviderApplyJobResourceEvidence,
  targetId: DeploymentTargetId,
): DeploymentResourceEvidenceSummary {
  return {
    action: deploymentEvidenceActionFromApplyAction(evidence.action),
    alchemyResourceId: evidence.alchemyResourceId,
    displayName: evidence.host,
    kind: evidence.kind,
    logicalId: evidence.logicalId,
    providerFamily: "cloudflare",
    providerResourceIds: providerResourceIdsFromApplyEvidence(evidence),
    targetId,
  };
}

function deploymentEvidenceActionFromApplyAction(
  action: InstanceDomainProviderApplyJobResourceEvidence["action"],
): DeploymentEvidenceAction {
  return action === "overridden" ? "updated" : action;
}

function providerResourceIdsFromApplyEvidence(
  evidence: InstanceDomainProviderApplyJobResourceEvidence,
): string[] {
  switch (evidence.kind) {
    case "cloudflare-worker-custom-domain":
      return [evidence.workerDomainId];
    case "cloudflare-redirect-rule":
      return [evidence.redirectRulesetId, evidence.redirectRuleId];
    case "cloudflare-dns-records":
      return evidence.dnsRecordIds;
  }
}

function deploymentFailureSummaryFromError(error: unknown): DeploymentFailureSummary {
  return {
    code: "domain-provider-apply-failed",
    displayMessage: errorMessage(error),
  };
}

function domainProviderRunnerDeploymentActor(runnerId: string): DeploymentActor {
  return {
    actorId: "domain-provider.apply",
    displayName: "Domain provider apply",
    kind: "runner",
    runnerId,
  };
}

function parseCustomDomainOutput(output: unknown, logicalId: string): Pick<CustomDomain, "id"> {
  if (!isRecord(output) || typeof output.id !== "string" || output.id.trim() === "") {
    throw new Error(`Alchemy CustomDomain "${logicalId}" did not return a provider id.`);
  }

  return { id: output.id };
}

function parseRedirectRuleOutput(
  output: unknown,
  logicalId: string,
): Pick<RedirectRule, "ruleId" | "rulesetId"> {
  if (
    !isRecord(output) ||
    typeof output.ruleId !== "string" ||
    output.ruleId.trim() === "" ||
    typeof output.rulesetId !== "string" ||
    output.rulesetId.trim() === ""
  ) {
    throw new Error(`Alchemy RedirectRule "${logicalId}" did not return provider ids.`);
  }

  return { ruleId: output.ruleId, rulesetId: output.rulesetId };
}

function parseDnsRecordsOutput(output: unknown, logicalId: string): Pick<DnsRecords, "records"> {
  if (!isRecord(output) || !Array.isArray(output.records)) {
    throw new Error(`Alchemy DnsRecords "${logicalId}" did not return provider records.`);
  }

  const records = output.records.map((record) => {
    if (!isRecord(record) || typeof record.id !== "string" || record.id.trim() === "") {
      throw new Error(`Alchemy DnsRecords "${logicalId}" returned a record without an id.`);
    }

    return { id: record.id };
  });

  if (records.length === 0) {
    throw new Error(`Alchemy DnsRecords "${logicalId}" did not return provider record ids.`);
  }

  return { records } as Pick<DnsRecords, "records">;
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
  return requireConfiguredAccountId(apply.config.accountId);
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

function isProviderNotFoundError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();

  return (
    /\b404\b/.test(message) ||
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

function isDeploymentRuntimeUnsupportedError(
  error: unknown,
): error is FormlessInstanceTargetRequestError {
  return error instanceof FormlessInstanceTargetRequestError && error.status === 404;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
