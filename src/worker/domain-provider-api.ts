import {
  DOMAIN_PROVIDER_RUNNER_MUTATION_ENV_NAMES,
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH,
  type DomainProviderConfigIssue,
  type DomainProviderConfigStatus,
  type CreateInstanceDomainProviderRedirectIntentRequest,
  type CreateInstanceDomainProviderRedirectIntentResponse,
  type DeleteInstanceDomainProviderRedirectIntentRequest,
  type DeleteInstanceDomainProviderRedirectIntentResponse,
  type ForgetInstanceDomainProviderRedirectIntentResponse,
  type InstanceDomainProviderAppliedResourceState,
  type InstanceDomainProviderAuditEvent,
  type InstanceDomainProviderApplyBlockedCode,
  type InstanceDomainProviderApplyJob,
  type InstanceDomainProviderApplyJobResourceEvidence,
  type InstanceDomainProviderApplyJobResponse,
  type InstanceDomainProviderApplyJobResultRequest,
  type InstanceDomainProviderApplyJobResultSummary,
  type InstanceDomainProviderApplyRequest,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderDeleteBlockedCode,
  type InstanceDomainProviderDeleteJob,
  type InstanceDomainProviderDeleteJobResourceEvidence,
  type InstanceDomainProviderDeleteJobResponse,
  type InstanceDomainProviderDeleteJobResultRequest,
  type InstanceDomainProviderDeleteRequest,
  type InstanceDomainProviderDeleteResponse,
  type InstanceDomainProviderDeleteTarget,
  type InstanceDomainProviderManualCleanupRequest,
  type InstanceDomainProviderManualCleanupResponse,
  type InstanceDomainProviderPlanResponse,
  type InstanceDomainProviderRedirectIntentCleanupEvent,
  type InstanceDomainProviderRedirectIntent,
  type InstanceDomainProviderRedirectsResponse,
} from "../shared/domain-provider-api.ts";
import type {
  DeploymentActor,
  DeploymentAlchemyStatePointer,
  DeploymentAttempt,
  DeploymentDesiredStateVersionRef,
  DeploymentLeaseToken,
  DeploymentResourceEvidenceSummary,
  DeploymentTarget,
} from "../shared/deployment-runtime.ts";
import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import type {
  DomainProviderApplyPolicy,
  DomainProviderCustomDomainResource,
  DomainProviderDnsRecordsResource,
  DomainProviderPlan,
  DomainProviderRedirectIntent,
  DomainProviderRedirectRuleResource,
  DomainProviderRedirectStatusCode,
  DomainProviderResource,
  DomainProviderResourceKind,
  DomainProviderZone,
} from "../shared/domain-provider-protocol.ts";
import { CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS } from "../shared/domain-provider-protocol.ts";
import {
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  type InstanceDomainMapping,
  type InstanceDomainMappingAppliedState,
  type InstanceDomainMappingDesiredCleanupEvent,
} from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  deleteInstanceDomainMappingAppliedState,
  readInstanceDomainMappingAppliedStates,
  readInstanceDomainMappingDesiredCleanupEvents,
  readInstanceDomainMappings,
  recordInstanceDomainMappingApplyEvidence,
} from "./instance-domain-mappings-state.ts";
import {
  INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  materializeDeploymentDesiredStateVersion,
  startDeploymentAttempt,
  writeDeploymentAttemptFailure,
  writeDeploymentAttemptSuccess,
} from "./deployment-runtime-state.ts";
import {
  readControlPlaneRecords,
  syncDomainIntentToControlPlane,
} from "./deployment-control-plane-client.ts";
import { buildPrimaryInstanceDeploymentDesiredStateProjection } from "./deployment-runtime-projection.ts";
import { readBackfilledControlPlaneAppInstalls } from "./instance-app-installs.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import {
  domainProviderRedirectIntentFromRow as redirectIntentFromRow,
  ensureDomainProviderRedirectIntentsTable,
  readDomainProviderRedirectIntents,
  type DomainProviderRedirectIntentCleanupEventRow,
} from "./domain-provider-redirect-intents-state.ts";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";

export { readDomainProviderRedirectIntents } from "./domain-provider-redirect-intents-state.ts";

const APPLY_LOCK_ID = "domain-provider-apply";
const primaryInstanceDeploymentTarget = {
  kind: "instance",
  label: "Primary instance target",
  targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
} satisfies DeploymentTarget;
const applyLockTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_apply_lock (
    lock_id TEXT PRIMARY KEY CHECK (lock_id = '${APPLY_LOCK_ID}'),
    acquired_at TEXT NOT NULL
  )
`;
const applyJobsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_apply_jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('ready', 'running', 'succeeded', 'failed')),
    runner_id TEXT,
    plan_json TEXT NOT NULL,
    deployment_attempt_id TEXT,
    deployment_target_id TEXT,
    deployment_desired_state_version_id TEXT,
    deployment_desired_state_revision INTEGER,
    deployment_desired_state_hash TEXT,
    deployment_lease_token TEXT,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const deleteJobsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_delete_jobs (
    job_id TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('ready', 'running', 'succeeded', 'failed')),
    runner_id TEXT,
    plan_json TEXT NOT NULL,
    targets_json TEXT NOT NULL,
    deployment_attempt_id TEXT,
    deployment_target_id TEXT,
    deployment_desired_state_version_id TEXT,
    deployment_desired_state_revision INTEGER,
    deployment_desired_state_hash TEXT,
    deployment_lease_token TEXT,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const redirectIntentCleanupEventsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_redirect_intent_cleanup_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_host TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    to_host TEXT,
    to_url TEXT,
    preserve_path INTEGER NOT NULL CHECK (preserve_path IN (0, 1)),
    preserve_query_string INTEGER NOT NULL CHECK (preserve_query_string IN (0, 1)),
    status_code INTEGER NOT NULL CHECK (status_code IN (301, 302, 303, 307, 308)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action = 'forgotten'),
    reason TEXT NOT NULL CHECK (reason = 'disabled-unapplied'),
    recorded_at TEXT NOT NULL,
    CHECK ((to_host IS NOT NULL AND to_url IS NULL) OR (to_host IS NULL AND to_url IS NOT NULL))
  )
`;
const appliedResourcesTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_applied_resources (
    logical_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    alchemy_resource_id TEXT NOT NULL,
    runner_id TEXT,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'manually-removed', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;
const providerAuditEventsTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_audit_events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    logical_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    host TEXT NOT NULL,
    account_id TEXT NOT NULL,
    alchemy_resource_id TEXT NOT NULL,
    runner_id TEXT,
    zone_id TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_json TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('adopted', 'created', 'deleted', 'manually-removed', 'overridden')),
    applied_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const domainProviderApplyJobsSqlMigrationFamily = storageSqlMigrationFamily(
  "instance-domain-provider-apply-jobs",
);
const domainProviderDeleteJobsSqlMigrationFamily = storageSqlMigrationFamily(
  "instance-domain-provider-delete-jobs",
);
const domainProviderAppliedResourcesSqlMigrationFamily = storageSqlMigrationFamily(
  "instance-domain-provider-applied-resources",
);
const domainProviderSqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-05-28-domain-provider-apply-job-deployment-columns",
    owner: "formless",
    family: domainProviderApplyJobsSqlMigrationFamily,
    checksum: "sha256:dcc2cc25b39e1b20f656a932203178bc5ea9c90cff20ed143c22e6bcafe9a717",
    safety: "auto-safe",
    summary: "Add deployment linkage columns to domain provider apply jobs.",
    apply: migrateDomainProviderApplyJobDeploymentColumns,
  },
  {
    id: "2026-05-28-domain-provider-delete-job-deployment-columns",
    owner: "formless",
    family: domainProviderDeleteJobsSqlMigrationFamily,
    checksum: "sha256:e8d9708c9716840a49b7cb9b6505712a897b8e8e03aae02121ad53709de3f468",
    safety: "auto-safe",
    summary: "Add deployment linkage columns to domain provider delete jobs.",
    apply: migrateDomainProviderDeleteJobDeploymentColumns,
  },
  {
    id: "2026-05-28-domain-provider-applied-action-checks",
    owner: "formless",
    family: domainProviderAppliedResourcesSqlMigrationFamily,
    checksum: "sha256:8c55d0aba3c55d9e0b9026382c40d66610a501fbea8faddd2bfd90d9fee37b10",
    safety: "auto-safe",
    summary: "Rewrite domain provider applied action checks to include manual removals.",
    apply: migrateDomainProviderAppliedActionChecks,
  },
]);

type InstanceDomainProviderApiEnv = AuthorityAdminGuardEnv & {
  ALCHEMY_PASSWORD?: string;
  CF_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  FORMLESS_AUTHORITY: DurableObjectNamespace;
  FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONE_NAME?: string;
  FORMLESS_DOMAIN_PROVIDER_ZONES?: string;
};

type DurableObjectDomainProviderEnv = Omit<InstanceDomainProviderApiEnv, "FORMLESS_AUTHORITY"> & {
  FORMLESS_AUTHORITY?: DurableObjectNamespace;
};

type DomainProviderApplyLockResult =
  | { acquired: true }
  | {
      acquired: false;
      acquiredAt: string;
    };

type DomainProviderPlanOptions = {
  host?: string;
  policy?: DomainProviderApplyPolicy;
};

type DomainProviderDeleteOptions = {
  host?: string;
  kind?: DomainProviderResourceKind;
  logicalId?: string;
};

type DomainProviderDeploymentJobLink = {
  attemptId: string;
  desiredState: DeploymentDesiredStateVersionRef;
  leaseToken: DeploymentLeaseToken;
};

type DomainProviderDeploymentAttemptStartResult =
  | {
      actor: DeploymentActor;
      attempt: DeploymentAttempt;
      desiredState: DeploymentDesiredStateVersionRef;
      leaseToken: DeploymentLeaseToken;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 409;
    };

type DomainProviderApplyJobRow = {
  deployment_attempt_id: string | null;
  deployment_desired_state_hash: string | null;
  deployment_desired_state_revision: number | null;
  deployment_desired_state_version_id: string | null;
  deployment_lease_token: string | null;
  deployment_target_id: string | null;
  job_id: string;
  status: InstanceDomainProviderApplyJob["status"];
  runner_id: string | null;
  plan_json: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type DomainProviderDeleteJobRow = {
  deployment_attempt_id: string | null;
  deployment_desired_state_hash: string | null;
  deployment_desired_state_revision: number | null;
  deployment_desired_state_version_id: string | null;
  deployment_lease_token: string | null;
  deployment_target_id: string | null;
  job_id: string;
  status: InstanceDomainProviderDeleteJob["status"];
  runner_id: string | null;
  plan_json: string;
  targets_json: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type DomainProviderAppliedResourceRow = {
  account_id: string;
  action: InstanceDomainProviderAppliedResourceState["action"];
  alchemy_resource_id: string;
  applied_at: string;
  host: string;
  kind: InstanceDomainProviderAppliedResourceState["kind"];
  logical_id: string;
  resource_id: string;
  resource_json: string;
  runner_id: string | null;
  updated_at: string;
  zone_id: string;
  zone_name: string;
};

type DomainProviderAuditEventRow = DomainProviderAppliedResourceRow & {
  event_id: number;
};

export async function handleInstanceDomainProviderApiRequest(
  request: Request,
  env: InstanceDomainProviderApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceDomainProviderApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceDomainProviderDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceDomainProviderApiPath(url.pathname)) {
    return undefined;
  }

  const applyJobPath = parseApplyJobPath(url.pathname);
  const deleteJobPath = parseDeleteJobPath(url.pathname);

  if (applyJobPath) {
    if (applyJobPath.result) {
      return handleApplyJobResultRequest(request, storage, env, applyJobPath.jobId);
    }

    return handleApplyJobStatusRequest(request, storage, applyJobPath.jobId);
  }

  if (deleteJobPath) {
    if (deleteJobPath.result) {
      return handleDeleteJobResultRequest(request, storage, env, deleteJobPath.jobId);
    }

    return handleDeleteJobStatusRequest(request, storage, deleteJobPath.jobId);
  }

  if (
    url.pathname === INSTANCE_DOMAIN_PROVIDER_API_PATH ||
    url.pathname === INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH
  ) {
    if (request.method !== "GET") {
      return methodNotAllowedResponse("GET");
    }

    const options = parsePlanOptions(url.searchParams);

    if (!options.ok) {
      return jsonResponse({ error: options.error }, 400);
    }

    return jsonResponse(
      await domainProviderPlanResponse(storage, env, options.options, request.url),
    );
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_REDIRECTS_FORGET_API_PATH) {
    return handleForgetRedirectIntentRequest(request, storage, env, url);
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_REDIRECTS_API_PATH) {
    return handleRedirectIntentsRequest(request, storage, env, url);
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH) {
    return handleApplyRequest(request, storage, env);
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_DELETE_API_PATH) {
    return handleDeleteRequest(request, storage, env);
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_MANUAL_CLEANUP_API_PATH) {
    return handleManualCleanupRequest(request, storage, env);
  }

  return jsonResponse({ error: "Not found." }, 404);
}

function handleApplyRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Promise.resolve(methodNotAllowedResponse("POST"));
  }

  return applyWithAuthorization(request, storage, env);
}

function handleDeleteRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Promise.resolve(methodNotAllowedResponse("POST"));
  }

  return deleteWithAuthorization(request, storage, env);
}

function handleManualCleanupRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return Promise.resolve(methodNotAllowedResponse("POST"));
  }

  return manualCleanupWithAuthorization(request, storage, env);
}

async function handleRedirectIntentsRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  url: URL,
): Promise<Response> {
  if (request.method === "GET") {
    return jsonResponse(await domainProviderRedirectsResponse(storage, env, request.url));
  }

  if (request.method === "POST") {
    const authorization = await authorizeInstanceWrite(request, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    const parsed = await readRedirectIntentRequest(request);

    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const now = nowIsoString();
    const currentRedirectIntents = await readControlPlaneSyncedRedirectIntents(
      storage,
      env,
      request.url,
    );
    const result = buildRedirectIntent({
      currentRedirectIntents,
      intent: parsed.request,
      now,
    });

    const redirectIntents = await writeControlPlaneRedirectIntents(storage, env, request.url, {
      now,
      redirectIntents: result.redirectIntents,
    });

    return jsonResponse(
      {
        redirectIntent:
          redirectIntents.find((intent) => intent.fromHost === result.redirectIntent.fromHost) ??
          result.redirectIntent,
        redirectIntents,
      } satisfies CreateInstanceDomainProviderRedirectIntentResponse,
      201,
    );
  }

  if (request.method === "DELETE") {
    const authorization = await authorizeInstanceWrite(request, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    const parsed = parseDeleteRedirectIntentRequest({
      fromHost: url.searchParams.get("fromHost") ?? "",
    });

    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const now = nowIsoString();
    const currentRedirectIntents = await readControlPlaneSyncedRedirectIntents(
      storage,
      env,
      request.url,
    );
    const result = disableRedirectIntent({
      currentRedirectIntents,
      fromHost: parsed.request.fromHost,
      now,
    });

    if (!result.ok) {
      return jsonResponse({ error: result.error }, 404);
    }

    const redirectIntents = await writeControlPlaneRedirectIntents(storage, env, request.url, {
      now,
      redirectIntents: result.redirectIntents,
    });

    return jsonResponse({
      redirectIntent:
        redirectIntents.find((intent) => intent.fromHost === result.redirectIntent.fromHost) ??
        result.redirectIntent,
      redirectIntents,
    } satisfies DeleteInstanceDomainProviderRedirectIntentResponse);
  }

  return methodNotAllowedResponse("GET, POST, DELETE");
}

async function handleForgetRedirectIntentRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  url: URL,
): Promise<Response> {
  if (request.method !== "DELETE") {
    return methodNotAllowedResponse("DELETE");
  }

  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const parsed = parseDeleteRedirectIntentRequest({
    fromHost: url.searchParams.get("fromHost") ?? "",
  });

  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, 400);
  }

  const now = nowIsoString();
  const currentRedirectIntents = await readControlPlaneSyncedRedirectIntents(
    storage,
    env,
    request.url,
  );
  const result = forgetRedirectIntent(storage, {
    currentRedirectIntents,
    fromHost: parsed.request.fromHost,
    now,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    redirectIntent: result.redirectIntent,
    redirectIntentCleanupEvent: result.redirectIntentCleanupEvent,
    redirectIntentCleanupEvents: result.redirectIntentCleanupEvents,
    redirectIntents: await writeControlPlaneRedirectIntents(storage, env, request.url, {
      now,
      redirectIntents: result.redirectIntents,
    }),
  } satisfies ForgetInstanceDomainProviderRedirectIntentResponse);
}

async function applyWithAuthorization(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const applyRequest = await readApplyRequest(request);

  if (!applyRequest.ok) {
    return jsonResponse({ error: applyRequest.error }, 400);
  }

  const response = await domainProviderPlanResponse(
    storage,
    env,
    applyRequest.options,
    request.url,
  );

  if (!response.config.jobReady) {
    return applyBlockedResponse(
      "domain-provider-apply-not-configured",
      "Domain provider apply is not configured. Review config issues before applying.",
      response,
      409,
    );
  }

  if (response.plan.blockers.length > 0) {
    return applyBlockedResponse(
      "domain-provider-plan-blocked",
      "Domain provider apply cannot run while the plan has blockers.",
      response,
      409,
    );
  }

  const now = nowIsoString();
  const lock = acquireDomainProviderApplyLock(storage, now);

  if (!lock.acquired) {
    return applyBlockedResponse(
      "domain-provider-apply-running",
      `Domain provider apply is already running since ${lock.acquiredAt}.`,
      response,
      409,
    );
  }

  const jobId = `domain-provider-apply-${crypto.randomUUID()}`;
  const deploymentAttempt = await startDomainProviderApplyDeploymentAttempt(storage, {
    env,
    jobId,
    now,
    requestUrl: request.url,
    runnerId: applyRequest.request.runnerId,
  });

  if (!deploymentAttempt.ok) {
    releaseDomainProviderApplyLock(storage);
    return applyBlockedResponse(
      "domain-provider-apply-running",
      deploymentAttempt.error,
      response,
      deploymentAttempt.status,
    );
  }

  let job: InstanceDomainProviderApplyJob;

  try {
    job = writeApplyJob(storage, {
      deployment: {
        attemptId: deploymentAttempt.attempt.attemptId,
        desiredState: deploymentAttempt.desiredState,
        leaseToken: deploymentAttempt.leaseToken,
      },
      jobId,
      now,
      plan: response.plan,
      runnerId: applyRequest.request.runnerId,
    });
  } catch (error) {
    releaseDomainProviderApplyLock(storage);
    await failDomainProviderDeploymentAttempt(storage, {
      actor: deploymentAttempt.actor,
      attemptId: deploymentAttempt.attempt.attemptId,
      code: "domain-provider-apply-job-write-failed",
      desiredState: deploymentAttempt.desiredState,
      displayMessage: "Domain provider apply job could not be recorded.",
      env,
      leaseToken: deploymentAttempt.leaseToken,
      now,
      requestUrl: request.url,
      runnerId: applyRequest.request.runnerId,
    });
    throw error;
  }

  return jsonResponse(
    {
      code: "domain-provider-apply-job-ready",
      config: response.config,
      job,
      plan: response.plan,
      status: "ready",
    } satisfies InstanceDomainProviderApplyResponse,
    202,
  );
}

async function startDomainProviderApplyDeploymentAttempt(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    jobId: string;
    now: string;
    requestUrl: string;
    runnerId?: string;
  },
): Promise<DomainProviderDeploymentAttemptStartResult> {
  return startDomainProviderDeploymentAttempt(storage, {
    actor: domainProviderApplyDeploymentActor(input.runnerId),
    env: input.env,
    idempotencyKey: `domain-provider-apply:${input.jobId}`,
    mode: "apply",
    now: input.now,
    requestUrl: input.requestUrl,
  });
}

async function startDomainProviderDeleteDeploymentAttempt(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    jobId: string;
    now: string;
    requestUrl: string;
    runnerId?: string;
  },
): Promise<DomainProviderDeploymentAttemptStartResult> {
  return startDomainProviderDeploymentAttempt(storage, {
    actor: domainProviderDeleteDeploymentActor(input.runnerId),
    env: input.env,
    idempotencyKey: `domain-provider-delete:${input.jobId}`,
    mode: "destroy",
    now: input.now,
    requestUrl: input.requestUrl,
  });
}

async function startDomainProviderDeploymentAttempt(
  storage: DurableObjectStorage,
  input: {
    actor: DeploymentActor;
    env: DurableObjectDomainProviderEnv;
    idempotencyKey: string;
    mode: "apply" | "destroy";
    now: string;
    requestUrl: string;
  },
): Promise<DomainProviderDeploymentAttemptStartResult> {
  const projection = await buildPrimaryInstanceDeploymentDesiredStateProjection(storage, {
    env: input.env,
    now: input.now,
    requestUrl: input.requestUrl,
    target: primaryInstanceDeploymentTarget,
    targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  });
  const desiredState = await materializeDeploymentDesiredStateVersion(storage, {
    now: input.now,
    resourceGraph: projection.resourceGraph,
    source: projection.source,
    targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    title: "Primary instance target",
  });
  const desiredStateRef: DeploymentDesiredStateVersionRef = {
    hash: desiredState.hash,
    revision: desiredState.revision,
    targetId: desiredState.targetId,
    versionId: desiredState.versionId,
  };
  const started = startDeploymentAttempt(storage, {
    actor: input.actor,
    desiredState: desiredStateRef,
    idempotencyKey: input.idempotencyKey,
    mode: input.mode,
    now: input.now,
  });

  if (!started.ok) {
    return {
      error: started.error,
      ok: false,
      status: started.status,
    };
  }

  if (!started.lease) {
    return {
      error: `Domain provider ${input.mode} did not acquire a deployment lease.`,
      ok: false,
      status: 409,
    };
  }

  return {
    actor: input.actor,
    attempt: started.attempt,
    desiredState: desiredStateRef,
    leaseToken: started.lease.token,
    ok: true,
  };
}

function domainProviderApplyDeploymentActor(runnerId: string | undefined): DeploymentActor {
  return {
    actorId: "domain-provider.apply",
    displayName: "Domain provider apply",
    kind: "runner",
    ...(runnerId === undefined ? {} : { runnerId }),
  };
}

function domainProviderDeleteDeploymentActor(runnerId: string | undefined): DeploymentActor {
  return {
    actorId: "domain-provider.delete",
    displayName: "Domain provider cleanup",
    kind: "runner",
    ...(runnerId === undefined ? {} : { runnerId }),
  };
}

async function failDomainProviderDeploymentAttempt(
  storage: DurableObjectStorage,
  input: {
    actor: DeploymentActor;
    attemptId: DeploymentAttempt["attemptId"];
    code: string;
    desiredState: DeploymentDesiredStateVersionRef;
    displayMessage: string;
    env: DurableObjectDomainProviderEnv;
    leaseToken: DeploymentLeaseToken;
    now: string;
    requestUrl: string;
    runnerId?: string;
  },
) {
  writeDeploymentAttemptFailure(storage, {
    actor: input.actor,
    attemptId: input.attemptId,
    desiredState: input.desiredState,
    leaseToken: input.leaseToken,
    now: input.now,
    runnerId: input.runnerId,
    summary: {
      code: input.code,
      displayMessage: input.displayMessage,
    },
  });
}

async function deleteWithAuthorization(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const deleteRequest = await readDeleteRequest(request);

  if (!deleteRequest.ok) {
    return jsonResponse({ error: deleteRequest.error }, 400);
  }

  const config = domainProviderConfigStatus(env);
  const deletePlan = domainProviderDeletePlan(storage, config, deleteRequest.options);

  if (!config.jobReady) {
    return deleteBlockedResponse(
      "domain-provider-delete-not-configured",
      "Domain provider delete is not configured. Review config issues before deleting provider resources.",
      config,
      deletePlan,
      409,
    );
  }

  if (deletePlan.targets.length === 0) {
    return deleteBlockedResponse(
      "domain-provider-delete-empty",
      "Domain provider delete found no recorded provider resources for the requested selector.",
      config,
      deletePlan,
      404,
    );
  }

  const now = nowIsoString();
  const lock = acquireDomainProviderApplyLock(storage, now);

  if (!lock.acquired) {
    return deleteBlockedResponse(
      "domain-provider-delete-running",
      `Domain provider mutation is already running since ${lock.acquiredAt}.`,
      config,
      deletePlan,
      409,
    );
  }

  const jobId = `domain-provider-delete-${crypto.randomUUID()}`;
  const deploymentAttempt = await startDomainProviderDeleteDeploymentAttempt(storage, {
    env,
    jobId,
    now,
    requestUrl: request.url,
    runnerId: deleteRequest.request.runnerId,
  });

  if (!deploymentAttempt.ok) {
    releaseDomainProviderApplyLock(storage);
    return deleteBlockedResponse(
      "domain-provider-delete-running",
      deploymentAttempt.error,
      config,
      deletePlan,
      deploymentAttempt.status,
    );
  }

  let job: InstanceDomainProviderDeleteJob;

  try {
    job = writeDeleteJob(storage, {
      deployment: {
        attemptId: deploymentAttempt.attempt.attemptId,
        desiredState: deploymentAttempt.desiredState,
        leaseToken: deploymentAttempt.leaseToken,
      },
      jobId,
      now,
      plan: deletePlan.plan,
      runnerId: deleteRequest.request.runnerId,
      targets: deletePlan.targets,
    });
  } catch (error) {
    releaseDomainProviderApplyLock(storage);
    await failDomainProviderDeploymentAttempt(storage, {
      actor: deploymentAttempt.actor,
      attemptId: deploymentAttempt.attempt.attemptId,
      code: "domain-provider-delete-job-write-failed",
      desiredState: deploymentAttempt.desiredState,
      displayMessage: "Domain provider cleanup job could not be recorded.",
      env,
      leaseToken: deploymentAttempt.leaseToken,
      now,
      requestUrl: request.url,
      runnerId: deleteRequest.request.runnerId,
    });
    throw error;
  }

  return jsonResponse(
    {
      code: "domain-provider-delete-job-ready",
      config,
      job,
      plan: deletePlan.plan,
      status: "ready",
      targets: deletePlan.targets,
    } satisfies InstanceDomainProviderDeleteResponse,
    202,
  );
}

async function manualCleanupWithAuthorization(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): Promise<Response> {
  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const cleanupRequest = await readManualCleanupRequest(request);

  if (!cleanupRequest.ok) {
    return jsonResponse({ error: cleanupRequest.error }, 400);
  }

  const result = markDomainProviderResourceManuallyRemoved(storage, {
    now: nowIsoString(),
    request: cleanupRequest.request,
    targetOptions: cleanupRequest.options,
    targetConfig: domainProviderConfigStatus(env),
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    action: "manually-removed",
    status: "cleaned",
    target: result.target,
  } satisfies InstanceDomainProviderManualCleanupResponse);
}

function handleApplyJobStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  jobId: string,
): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const job = readApplyJob(storage, jobId);

  if (!job) {
    return jsonResponse({ error: "Domain provider apply job was not found." }, 404);
  }

  return jsonResponse({ job } satisfies InstanceDomainProviderApplyJobResponse);
}

async function handleApplyJobResultRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  jobId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const result = await readApplyJobResultRequest(request);

  if (!result.ok) {
    return jsonResponse({ error: result.error }, 400);
  }

  const completed = await completeApplyJob(storage, {
    env,
    jobId,
    now: nowIsoString(),
    requestUrl: request.url,
    result: result.request,
  });

  if (!completed.ok) {
    return jsonResponse({ error: completed.error }, completed.status);
  }

  return jsonResponse({ job: completed.job } satisfies InstanceDomainProviderApplyJobResponse);
}

function handleDeleteJobStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  jobId: string,
): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const job = readDeleteJob(storage, jobId);

  if (!job) {
    return jsonResponse({ error: "Domain provider delete job was not found." }, 404);
  }

  return jsonResponse({ job } satisfies InstanceDomainProviderDeleteJobResponse);
}

async function handleDeleteJobResultRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  jobId: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authorization = await authorizeInstanceWrite(request, env);

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  const result = await readDeleteJobResultRequest(request);

  if (!result.ok) {
    return jsonResponse({ error: result.error }, 400);
  }

  const completed = await completeDeleteJob(storage, {
    env,
    jobId,
    now: nowIsoString(),
    requestUrl: request.url,
    result: result.request,
  });

  if (!completed.ok) {
    return jsonResponse({ error: completed.error }, completed.status);
  }

  return jsonResponse({ job: completed.job } satisfies InstanceDomainProviderDeleteJobResponse);
}

async function domainProviderPlanResponse(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  options: DomainProviderPlanOptions = {},
  requestUrl: string,
): Promise<InstanceDomainProviderPlanResponse> {
  const config = domainProviderConfigStatus(env);
  const intent = await readControlPlaneSyncedDomainProviderIntent(storage, env, requestUrl);
  const redirectIntents = intent.redirectIntents;
  const plan = planDomainProviderResources({
    instanceId: config.instanceId ?? "unconfigured-instance",
    mappings: intent.mappings
      .filter((mapping) => options.host === undefined || mapping.host === options.host)
      .map((mapping) => ({
        enabled: mapping.enabled,
        host: mapping.host,
        profile: mapping.profile,
        ...(mapping.targetInstallId === undefined
          ? {}
          : { targetInstallId: mapping.targetInstallId }),
      })),
    policy: options.policy ?? "create-only",
    redirectIntents: redirectIntents
      .filter((intent) => options.host === undefined || intent.fromHost === options.host)
      .map((intent) => redirectIntentForPlan(intent)),
    workerName: config.workerName ?? "unconfigured-worker",
    zones: config.zones,
  });

  return {
    config,
    plan,
    redirectIntents,
  };
}

function domainProviderDeletePlan(
  storage: DurableObjectStorage,
  config: DomainProviderConfigStatus,
  options: DomainProviderDeleteOptions,
): { plan: DomainProviderPlan; targets: InstanceDomainProviderDeleteTarget[] } {
  const targets = readDomainProviderDeleteTargets(storage, config).filter((target) =>
    deleteTargetMatches(target, options),
  );
  const resources = targets.map((target) => resourceFromDeleteTarget(target, config));

  return {
    plan: {
      blockers: [],
      instanceId: normalizeLogicalIdPart(config.instanceId ?? "unconfigured-instance", "instance"),
      policy: "create-only",
      resources,
      workerName:
        config.workerName ??
        targets.find((target) => target.workerName !== undefined)?.workerName ??
        "unconfigured-worker",
    },
    targets,
  };
}

function readDomainProviderDeleteTargets(
  storage: DurableObjectStorage,
  config: DomainProviderConfigStatus,
): InstanceDomainProviderDeleteTarget[] {
  const targets: InstanceDomainProviderDeleteTarget[] = [];
  const instanceId = normalizeLogicalIdPart(
    config.instanceId ?? "unconfigured-instance",
    "instance",
  );

  for (const state of readInstanceDomainMappingAppliedStates(storage)) {
    if (state.action === "deleted" || state.action === "manually-removed") {
      continue;
    }

    const logicalId =
      state.alchemyResourceId ??
      logicalResourceId(
        instanceId,
        "custom-domain",
        state.host,
        state.profile,
        state.targetInstallId,
      );

    targets.push({
      accountId: state.accountId,
      action: state.action,
      ...(state.alchemyResourceId === undefined
        ? {}
        : { alchemyResourceId: state.alchemyResourceId }),
      host: state.host,
      kind: "cloudflare-worker-custom-domain",
      logicalId,
      profile: state.profile,
      resourceId: state.workerDomainId,
      resourceJson: JSON.stringify(state),
      ...(state.runnerId === undefined ? {} : { runnerId: state.runnerId }),
      ...(state.targetInstallId === undefined ? {} : { targetInstallId: state.targetInstallId }),
      workerName: state.workerName,
      zoneId: state.zoneId,
      zoneName: state.zoneName,
    });
  }

  for (const state of readAppliedProviderResources(storage)) {
    if (state.action === "deleted" || state.action === "manually-removed") {
      continue;
    }

    targets.push({
      accountId: state.accountId,
      action: state.action,
      alchemyResourceId: state.alchemyResourceId,
      host: state.host,
      kind: state.kind,
      logicalId: state.logicalId,
      resourceId: state.resourceId,
      resourceJson: state.resourceJson,
      ...(state.runnerId === undefined ? {} : { runnerId: state.runnerId }),
      zoneId: state.zoneId,
      zoneName: state.zoneName,
    });
  }

  return targets.sort((left, right) =>
    `${left.host}\u0000${left.kind}\u0000${left.logicalId}`.localeCompare(
      `${right.host}\u0000${right.kind}\u0000${right.logicalId}`,
    ),
  );
}

function deleteTargetMatches(
  target: InstanceDomainProviderDeleteTarget,
  options: DomainProviderDeleteOptions,
): boolean {
  return (
    (options.host === undefined || target.host === options.host) &&
    (options.kind === undefined || target.kind === options.kind) &&
    (options.logicalId === undefined || target.logicalId === options.logicalId)
  );
}

function resourceFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  config: DomainProviderConfigStatus,
): DomainProviderResource {
  switch (target.kind) {
    case "cloudflare-worker-custom-domain":
      return customDomainResourceFromDeleteTarget(target, config);
    case "cloudflare-redirect-rule":
      return redirectRuleResourceFromDeleteTarget(target);
    case "cloudflare-dns-records":
      return dnsRecordsResourceFromDeleteTarget(target);
  }
}

function customDomainResourceFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  config: DomainProviderConfigStatus,
): DomainProviderCustomDomainResource {
  if (!target.profile) {
    throw new Error(`Custom Domain delete target "${target.logicalId}" is missing a profile.`);
  }

  const workerName = target.workerName ?? config.workerName ?? "unconfigured-worker";

  return {
    kind: "cloudflare-worker-custom-domain",
    logicalId: target.logicalId,
    host: target.host,
    profile: target.profile,
    ...(target.targetInstallId === undefined ? {} : { targetInstallId: target.targetInstallId }),
    props: {
      adopt: target.action === "adopted" || target.action === "overridden",
      name: target.host,
      overrideExistingOrigin: target.action === "overridden",
      workerName,
      zoneId: target.zoneId,
    },
    zone: { id: target.zoneId, name: target.zoneName },
  };
}

function redirectRuleResourceFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
): DomainProviderRedirectRuleResource {
  const evidence = readStoredResourceJson(target.resourceJson);
  const targetUrl =
    typeof evidence.targetUrl === "string" && evidence.targetUrl.trim() !== ""
      ? evidence.targetUrl
      : `https://${target.host}/${"$"}{1}`;
  const preserveQueryString =
    typeof evidence.preserveQueryString === "boolean" ? evidence.preserveQueryString : true;
  const statusCode = isRedirectStatusCode(evidence.statusCode) ? evidence.statusCode : 301;
  const targetHost = targetUrlHost(targetUrl) ?? target.host;

  return {
    kind: "cloudflare-redirect-rule",
    logicalId: target.logicalId,
    fromHost: target.host,
    props: {
      description: `Formless redirect ${target.host} to ${targetHost}`,
      preserveQueryString,
      requestUrl: targetUrl.includes("${1}")
        ? `https://${target.host}/*`
        : `https://${target.host}/`,
      statusCode,
      targetUrl,
      zone: target.zoneId,
    },
    targetUrl,
    zone: { id: target.zoneId, name: target.zoneName },
  };
}

function dnsRecordsResourceFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
): DomainProviderDnsRecordsResource {
  return {
    kind: "cloudflare-dns-records",
    logicalId: target.logicalId,
    fromHost: target.host,
    props: {
      records: [
        {
          ...CLOUDFLARE_ORIGINLESS_REDIRECT_PLACEHOLDER_DNS,
          name: target.host,
        },
      ],
      zoneId: target.zoneId,
    },
    zone: { id: target.zoneId, name: target.zoneName },
  };
}

function domainProviderConfigStatus(
  env: DurableObjectDomainProviderEnv,
): DomainProviderConfigStatus {
  const instanceId = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID);
  const workerName = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_WORKER_NAME);
  const accountId =
    optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID) ??
    optionalEnv(env.CLOUDFLARE_ACCOUNT_ID);
  const cloudflareApiToken = optionalEnv(env.CLOUDFLARE_API_TOKEN) ?? optionalEnv(env.CF_API_TOKEN);
  const alchemyPassword = optionalEnv(env.ALCHEMY_PASSWORD);
  const zoneResult = parseConfiguredZones(env);
  const issues: DomainProviderConfigIssue[] = [];

  if (!instanceId) {
    issues.push(configIssue("missing-instance-id", ["FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID"]));
  }

  if (!workerName) {
    issues.push(configIssue("missing-worker-name", ["FORMLESS_DOMAIN_PROVIDER_WORKER_NAME"]));
  }

  if (!accountId) {
    issues.push(
      configIssue("missing-account-id", [
        "FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_ACCOUNT_ID",
      ]),
    );
  }

  if (!zoneResult.ok) {
    issues.push(zoneResult.issue);
  } else if (zoneResult.zones.length === 0) {
    issues.push(
      configIssue("missing-zone-config", [
        "FORMLESS_DOMAIN_PROVIDER_ZONES",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_ID",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_NAME",
      ]),
    );
  }

  const jobReady = Boolean(
    instanceId && workerName && accountId && zoneResult.ok && zoneResult.zones.length > 0,
  );
  const planReady = jobReady;
  const applyReady = jobReady;

  return {
    ...(accountId === undefined ? {} : { accountId }),
    alchemyPassword: {
      configured: Boolean(alchemyPassword),
      envNames: ["ALCHEMY_PASSWORD"],
    },
    applyReady,
    cloudflareApiToken: {
      configured: Boolean(cloudflareApiToken),
      envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
    },
    ...(instanceId === undefined ? {} : { instanceId }),
    issues,
    jobReady,
    planReady,
    runnerMutation: {
      checkedBy: "node-runner",
      requiredEnvNames: [...DOMAIN_PROVIDER_RUNNER_MUTATION_ENV_NAMES],
    },
    ...(workerName === undefined ? {} : { workerName }),
    zones: zoneResult.ok ? zoneResult.zones : [],
  };
}

function parseConfiguredZones(
  env: DurableObjectDomainProviderEnv,
): { ok: true; zones: DomainProviderZone[] } | { ok: false; issue: DomainProviderConfigIssue } {
  const zonesJson = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_ZONES);

  if (zonesJson !== undefined) {
    try {
      const parsed = JSON.parse(zonesJson) as unknown;

      if (!Array.isArray(parsed)) {
        return invalidZoneConfigIssue();
      }

      return { ok: true, zones: parsed.map(parseZone) };
    } catch {
      return invalidZoneConfigIssue();
    }
  }

  const zoneId = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_ZONE_ID);
  const zoneName = optionalEnv(env.FORMLESS_DOMAIN_PROVIDER_ZONE_NAME);

  if (zoneId === undefined && zoneName === undefined) {
    return { ok: true, zones: [] };
  }

  if (zoneId === undefined || zoneName === undefined) {
    return invalidZoneConfigIssue();
  }

  return { ok: true, zones: [{ id: zoneId, name: zoneName }] };
}

function parseZone(value: unknown): DomainProviderZone {
  if (!isRecord(value)) {
    throw new Error("Zone must be an object.");
  }

  const id = optionalEnv(value.id);
  const name = optionalEnv(value.name);

  if (id === undefined || name === undefined) {
    throw new Error("Zone id and name are required.");
  }

  return { id, name };
}

function invalidZoneConfigIssue(): { ok: false; issue: DomainProviderConfigIssue } {
  return {
    ok: false,
    issue: {
      code: "invalid-zone-config",
      envNames: [
        "FORMLESS_DOMAIN_PROVIDER_ZONES",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_ID",
        "FORMLESS_DOMAIN_PROVIDER_ZONE_NAME",
      ],
      message:
        'Domain provider zones must be configured as JSON [{"id":"zone-id","name":"example.com"}] or as one zone id/name pair.',
    },
  };
}

async function domainProviderRedirectsResponse(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  requestUrl: string,
): Promise<InstanceDomainProviderRedirectsResponse> {
  return {
    appliedResources: readAppliedProviderResources(storage),
    auditEvents: readProviderAuditEvents(storage),
    redirectIntentCleanupEvents: readRedirectIntentCleanupEvents(storage),
    redirectIntents: await readControlPlaneSyncedRedirectIntents(storage, env, requestUrl),
  };
}

async function readControlPlaneSyncedDomainProviderIntent(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  requestUrl: string,
): Promise<{
  mappings: InstanceDomainMapping[];
  redirectIntents: InstanceDomainProviderRedirectIntent[];
}> {
  if (env.FORMLESS_AUTHORITY) {
    await readBackfilledControlPlaneAppInstalls(
      storage,
      {
        ...env,
        FORMLESS_AUTHORITY: env.FORMLESS_AUTHORITY,
      },
      requestUrl,
    );
  }

  const mappingCleanupEvents = readInstanceDomainMappingDesiredCleanupEvents(storage);
  const redirectCleanupEvents = readRedirectIntentCleanupEvents(storage);
  const legacyMappings = readInstanceDomainMappings(storage).filter(
    (mapping) => !isForgottenDomainMapping(mapping, mappingCleanupEvents),
  );
  const legacyRedirectIntents = readDomainProviderRedirectIntents(storage).filter(
    (intent) => !isForgottenRedirectIntent(intent, redirectCleanupEvents),
  );
  const records = await readControlPlaneRecords({ env, requestUrl });

  if (records === undefined) {
    return {
      mappings: legacyMappings,
      redirectIntents: legacyRedirectIntents,
    };
  }

  const mappings = mergeDomainMappings(
    legacyMappings,
    domainMappingsFromControlPlaneRecords(records, mappingCleanupEvents),
  );
  const redirectIntents = mergeRedirectIntents(
    legacyRedirectIntents,
    redirectIntentsFromControlPlaneRecords(records, redirectCleanupEvents),
  );

  if (legacyMappings.length === 0 && legacyRedirectIntents.length === 0) {
    return { mappings, redirectIntents };
  }

  const syncedRecords = await syncDomainIntentToControlPlane({
    env,
    mappings,
    now: nowIsoString(),
    redirectIntents,
    requestUrl,
  });

  if (syncedRecords === undefined) {
    return { mappings, redirectIntents };
  }

  return {
    mappings: domainMappingsFromControlPlaneRecords(syncedRecords, mappingCleanupEvents),
    redirectIntents: redirectIntentsFromControlPlaneRecords(syncedRecords, redirectCleanupEvents),
  };
}

async function readControlPlaneSyncedRedirectIntents(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  requestUrl: string,
): Promise<InstanceDomainProviderRedirectIntent[]> {
  return (await readControlPlaneSyncedDomainProviderIntent(storage, env, requestUrl))
    .redirectIntents;
}

function domainMappingsFromControlPlaneRecords(
  records: readonly StoredRecord[],
  cleanupEvents: readonly InstanceDomainMappingDesiredCleanupEvent[],
): InstanceDomainMapping[] {
  return listInstanceDomainMappings(
    records
      .filter(
        (record) =>
          !record.deletedAt &&
          record.entity === "route" &&
          record.id.startsWith("route:host:") &&
          record.values.kind === "mount" &&
          typeof record.values.matchHost === "string",
      )
      .map((record) => {
        const profile = domainMappingProfileFromRouteTarget(record.values.targetProfile);
        const targetInstallId =
          typeof record.values.appInstall === "string" ? record.values.appInstall : undefined;

        return {
          host: String(record.values.matchHost),
          profile,
          ...(profile === "publicSite" ? { surface: "site" as const } : {}),
          ...(targetInstallId === undefined ? {} : { installId: targetInstallId, targetInstallId }),
          enabled: record.values.enabled === true,
          createdAt: String(record.values.createdAt),
          updatedAt: String(record.values.updatedAt),
        };
      }),
  ).filter((mapping) => !isForgottenDomainMapping(mapping, cleanupEvents));
}

function domainMappingProfileFromRouteTarget(value: unknown): InstanceDomainMapping["profile"] {
  if (value === "app" || value === "instance") {
    return value;
  }

  return "publicSite";
}

function mergeDomainMappings(
  legacyMappings: readonly InstanceDomainMapping[],
  routeMappings: readonly InstanceDomainMapping[],
): InstanceDomainMapping[] {
  const mappings = new Map<string, InstanceDomainMapping>();

  for (const mapping of legacyMappings) {
    mappings.set(domainMappingKey(mapping), mapping);
  }

  for (const mapping of routeMappings) {
    mappings.set(domainMappingKey(mapping), mapping);
  }

  return listInstanceDomainMappings([...mappings.values()]);
}

function isForgottenDomainMapping(
  mapping: InstanceDomainMapping,
  cleanupEvents: readonly InstanceDomainMappingDesiredCleanupEvent[],
): boolean {
  let lastCleanup: InstanceDomainMappingDesiredCleanupEvent | undefined;

  for (const event of cleanupEvents) {
    if (
      event.host === mapping.host &&
      event.profile === mapping.profile &&
      (!lastCleanup || event.recordedAt > lastCleanup.recordedAt)
    ) {
      lastCleanup = event;
    }
  }

  return lastCleanup !== undefined && lastCleanup.recordedAt >= mapping.updatedAt;
}

function domainMappingKey(mapping: Pick<InstanceDomainMapping, "host" | "profile">) {
  return `${mapping.profile}:${mapping.host}`;
}

function redirectIntentsFromControlPlaneRecords(
  records: readonly StoredRecord[],
  cleanupEvents: readonly InstanceDomainProviderRedirectIntentCleanupEvent[],
): InstanceDomainProviderRedirectIntent[] {
  return records
    .filter(
      (record) =>
        !record.deletedAt &&
        record.entity === "route" &&
        record.id.startsWith("route:redirect:") &&
        record.values.kind === "redirect" &&
        typeof record.values.matchHost === "string",
    )
    .map((record) => ({
      fromHost: String(record.values.matchHost),
      ...(typeof record.values.toHost === "string" ? { toHost: record.values.toHost } : {}),
      ...(typeof record.values.toUrl === "string" ? { toUrl: record.values.toUrl } : {}),
      statusCode: Number(record.values.statusCode) as DomainProviderRedirectStatusCode,
      preservePath: record.values.preservePath === true,
      preserveQueryString: record.values.preserveQueryString === true,
      enabled: record.values.enabled === true,
      createdAt: String(record.values.createdAt),
      updatedAt: String(record.values.updatedAt),
    }))
    .filter((intent) => !isForgottenRedirectIntent(intent, cleanupEvents))
    .sort((left, right) => left.fromHost.localeCompare(right.fromHost));
}

function mergeRedirectIntents(
  legacyIntents: readonly InstanceDomainProviderRedirectIntent[],
  routeIntents: readonly InstanceDomainProviderRedirectIntent[],
): InstanceDomainProviderRedirectIntent[] {
  const intents = new Map<string, InstanceDomainProviderRedirectIntent>();

  for (const intent of legacyIntents) {
    intents.set(intent.fromHost, intent);
  }

  for (const intent of routeIntents) {
    intents.set(intent.fromHost, intent);
  }

  return [...intents.values()].sort((left, right) => left.fromHost.localeCompare(right.fromHost));
}

function isForgottenRedirectIntent(
  intent: InstanceDomainProviderRedirectIntent,
  cleanupEvents: readonly InstanceDomainProviderRedirectIntentCleanupEvent[],
): boolean {
  let lastCleanup: InstanceDomainProviderRedirectIntentCleanupEvent | undefined;

  for (const event of cleanupEvents) {
    if (
      event.fromHost === intent.fromHost &&
      (!lastCleanup || event.recordedAt > lastCleanup.recordedAt)
    ) {
      lastCleanup = event;
    }
  }

  return lastCleanup !== undefined && lastCleanup.recordedAt >= intent.updatedAt;
}

async function writeControlPlaneRedirectIntents(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  requestUrl: string,
  input: { now: string; redirectIntents: readonly InstanceDomainProviderRedirectIntent[] },
): Promise<InstanceDomainProviderRedirectIntent[]> {
  const records = await syncDomainIntentToControlPlane({
    env,
    now: input.now,
    redirectIntents: [...input.redirectIntents],
    requestUrl,
  });

  if (records === undefined) {
    return [...input.redirectIntents].sort((left, right) =>
      left.fromHost.localeCompare(right.fromHost),
    );
  }

  return redirectIntentsFromControlPlaneRecords(records, readRedirectIntentCleanupEvents(storage));
}

function buildRedirectIntent(input: {
  currentRedirectIntents: readonly InstanceDomainProviderRedirectIntent[];
  intent: CreateInstanceDomainProviderRedirectIntentRequest;
  now: string;
}): {
  redirectIntent: InstanceDomainProviderRedirectIntent;
  redirectIntents: InstanceDomainProviderRedirectIntent[];
} {
  const current = input.currentRedirectIntents.find(
    (intent) => intent.fromHost === input.intent.fromHost,
  );
  const createdAt = current?.createdAt ?? input.now;
  const enabled = input.intent.enabled ?? true;
  const preservePath = input.intent.preservePath ?? true;
  const preserveQueryString = input.intent.preserveQueryString ?? true;
  const statusCode = input.intent.statusCode ?? 301;
  const redirectIntent: InstanceDomainProviderRedirectIntent = {
    createdAt,
    enabled,
    fromHost: input.intent.fromHost,
    preservePath,
    preserveQueryString,
    statusCode,
    ...(input.intent.toHost === undefined ? {} : { toHost: input.intent.toHost }),
    ...(input.intent.toUrl === undefined ? {} : { toUrl: input.intent.toUrl }),
    updatedAt: input.now,
  };

  return {
    redirectIntent,
    redirectIntents: mergeRedirectIntents(
      input.currentRedirectIntents.filter((intent) => intent.fromHost !== input.intent.fromHost),
      [redirectIntent],
    ),
  };
}

function disableRedirectIntent(input: {
  currentRedirectIntents: readonly InstanceDomainProviderRedirectIntent[];
  fromHost: string;
  now: string;
}):
  | {
      ok: true;
      redirectIntent: InstanceDomainProviderRedirectIntent;
      redirectIntents: InstanceDomainProviderRedirectIntent[];
    }
  | { ok: false; error: string } {
  const current = input.currentRedirectIntents.find((intent) => intent.fromHost === input.fromHost);

  if (!current) {
    return {
      ok: false,
      error: `Domain provider redirect intent for "${input.fromHost}" does not exist.`,
    };
  }

  const redirectIntent = {
    ...current,
    enabled: false,
    updatedAt: input.now,
  };

  return {
    ok: true,
    redirectIntent,
    redirectIntents: mergeRedirectIntents(
      input.currentRedirectIntents.filter((intent) => intent.fromHost !== input.fromHost),
      [redirectIntent],
    ),
  };
}

function forgetRedirectIntent(
  storage: DurableObjectStorage,
  input: {
    currentRedirectIntents: readonly InstanceDomainProviderRedirectIntent[];
    fromHost: string;
    now: string;
  },
):
  | {
      ok: true;
      redirectIntent: InstanceDomainProviderRedirectIntent;
      redirectIntentCleanupEvent: InstanceDomainProviderRedirectIntentCleanupEvent;
      redirectIntentCleanupEvents: InstanceDomainProviderRedirectIntentCleanupEvent[];
      redirectIntents: InstanceDomainProviderRedirectIntent[];
    }
  | { ok: false; code: string; error: string; status: number } {
  ensureDomainProviderRedirectIntentsTable(storage);
  ensureDomainProviderAppliedResourcesTables(storage);

  return storage.transactionSync(() => {
    const current = input.currentRedirectIntents.find(
      (intent) => intent.fromHost === input.fromHost,
    );

    if (!current) {
      return {
        ok: false,
        code: "domain-provider-redirect-not-found",
        error: `Domain provider redirect intent for "${input.fromHost}" does not exist.`,
        status: 404,
      };
    }

    if (current.enabled) {
      return {
        ok: false,
        code: "domain-provider-redirect-enabled",
        error: `Domain provider redirect intent for "${input.fromHost}" must be disabled before it can be forgotten.`,
        status: 409,
      };
    }

    const appliedResources = readAppliedProviderResources(storage).filter(
      (resource) => resource.host === current.fromHost,
    );

    if (appliedResources.length > 0) {
      return {
        ok: false,
        code: "domain-provider-redirect-has-applied-resources",
        error: `Domain provider redirect intent for "${input.fromHost}" has provider applied evidence and cannot be forgotten until provider cleanup clears it.`,
        status: 409,
      };
    }

    storage.sql.exec(
      `
        DELETE FROM instance_domain_provider_redirect_intents
        WHERE from_host = ?
      `,
      current.fromHost,
    );
    writeRedirectIntentCleanupEvent(storage, { intent: current, now: input.now });

    return {
      ok: true,
      redirectIntent: current,
      redirectIntentCleanupEvent: readLastRedirectIntentCleanupEvent(storage),
      redirectIntentCleanupEvents: readRedirectIntentCleanupEvents(storage),
      redirectIntents: input.currentRedirectIntents.filter(
        (intent) => intent.fromHost !== current.fromHost,
      ),
    };
  });
}

function readRedirectIntentCleanupEvents(
  storage: DurableObjectStorage,
): InstanceDomainProviderRedirectIntentCleanupEvent[] {
  ensureDomainProviderRedirectIntentCleanupEventsTable(storage);
  const events: InstanceDomainProviderRedirectIntentCleanupEvent[] = [];

  for (const row of storage.sql.exec<DomainProviderRedirectIntentCleanupEventRow>(
    `
      SELECT
        event_id,
        from_host,
        enabled,
        to_host,
        to_url,
        preserve_path,
        preserve_query_string,
        status_code,
        created_at,
        updated_at,
        action,
        reason,
        recorded_at
      FROM instance_domain_provider_redirect_intent_cleanup_events
      ORDER BY event_id ASC
    `,
  )) {
    events.push(redirectIntentCleanupEventFromRow(row));
  }

  return events;
}

function writeRedirectIntentCleanupEvent(
  storage: DurableObjectStorage,
  input: { intent: InstanceDomainProviderRedirectIntent; now: string },
) {
  ensureDomainProviderRedirectIntentCleanupEventsTable(storage);

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_redirect_intent_cleanup_events (
        from_host,
        enabled,
        to_host,
        to_url,
        preserve_path,
        preserve_query_string,
        status_code,
        created_at,
        updated_at,
        action,
        reason,
        recorded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    input.intent.fromHost,
    input.intent.enabled ? 1 : 0,
    input.intent.toHost ?? null,
    input.intent.toUrl ?? null,
    input.intent.preservePath ? 1 : 0,
    input.intent.preserveQueryString ? 1 : 0,
    input.intent.statusCode,
    input.intent.createdAt,
    input.intent.updatedAt,
    "forgotten",
    "disabled-unapplied",
    input.now,
  );
}

function readLastRedirectIntentCleanupEvent(
  storage: DurableObjectStorage,
): InstanceDomainProviderRedirectIntentCleanupEvent {
  for (const row of storage.sql.exec<DomainProviderRedirectIntentCleanupEventRow>(
    `
      SELECT
        event_id,
        from_host,
        enabled,
        to_host,
        to_url,
        preserve_path,
        preserve_query_string,
        status_code,
        created_at,
        updated_at,
        action,
        reason,
        recorded_at
      FROM instance_domain_provider_redirect_intent_cleanup_events
      WHERE event_id = last_insert_rowid()
      LIMIT 1
    `,
  )) {
    return redirectIntentCleanupEventFromRow(row);
  }

  throw new Error("Domain provider redirect cleanup event was not written.");
}

function redirectIntentCleanupEventFromRow(
  row: DomainProviderRedirectIntentCleanupEventRow,
): InstanceDomainProviderRedirectIntentCleanupEvent {
  return {
    ...redirectIntentFromRow(row),
    action: row.action,
    eventId: row.event_id,
    reason: row.reason,
    recordedAt: row.recorded_at,
  };
}

function redirectIntentForPlan(
  intent: InstanceDomainProviderRedirectIntent,
): DomainProviderRedirectIntent {
  return {
    enabled: intent.enabled,
    fromHost: intent.fromHost,
    preservePath: intent.preservePath,
    preserveQueryString: intent.preserveQueryString,
    statusCode: intent.statusCode,
    ...(intent.toHost === undefined ? {} : { toHost: intent.toHost }),
    ...(intent.toUrl === undefined ? {} : { toUrl: intent.toUrl }),
  };
}

function writeApplyJob(
  storage: DurableObjectStorage,
  input: {
    deployment: DomainProviderDeploymentJobLink;
    jobId: string;
    now: string;
    plan: DomainProviderPlan;
    runnerId?: string;
  },
): InstanceDomainProviderApplyJob {
  ensureDomainProviderApplyJobsTable(storage);

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_apply_jobs (
        job_id,
        status,
        runner_id,
        plan_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `,
    input.jobId,
    "ready",
    input.runnerId ?? null,
    JSON.stringify(input.plan),
    input.deployment.attemptId,
    input.deployment.desiredState.targetId,
    input.deployment.desiredState.versionId,
    input.deployment.desiredState.revision,
    input.deployment.desiredState.hash,
    input.deployment.leaseToken,
    input.now,
    input.now,
  );

  const job = readApplyJob(storage, input.jobId);

  if (!job) {
    throw new Error("Domain provider apply job was not written.");
  }

  return job;
}

function writeDeleteJob(
  storage: DurableObjectStorage,
  input: {
    deployment: DomainProviderDeploymentJobLink;
    jobId: string;
    now: string;
    plan: DomainProviderPlan;
    runnerId?: string;
    targets: readonly InstanceDomainProviderDeleteTarget[];
  },
): InstanceDomainProviderDeleteJob {
  ensureDomainProviderDeleteJobsTable(storage);

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_delete_jobs (
        job_id,
        status,
        runner_id,
        plan_json,
        targets_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `,
    input.jobId,
    "ready",
    input.runnerId ?? null,
    JSON.stringify(input.plan),
    JSON.stringify(input.targets),
    input.deployment.attemptId,
    input.deployment.desiredState.targetId,
    input.deployment.desiredState.versionId,
    input.deployment.desiredState.revision,
    input.deployment.desiredState.hash,
    input.deployment.leaseToken,
    input.now,
    input.now,
  );

  const job = readDeleteJob(storage, input.jobId);

  if (!job) {
    throw new Error("Domain provider delete job was not written.");
  }

  return job;
}

async function completeApplyJob(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    jobId: string;
    now: string;
    requestUrl: string;
    result: InstanceDomainProviderApplyJobResultRequest;
  },
): Promise<
  { ok: true; job: InstanceDomainProviderApplyJob } | { ok: false; error: string; status: number }
> {
  const job = readApplyJob(storage, input.jobId);

  if (!job) {
    return { ok: false, error: "Domain provider apply job was not found.", status: 404 };
  }

  if (job.status === "succeeded" || job.status === "failed") {
    return { ok: false, error: "Domain provider apply job is already complete.", status: 409 };
  }

  if (
    job.runnerId !== undefined &&
    input.result.runnerId !== undefined &&
    job.runnerId !== input.result.runnerId
  ) {
    return { ok: false, error: "Domain provider apply job runner id does not match.", status: 409 };
  }

  if (input.result.status === "failed") {
    const deploymentWriteback = await writeDomainProviderApplyDeploymentFailure(storage, {
      env: input.env,
      error: input.result.error,
      job,
      now: input.now,
      requestUrl: input.requestUrl,
      runnerId: input.result.runnerId,
    });

    if (!deploymentWriteback.ok) {
      return deploymentWriteback;
    }

    return finishApplyJob(storage, {
      error: input.result.error,
      job,
      now: input.now,
      result: { error: input.result.error, evidenceCount: 0 },
      runnerId: input.result.runnerId,
      status: "failed",
    });
  }

  const validated = validateApplyEvidence(job.plan, input.result.resources);

  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const currentIntent = await readControlPlaneSyncedDomainProviderIntent(
    storage,
    input.env,
    input.requestUrl,
  );

  for (const evidence of input.result.resources) {
    if (evidence.kind === "cloudflare-worker-custom-domain") {
      const recorded = recordInstanceDomainMappingApplyEvidence(storage, {
        action: evidence.action,
        alchemyResourceId: evidence.alchemyResourceId,
        existingMappings: currentIntent.mappings,
        host: evidence.host,
        now: input.now,
        profile: evidence.profile,
        provider: "cloudflare-worker-custom-domain",
        runnerId: input.result.runnerId ?? job.runnerId,
        ...(evidence.targetInstallId === undefined
          ? {}
          : { targetInstallId: evidence.targetInstallId }),
        accountId: evidence.accountId,
        workerDomainId: evidence.workerDomainId,
        workerName: evidence.workerName,
        zoneId: evidence.zoneId,
        zoneName: evidence.zoneName,
      });

      if (!recorded.ok) {
        return { ok: false, error: recorded.error.message, status: 400 };
      }

      continue;
    }

    recordDomainProviderResourceEvidence(storage, {
      evidence,
      now: input.now,
      runnerId: input.result.runnerId ?? job.runnerId,
    });
  }

  const deploymentWriteback = await writeDomainProviderApplyDeploymentSuccess(storage, {
    env: input.env,
    job,
    now: input.now,
    requestUrl: input.requestUrl,
    resources: input.result.resources,
    runnerId: input.result.runnerId,
  });

  if (!deploymentWriteback.ok) {
    return deploymentWriteback;
  }

  return finishApplyJob(storage, {
    job,
    now: input.now,
    result: { evidenceCount: input.result.resources.length },
    runnerId: input.result.runnerId,
    status: "succeeded",
  });
}

async function completeDeleteJob(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    jobId: string;
    now: string;
    requestUrl: string;
    result: InstanceDomainProviderDeleteJobResultRequest;
  },
): Promise<
  { ok: true; job: InstanceDomainProviderDeleteJob } | { ok: false; error: string; status: number }
> {
  const job = readDeleteJob(storage, input.jobId);

  if (!job) {
    return { ok: false, error: "Domain provider delete job was not found.", status: 404 };
  }

  if (job.status === "succeeded" || job.status === "failed") {
    return { ok: false, error: "Domain provider delete job is already complete.", status: 409 };
  }

  if (
    job.runnerId !== undefined &&
    input.result.runnerId !== undefined &&
    job.runnerId !== input.result.runnerId
  ) {
    return {
      ok: false,
      error: "Domain provider delete job runner id does not match.",
      status: 409,
    };
  }

  if (input.result.status === "failed") {
    const deploymentWriteback = await writeDomainProviderDeleteDeploymentFailure(storage, {
      env: input.env,
      error: input.result.error,
      job,
      now: input.now,
      requestUrl: input.requestUrl,
      runnerId: input.result.runnerId,
    });

    if (!deploymentWriteback.ok) {
      return deploymentWriteback;
    }

    return finishDeleteJob(storage, {
      error: input.result.error,
      job,
      now: input.now,
      result: { error: input.result.error, evidenceCount: 0 },
      runnerId: input.result.runnerId,
      status: "failed",
    });
  }

  const validated = validateDeleteEvidence(job, input.result.resources);

  if (!validated.ok) {
    return { ok: false, error: validated.error, status: 400 };
  }

  const targets = new Map(job.targets.map((target) => [target.logicalId, target]));

  for (const evidence of input.result.resources) {
    const target = targets.get(evidence.logicalId);

    if (!target) {
      return {
        ok: false,
        error: `Domain provider delete evidence resource "${evidence.logicalId}" was not in the job.`,
        status: 400,
      };
    }

    if (target.kind === "cloudflare-worker-custom-domain") {
      deleteInstanceDomainMappingAppliedState(storage, {
        now: input.now,
        runnerId: input.result.runnerId ?? job.runnerId,
        state: customDomainAppliedStateFromDeleteTarget(target, input.now),
      });
      continue;
    }

    deleteDomainProviderAppliedResource(storage, {
      now: input.now,
      runnerId: input.result.runnerId ?? job.runnerId,
      target,
    });
  }

  const deploymentWriteback = await writeDomainProviderDeleteDeploymentSuccess(storage, {
    env: input.env,
    job,
    now: input.now,
    requestUrl: input.requestUrl,
    resources: input.result.resources,
    runnerId: input.result.runnerId,
  });

  if (!deploymentWriteback.ok) {
    return deploymentWriteback;
  }

  return finishDeleteJob(storage, {
    job,
    now: input.now,
    result: { evidenceCount: input.result.resources.length },
    runnerId: input.result.runnerId,
    status: "succeeded",
  });
}

async function writeDomainProviderApplyDeploymentFailure(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    error: string;
    job: InstanceDomainProviderApplyJob;
    now: string;
    requestUrl: string;
    runnerId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const deployment = readApplyJobDeploymentLink(storage, input.job.jobId);

  if (!deployment) {
    return { ok: true };
  }

  const result = writeDeploymentAttemptFailure(storage, {
    actor: domainProviderApplyDeploymentActor(input.runnerId ?? input.job.runnerId),
    attemptId: deployment.attemptId,
    desiredState: deployment.desiredState,
    leaseToken: deployment.leaseToken,
    now: input.now,
    runnerId: input.runnerId ?? input.job.runnerId,
    summary: {
      code: "domain-provider-apply-failed",
      displayMessage: input.error,
    },
  });

  return deploymentWritebackResult(result);
}

async function writeDomainProviderApplyDeploymentSuccess(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    job: InstanceDomainProviderApplyJob;
    now: string;
    requestUrl: string;
    resources: readonly InstanceDomainProviderApplyJobResourceEvidence[];
    runnerId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const deployment = readApplyJobDeploymentLink(storage, input.job.jobId);

  if (!deployment) {
    return { ok: true };
  }

  const result = writeDeploymentAttemptSuccess(storage, {
    alchemy: domainProviderDeploymentAlchemyPointer(input.job.plan),
    attemptId: deployment.attemptId,
    desiredState: deployment.desiredState,
    evidence: input.resources.map((resource) =>
      deploymentEvidenceSummaryFromApplyEvidence(resource, deployment.desiredState.targetId),
    ),
    leaseToken: deployment.leaseToken,
    now: input.now,
    runnerId: input.runnerId ?? input.job.runnerId,
  });

  return deploymentWritebackResult(result);
}

async function writeDomainProviderDeleteDeploymentFailure(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    error: string;
    job: InstanceDomainProviderDeleteJob;
    now: string;
    requestUrl: string;
    runnerId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const deployment = readDeleteJobDeploymentLink(storage, input.job.jobId);

  if (!deployment) {
    return { ok: true };
  }

  const result = writeDeploymentAttemptFailure(storage, {
    actor: domainProviderDeleteDeploymentActor(input.runnerId ?? input.job.runnerId),
    attemptId: deployment.attemptId,
    desiredState: deployment.desiredState,
    leaseToken: deployment.leaseToken,
    now: input.now,
    runnerId: input.runnerId ?? input.job.runnerId,
    summary: {
      code: "domain-provider-delete-failed",
      displayMessage: input.error,
    },
  });

  return deploymentWritebackResult(result);
}

async function writeDomainProviderDeleteDeploymentSuccess(
  storage: DurableObjectStorage,
  input: {
    env: DurableObjectDomainProviderEnv;
    job: InstanceDomainProviderDeleteJob;
    now: string;
    requestUrl: string;
    resources: readonly InstanceDomainProviderDeleteJobResourceEvidence[];
    runnerId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const deployment = readDeleteJobDeploymentLink(storage, input.job.jobId);

  if (!deployment) {
    return { ok: true };
  }

  const targets = new Map(input.job.targets.map((target) => [target.logicalId, target]));
  const evidence: DeploymentResourceEvidenceSummary[] = [];

  for (const resource of input.resources) {
    const target = targets.get(resource.logicalId);

    if (!target) {
      return {
        ok: false,
        error: `Domain provider delete evidence resource "${resource.logicalId}" was not in the job.`,
        status: 400,
      };
    }

    evidence.push(
      deploymentEvidenceSummaryFromDeleteTarget(target, deployment.desiredState.targetId),
    );
  }

  const result = writeDeploymentAttemptSuccess(storage, {
    alchemy: domainProviderDeploymentAlchemyPointer(input.job.plan),
    attemptId: deployment.attemptId,
    desiredState: deployment.desiredState,
    evidence,
    leaseToken: deployment.leaseToken,
    now: input.now,
    runnerId: input.runnerId ?? input.job.runnerId,
  });

  return deploymentWritebackResult(result);
}

function deploymentWritebackResult(
  result:
    | { ok: true }
    | {
        ok: false;
        error: string;
        status: number;
      },
): { ok: true } | { ok: false; error: string; status: number } {
  return result.ok ? { ok: true } : { ok: false, error: result.error, status: result.status };
}

function domainProviderDeploymentAlchemyPointer(
  plan: DomainProviderPlan,
): DeploymentAlchemyStatePointer {
  return {
    app: `formless-domain-${plan.instanceId}`,
    scope: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
    stage: "production",
  };
}

function deploymentEvidenceSummaryFromApplyEvidence(
  evidence: InstanceDomainProviderApplyJobResourceEvidence,
  targetId: DeploymentDesiredStateVersionRef["targetId"],
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

function deploymentEvidenceSummaryFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  targetId: DeploymentDesiredStateVersionRef["targetId"],
): DeploymentResourceEvidenceSummary {
  return {
    action: "deleted",
    ...(target.alchemyResourceId === undefined
      ? {}
      : { alchemyResourceId: target.alchemyResourceId }),
    displayName: target.host,
    kind: target.kind,
    logicalId: target.logicalId,
    providerFamily: "cloudflare",
    providerResourceIds: providerResourceIdsFromDeleteTarget(target),
    targetId,
  };
}

function deploymentEvidenceActionFromApplyAction(
  action: InstanceDomainProviderApplyJobResourceEvidence["action"],
): DeploymentResourceEvidenceSummary["action"] {
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

function providerResourceIdsFromDeleteTarget(target: InstanceDomainProviderDeleteTarget): string[] {
  if (target.kind === "cloudflare-dns-records") {
    return target.resourceId.split(",").filter((resourceId) => resourceId.length > 0);
  }

  return [target.resourceId];
}

function finishApplyJob(
  storage: DurableObjectStorage,
  input: {
    error?: string;
    job: InstanceDomainProviderApplyJob;
    now: string;
    result: InstanceDomainProviderApplyJobResultSummary;
    runnerId?: string;
    status: "failed" | "succeeded";
  },
): { ok: true; job: InstanceDomainProviderApplyJob } {
  ensureDomainProviderApplyJobsTable(storage);

  storage.sql.exec(
    `
      UPDATE instance_domain_provider_apply_jobs
      SET status = ?,
          runner_id = ?,
          result_json = ?,
          error = ?,
          updated_at = ?
      WHERE job_id = ?
    `,
    input.status,
    input.runnerId ?? input.job.runnerId ?? null,
    JSON.stringify(input.result),
    input.error ?? null,
    input.now,
    input.job.jobId,
  );
  releaseDomainProviderApplyLock(storage);

  const job = readApplyJob(storage, input.job.jobId);

  if (!job) {
    throw new Error("Domain provider apply job disappeared after completion.");
  }

  return { ok: true, job };
}

function finishDeleteJob(
  storage: DurableObjectStorage,
  input: {
    error?: string;
    job: InstanceDomainProviderDeleteJob;
    now: string;
    result: InstanceDomainProviderApplyJobResultSummary;
    runnerId?: string;
    status: "failed" | "succeeded";
  },
): { ok: true; job: InstanceDomainProviderDeleteJob } {
  ensureDomainProviderDeleteJobsTable(storage);

  storage.sql.exec(
    `
      UPDATE instance_domain_provider_delete_jobs
      SET status = ?,
          runner_id = ?,
          result_json = ?,
          error = ?,
          updated_at = ?
      WHERE job_id = ?
    `,
    input.status,
    input.runnerId ?? input.job.runnerId ?? null,
    JSON.stringify(input.result),
    input.error ?? null,
    input.now,
    input.job.jobId,
  );
  releaseDomainProviderApplyLock(storage);

  const job = readDeleteJob(storage, input.job.jobId);

  if (!job) {
    throw new Error("Domain provider delete job disappeared after completion.");
  }

  return { ok: true, job };
}

function validateDeleteEvidence(
  job: InstanceDomainProviderDeleteJob,
  resources: readonly InstanceDomainProviderDeleteJobResourceEvidence[],
): { ok: true } | { ok: false; error: string } {
  const targets = new Map(job.targets.map((target) => [target.logicalId, target]));
  const evidenceIds = new Set(resources.map((resource) => resource.logicalId));

  for (const target of job.targets) {
    if (!evidenceIds.has(target.logicalId)) {
      return {
        ok: false,
        error: `Domain provider delete evidence is missing resource "${target.logicalId}".`,
      };
    }
  }

  for (const evidence of resources) {
    const target = targets.get(evidence.logicalId);

    if (!target) {
      return {
        ok: false,
        error: `Domain provider delete evidence resource "${evidence.logicalId}" was not in the job.`,
      };
    }

    if (
      evidence.action !== "deleted" ||
      evidence.host !== target.host ||
      evidence.kind !== target.kind
    ) {
      return {
        ok: false,
        error: `Domain provider delete evidence for "${evidence.logicalId}" does not match the job target.`,
      };
    }
  }

  return { ok: true };
}

function validateApplyEvidence(
  plan: DomainProviderPlan,
  resources: readonly InstanceDomainProviderApplyJobResourceEvidence[],
): { ok: true } | { ok: false; error: string } {
  const plannedResources = new Map(
    plan.resources.map((resource) => [resource.logicalId, resource]),
  );

  for (const evidence of resources) {
    const resource = plannedResources.get(evidence.logicalId);

    if (!resource) {
      return {
        ok: false,
        error: `Domain provider apply evidence resource "${evidence.logicalId}" was not in the job plan.`,
      };
    }

    const valid = validateResourceEvidence(resource, evidence);

    if (!valid.ok) {
      return valid;
    }
  }

  return { ok: true };
}

function validateResourceEvidence(
  resource: DomainProviderResource,
  evidence: InstanceDomainProviderApplyJobResourceEvidence,
): { ok: true } | { ok: false; error: string } {
  switch (resource.kind) {
    case "cloudflare-worker-custom-domain":
      if (
        evidence.kind !== resource.kind ||
        evidence.host !== resource.host ||
        evidence.profile !== resource.profile ||
        evidence.targetInstallId !== resource.targetInstallId ||
        evidence.workerName !== resource.props.workerName ||
        evidence.zoneId !== resource.zone.id ||
        evidence.zoneName !== resource.zone.name
      ) {
        return {
          ok: false,
          error: `Domain provider apply evidence for "${resource.logicalId}" does not match the job plan.`,
        };
      }

      return { ok: true };
    case "cloudflare-redirect-rule":
      if (
        evidence.kind !== resource.kind ||
        evidence.host !== resource.fromHost ||
        evidence.targetUrl !== resource.targetUrl ||
        evidence.statusCode !== resource.props.statusCode ||
        evidence.preserveQueryString !== resource.props.preserveQueryString ||
        evidence.zoneId !== resource.zone.id ||
        evidence.zoneName !== resource.zone.name
      ) {
        return {
          ok: false,
          error: `Domain provider apply evidence for "${resource.logicalId}" does not match the job plan.`,
        };
      }

      return { ok: true };
    case "cloudflare-dns-records":
      if (
        evidence.kind !== resource.kind ||
        evidence.host !== resource.fromHost ||
        evidence.zoneId !== resource.zone.id ||
        evidence.zoneName !== resource.zone.name
      ) {
        return {
          ok: false,
          error: `Domain provider apply evidence for "${resource.logicalId}" does not match the job plan.`,
        };
      }

      return { ok: true };
  }
}

function recordDomainProviderResourceEvidence(
  storage: DurableObjectStorage,
  input: {
    evidence: Exclude<
      InstanceDomainProviderApplyJobResourceEvidence,
      { kind: "cloudflare-worker-custom-domain" }
    >;
    now: string;
    runnerId?: string;
  },
) {
  ensureDomainProviderAppliedResourcesTables(storage);
  const state = providerAppliedResourceFromEvidence(input.evidence, {
    now: input.now,
    runnerId: input.runnerId,
  });

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_applied_resources (
        logical_id,
        kind,
        host,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        resource_id,
        resource_json,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(logical_id) DO UPDATE SET
        kind = excluded.kind,
        host = excluded.host,
        account_id = excluded.account_id,
        alchemy_resource_id = excluded.alchemy_resource_id,
        runner_id = excluded.runner_id,
        zone_id = excluded.zone_id,
        zone_name = excluded.zone_name,
        resource_id = excluded.resource_id,
        resource_json = excluded.resource_json,
        action = excluded.action,
        applied_at = excluded.applied_at,
        updated_at = excluded.updated_at
    `,
    state.logicalId,
    state.kind,
    state.host,
    state.accountId,
    state.alchemyResourceId,
    state.runnerId ?? null,
    state.zoneId,
    state.zoneName,
    state.resourceId,
    state.resourceJson,
    state.action,
    state.appliedAt,
    state.updatedAt,
  );

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_audit_events (
        logical_id,
        kind,
        host,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        resource_id,
        resource_json,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    state.logicalId,
    state.kind,
    state.host,
    state.accountId,
    state.alchemyResourceId,
    state.runnerId ?? null,
    state.zoneId,
    state.zoneName,
    state.resourceId,
    state.resourceJson,
    state.action,
    state.appliedAt,
    state.updatedAt,
  );
}

function deleteDomainProviderAppliedResource(
  storage: DurableObjectStorage,
  input: {
    action?: Extract<
      InstanceDomainProviderAppliedResourceState["action"],
      "deleted" | "manually-removed"
    >;
    now: string;
    runnerId?: string;
    target: InstanceDomainProviderDeleteTarget;
  },
) {
  ensureDomainProviderAppliedResourcesTables(storage);
  const deletedState: InstanceDomainProviderAppliedResourceState = {
    accountId: input.target.accountId,
    action: input.action ?? "deleted",
    alchemyResourceId: input.target.alchemyResourceId ?? input.target.logicalId,
    appliedAt: input.now,
    host: input.target.host,
    kind: input.target.kind,
    logicalId: input.target.logicalId,
    resourceId: input.target.resourceId,
    resourceJson: input.target.resourceJson,
    ...(input.runnerId === undefined ? {} : { runnerId: input.runnerId }),
    updatedAt: input.now,
    zoneId: input.target.zoneId,
    zoneName: input.target.zoneName,
  };

  storage.sql.exec(
    `
      DELETE FROM instance_domain_provider_applied_resources
      WHERE logical_id = ?
    `,
    input.target.logicalId,
  );

  storage.sql.exec(
    `
      INSERT INTO instance_domain_provider_audit_events (
        logical_id,
        kind,
        host,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        resource_id,
        resource_json,
        action,
        applied_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    deletedState.logicalId,
    deletedState.kind,
    deletedState.host,
    deletedState.accountId,
    deletedState.alchemyResourceId,
    deletedState.runnerId ?? null,
    deletedState.zoneId,
    deletedState.zoneName,
    deletedState.resourceId,
    deletedState.resourceJson,
    deletedState.action,
    deletedState.appliedAt,
    deletedState.updatedAt,
  );
}

function markDomainProviderResourceManuallyRemoved(
  storage: DurableObjectStorage,
  input: {
    now: string;
    request: InstanceDomainProviderManualCleanupRequest;
    targetConfig: DomainProviderConfigStatus;
    targetOptions: Required<DomainProviderDeleteOptions>;
  },
):
  | { ok: true; target: InstanceDomainProviderDeleteTarget }
  | { ok: false; code: string; error: string; status: number } {
  ensureDomainProviderAppliedResourcesTables(storage);

  const deletePlan = domainProviderDeletePlan(storage, input.targetConfig, input.targetOptions);

  if (deletePlan.targets.length === 0) {
    return {
      ok: false,
      code: "domain-provider-manual-cleanup-not-found",
      error: `Domain provider manual cleanup found no recorded ${input.request.kind} resource "${input.request.logicalId}" for "${input.request.host}".`,
      status: 404,
    };
  }

  if (deletePlan.targets.length > 1) {
    return {
      ok: false,
      code: "domain-provider-manual-cleanup-ambiguous",
      error:
        "Domain provider manual cleanup requires one exact recorded provider resource identity.",
      status: 409,
    };
  }

  const target = deletePlan.targets[0];

  if (!target) {
    throw new Error("Domain provider manual cleanup target disappeared.");
  }

  if (target.kind === "cloudflare-worker-custom-domain") {
    deleteInstanceDomainMappingAppliedState(storage, {
      action: "manually-removed",
      now: input.now,
      state: customDomainAppliedStateFromDeleteTarget(target, input.now),
    });

    return { ok: true, target };
  }

  deleteDomainProviderAppliedResource(storage, {
    action: "manually-removed",
    now: input.now,
    target,
  });

  return { ok: true, target };
}

function customDomainAppliedStateFromDeleteTarget(
  target: InstanceDomainProviderDeleteTarget,
  now: string,
): InstanceDomainMappingAppliedState {
  if (!target.profile || !target.workerName) {
    throw new Error(`Custom Domain delete target "${target.logicalId}" is incomplete.`);
  }

  return {
    accountId: target.accountId,
    action: target.action,
    appliedAt: now,
    host: target.host,
    ...(target.alchemyResourceId === undefined
      ? {}
      : { alchemyResourceId: target.alchemyResourceId }),
    profile: target.profile,
    provider: "cloudflare-worker-custom-domain",
    ...(target.runnerId === undefined ? {} : { runnerId: target.runnerId }),
    ...(target.targetInstallId === undefined
      ? {}
      : { installId: target.targetInstallId, targetInstallId: target.targetInstallId }),
    updatedAt: now,
    workerDomainId: target.resourceId,
    workerName: target.workerName,
    zoneId: target.zoneId,
    zoneName: target.zoneName,
  };
}

function providerAppliedResourceFromEvidence(
  evidence: Exclude<
    InstanceDomainProviderApplyJobResourceEvidence,
    { kind: "cloudflare-worker-custom-domain" }
  >,
  input: { now: string; runnerId?: string },
): InstanceDomainProviderAppliedResourceState {
  return {
    accountId: evidence.accountId,
    action: evidence.action,
    alchemyResourceId: evidence.alchemyResourceId,
    appliedAt: input.now,
    host: evidence.host,
    kind: evidence.kind,
    logicalId: evidence.logicalId,
    resourceId:
      evidence.kind === "cloudflare-redirect-rule"
        ? evidence.redirectRuleId
        : evidence.dnsRecordIds.join(","),
    resourceJson: JSON.stringify(evidence),
    ...(input.runnerId === undefined ? {} : { runnerId: input.runnerId }),
    updatedAt: input.now,
    zoneId: evidence.zoneId,
    zoneName: evidence.zoneName,
  };
}

function readAppliedProviderResources(
  storage: DurableObjectStorage,
): InstanceDomainProviderAppliedResourceState[] {
  ensureDomainProviderAppliedResourcesTables(storage);
  const resources: InstanceDomainProviderAppliedResourceState[] = [];

  for (const row of storage.sql.exec<DomainProviderAppliedResourceRow>(
    `
      SELECT
        logical_id,
        kind,
        host,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        resource_id,
        resource_json,
        action,
        applied_at,
        updated_at
      FROM instance_domain_provider_applied_resources
      ORDER BY host ASC, kind ASC, logical_id ASC
    `,
  )) {
    resources.push(providerAppliedResourceFromRow(row));
  }

  return resources;
}

function readProviderAuditEvents(
  storage: DurableObjectStorage,
): InstanceDomainProviderAuditEvent[] {
  ensureDomainProviderAppliedResourcesTables(storage);
  const events: InstanceDomainProviderAuditEvent[] = [];

  for (const row of storage.sql.exec<DomainProviderAuditEventRow>(
    `
      SELECT
        event_id,
        logical_id,
        kind,
        host,
        account_id,
        alchemy_resource_id,
        runner_id,
        zone_id,
        zone_name,
        resource_id,
        resource_json,
        action,
        applied_at,
        updated_at
      FROM instance_domain_provider_audit_events
      ORDER BY event_id ASC
    `,
  )) {
    events.push({
      eventId: row.event_id,
      ...providerAppliedResourceFromRow(row),
    });
  }

  return events;
}

function providerAppliedResourceFromRow(
  row: DomainProviderAppliedResourceRow,
): InstanceDomainProviderAppliedResourceState {
  return {
    accountId: row.account_id,
    action: row.action,
    alchemyResourceId: row.alchemy_resource_id,
    appliedAt: row.applied_at,
    host: row.host,
    kind: row.kind,
    logicalId: row.logical_id,
    resourceId: row.resource_id,
    resourceJson: row.resource_json,
    ...(row.runner_id === null ? {} : { runnerId: row.runner_id }),
    updatedAt: row.updated_at,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
  };
}

function readApplyJob(
  storage: DurableObjectStorage,
  jobId: string,
): InstanceDomainProviderApplyJob | undefined {
  ensureDomainProviderApplyJobsTable(storage);

  for (const row of storage.sql.exec<DomainProviderApplyJobRow>(
    `
      SELECT
        job_id,
        status,
        runner_id,
        plan_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      FROM instance_domain_provider_apply_jobs
      WHERE job_id = ?
      LIMIT 1
    `,
    jobId,
  )) {
    return applyJobFromRow(row);
  }

  return undefined;
}

function readDeleteJob(
  storage: DurableObjectStorage,
  jobId: string,
): InstanceDomainProviderDeleteJob | undefined {
  ensureDomainProviderDeleteJobsTable(storage);

  for (const row of storage.sql.exec<DomainProviderDeleteJobRow>(
    `
      SELECT
        job_id,
        status,
        runner_id,
        plan_json,
        targets_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      FROM instance_domain_provider_delete_jobs
      WHERE job_id = ?
      LIMIT 1
    `,
    jobId,
  )) {
    return deleteJobFromRow(row);
  }

  return undefined;
}

function readApplyJobDeploymentLink(
  storage: DurableObjectStorage,
  jobId: string,
): DomainProviderDeploymentJobLink | undefined {
  ensureDomainProviderApplyJobsTable(storage);

  for (const row of storage.sql.exec<DomainProviderApplyJobRow>(
    `
      SELECT
        job_id,
        status,
        runner_id,
        plan_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      FROM instance_domain_provider_apply_jobs
      WHERE job_id = ?
      LIMIT 1
    `,
    jobId,
  )) {
    return deploymentJobLinkFromRow(row);
  }

  return undefined;
}

function readDeleteJobDeploymentLink(
  storage: DurableObjectStorage,
  jobId: string,
): DomainProviderDeploymentJobLink | undefined {
  ensureDomainProviderDeleteJobsTable(storage);

  for (const row of storage.sql.exec<DomainProviderDeleteJobRow>(
    `
      SELECT
        job_id,
        status,
        runner_id,
        plan_json,
        targets_json,
        deployment_attempt_id,
        deployment_target_id,
        deployment_desired_state_version_id,
        deployment_desired_state_revision,
        deployment_desired_state_hash,
        deployment_lease_token,
        result_json,
        error,
        created_at,
        updated_at
      FROM instance_domain_provider_delete_jobs
      WHERE job_id = ?
      LIMIT 1
    `,
    jobId,
  )) {
    return deploymentJobLinkFromRow(row);
  }

  return undefined;
}

function deploymentJobLinkFromRow(
  row: Pick<
    DomainProviderApplyJobRow,
    | "deployment_attempt_id"
    | "deployment_desired_state_hash"
    | "deployment_desired_state_revision"
    | "deployment_desired_state_version_id"
    | "deployment_lease_token"
    | "deployment_target_id"
  >,
): DomainProviderDeploymentJobLink | undefined {
  if (
    row.deployment_attempt_id === null ||
    row.deployment_desired_state_hash === null ||
    row.deployment_desired_state_revision === null ||
    row.deployment_desired_state_version_id === null ||
    row.deployment_lease_token === null ||
    row.deployment_target_id === null
  ) {
    return undefined;
  }

  return {
    attemptId: row.deployment_attempt_id,
    desiredState: {
      hash: row.deployment_desired_state_hash,
      revision: row.deployment_desired_state_revision,
      targetId: row.deployment_target_id,
      versionId: row.deployment_desired_state_version_id,
    },
    leaseToken: row.deployment_lease_token,
  };
}

function applyJobFromRow(row: DomainProviderApplyJobRow): InstanceDomainProviderApplyJob {
  const result =
    row.result_json === null
      ? undefined
      : (JSON.parse(row.result_json) as InstanceDomainProviderApplyJobResultSummary);

  return {
    createdAt: row.created_at,
    jobId: row.job_id,
    plan: JSON.parse(row.plan_json) as DomainProviderPlan,
    ...(result === undefined ? {} : { result }),
    ...(row.runner_id === null ? {} : { runnerId: row.runner_id }),
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function deleteJobFromRow(row: DomainProviderDeleteJobRow): InstanceDomainProviderDeleteJob {
  const result =
    row.result_json === null
      ? undefined
      : (JSON.parse(row.result_json) as InstanceDomainProviderApplyJobResultSummary);

  return {
    createdAt: row.created_at,
    jobId: row.job_id,
    plan: JSON.parse(row.plan_json) as DomainProviderPlan,
    ...(result === undefined ? {} : { result }),
    ...(row.runner_id === null ? {} : { runnerId: row.runner_id }),
    status: row.status,
    targets: JSON.parse(row.targets_json) as InstanceDomainProviderDeleteTarget[],
    updatedAt: row.updated_at,
  };
}

function acquireDomainProviderApplyLock(
  storage: DurableObjectStorage,
  acquiredAt: string,
): DomainProviderApplyLockResult {
  ensureDomainProviderApplyLockTable(storage);

  return storage.transactionSync(() => {
    const existing = readDomainProviderApplyLock(storage);

    if (existing) {
      return {
        acquired: false,
        acquiredAt: existing.acquiredAt,
      };
    }

    storage.sql.exec(
      `
        INSERT INTO instance_domain_provider_apply_lock (lock_id, acquired_at)
        VALUES (?, ?)
      `,
      APPLY_LOCK_ID,
      acquiredAt,
    );

    return { acquired: true };
  });
}

function releaseDomainProviderApplyLock(storage: DurableObjectStorage) {
  ensureDomainProviderApplyLockTable(storage);
  storage.sql.exec(
    `
      DELETE FROM instance_domain_provider_apply_lock
      WHERE lock_id = ?
    `,
    APPLY_LOCK_ID,
  );
}

function readDomainProviderApplyLock(
  storage: DurableObjectStorage,
): { acquiredAt: string } | undefined {
  for (const row of storage.sql.exec<{ acquired_at: string }>(
    `
      SELECT acquired_at
      FROM instance_domain_provider_apply_lock
      WHERE lock_id = ?
      LIMIT 1
    `,
    APPLY_LOCK_ID,
  )) {
    return { acquiredAt: row.acquired_at };
  }

  return undefined;
}

function ensureDomainProviderApplyLockTable(storage: DurableObjectStorage) {
  storage.sql.exec(applyLockTableSql);
}

function ensureDomainProviderApplyJobsTable(storage: DurableObjectStorage) {
  storage.sql.exec(applyJobsTableSql);
  runSqlStorageMigrations(storage, {
    family: domainProviderApplyJobsSqlMigrationFamily,
    migrations: domainProviderSqlMigrations,
  });
}

function ensureDomainProviderDeleteJobsTable(storage: DurableObjectStorage) {
  storage.sql.exec(deleteJobsTableSql);
  runSqlStorageMigrations(storage, {
    family: domainProviderDeleteJobsSqlMigrationFamily,
    migrations: domainProviderSqlMigrations,
  });
}

function ensureDomainProviderRedirectIntentCleanupEventsTable(storage: DurableObjectStorage) {
  storage.sql.exec(redirectIntentCleanupEventsTableSql);
}

function ensureDomainProviderAppliedResourcesTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    ${appliedResourcesTableSql};
    ${providerAuditEventsTableSql};
  `);
  runSqlStorageMigrations(storage, {
    family: domainProviderAppliedResourcesSqlMigrationFamily,
    migrations: domainProviderSqlMigrations,
  });
}

function migrateDomainProviderAppliedActionChecks(storage: DurableObjectStorage) {
  for (const table of [
    "instance_domain_provider_applied_resources",
    "instance_domain_provider_audit_events",
  ] as const) {
    const sql = providerTableDefinition(storage, table);

    if (sql !== undefined && !sql.includes("'manually-removed'")) {
      migrateDomainProviderAppliedActionCheckTable(storage, table);
    }
  }
}

function migrateDomainProviderApplyJobDeploymentColumns(storage: DurableObjectStorage) {
  migrateDomainProviderJobDeploymentColumns(storage, "instance_domain_provider_apply_jobs");
}

function migrateDomainProviderDeleteJobDeploymentColumns(storage: DurableObjectStorage) {
  migrateDomainProviderJobDeploymentColumns(storage, "instance_domain_provider_delete_jobs");
}

function migrateDomainProviderJobDeploymentColumns(
  storage: DurableObjectStorage,
  table: "instance_domain_provider_apply_jobs" | "instance_domain_provider_delete_jobs",
) {
  const columns = [
    ["deployment_attempt_id", "TEXT"],
    ["deployment_target_id", "TEXT"],
    ["deployment_desired_state_version_id", "TEXT"],
    ["deployment_desired_state_revision", "INTEGER"],
    ["deployment_desired_state_hash", "TEXT"],
    ["deployment_lease_token", "TEXT"],
  ] as const;

  for (const [column, type] of columns) {
    if (!providerTableHasColumn(storage, table, column)) {
      storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

function migrateDomainProviderAppliedActionCheckTable(
  storage: DurableObjectStorage,
  table: "instance_domain_provider_applied_resources" | "instance_domain_provider_audit_events",
) {
  const legacyTable = `${table}_action_legacy`;
  const createSql =
    table === "instance_domain_provider_applied_resources"
      ? appliedResourcesTableSql
      : providerAuditEventsTableSql;
  const eventIdColumns =
    table === "instance_domain_provider_audit_events" ? "event_id,\n      " : "";
  const eventIdSelect =
    table === "instance_domain_provider_audit_events" ? "event_id,\n      " : "";

  storage.sql.exec(`DROP TABLE IF EXISTS ${legacyTable}`);
  storage.sql.exec(`ALTER TABLE ${table} RENAME TO ${legacyTable}`);
  storage.sql.exec(createSql);
  storage.sql.exec(`
    INSERT INTO ${table} (
      ${eventIdColumns}logical_id,
      kind,
      host,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      resource_id,
      resource_json,
      action,
      applied_at,
      updated_at
    )
    SELECT
      ${eventIdSelect}logical_id,
      kind,
      host,
      account_id,
      alchemy_resource_id,
      runner_id,
      zone_id,
      zone_name,
      resource_id,
      resource_json,
      action,
      applied_at,
      updated_at
    FROM ${legacyTable}
  `);
  storage.sql.exec(`DROP TABLE ${legacyTable}`);
}

function providerTableDefinition(storage: DurableObjectStorage, table: string): string | undefined {
  return (
    storage.sql
      .exec<{ sql: string | null }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        table,
      )
      .toArray()[0]?.sql ?? undefined
  );
}

function providerTableHasColumn(
  storage: DurableObjectStorage,
  table: string,
  columnName: string,
): boolean {
  return storage.sql
    .exec<{ name: string }>(`PRAGMA table_info(${table})`)
    .toArray()
    .some((row) => row.name === columnName);
}

function applyBlockedResponse(
  code: InstanceDomainProviderApplyBlockedCode,
  error: string,
  response: InstanceDomainProviderPlanResponse,
  status: number,
): Response {
  return jsonResponse(
    {
      code,
      config: response.config,
      error,
      plan: response.plan,
      status: "blocked",
    } satisfies InstanceDomainProviderApplyResponse,
    status,
  );
}

function deleteBlockedResponse(
  code: InstanceDomainProviderDeleteBlockedCode,
  error: string,
  config: DomainProviderConfigStatus,
  deletePlan: { plan: DomainProviderPlan; targets: InstanceDomainProviderDeleteTarget[] },
  status: number,
): Response {
  return jsonResponse(
    {
      code,
      config,
      error,
      plan: deletePlan.plan,
      status: "blocked",
      targets: deletePlan.targets,
    } satisfies InstanceDomainProviderDeleteResponse,
    status,
  );
}

async function readApplyRequest(
  request: Request,
): Promise<
  | { ok: true; options: DomainProviderPlanOptions; request: InstanceDomainProviderApplyRequest }
  | { ok: false; error: string }
> {
  const parsed = await readOptionalJsonObject(request, "Domain provider apply request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;
  const policy = parsePolicy(value.policy, "Domain provider apply policy");
  const host = parseOptionalHost(value.host, "Domain provider apply host");
  const runnerId = parseOptionalString(value.runnerId, "Domain provider apply runner id");

  if (!policy.ok) {
    return policy;
  }

  if (!host.ok) {
    return host;
  }

  if (!runnerId.ok) {
    return runnerId;
  }

  if (policy.value === "override" && host.value === undefined) {
    return {
      ok: false,
      error: "Domain provider apply policy override requires one explicit host.",
    };
  }

  return {
    ok: true,
    options: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(policy.value === undefined ? {} : { policy: policy.value }),
    },
    request: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(policy.value === undefined ? {} : { policy: policy.value }),
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
    },
  };
}

async function readDeleteRequest(
  request: Request,
): Promise<
  | { ok: true; options: DomainProviderDeleteOptions; request: InstanceDomainProviderDeleteRequest }
  | { ok: false; error: string }
> {
  const parsed = await readOptionalJsonObject(request, "Domain provider delete request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;
  const host = parseOptionalHost(value.host, "Domain provider delete host");
  const kind = parseOptionalResourceKind(value.kind, "Domain provider delete resource kind");
  const logicalId = parseOptionalString(value.logicalId, "Domain provider delete logical id");
  const runnerId = parseOptionalString(value.runnerId, "Domain provider delete runner id");

  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;
  if (!runnerId.ok) return runnerId;

  if (host.value === undefined && logicalId.value === undefined) {
    return {
      ok: false,
      error: "Domain provider delete requires a host or logical id selector.",
    };
  }

  return {
    ok: true,
    options: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
      ...(logicalId.value === undefined ? {} : { logicalId: logicalId.value }),
    },
    request: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(kind.value === undefined ? {} : { kind: kind.value }),
      ...(logicalId.value === undefined ? {} : { logicalId: logicalId.value }),
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
    },
  };
}

async function readManualCleanupRequest(request: Request): Promise<
  | {
      ok: true;
      options: Required<DomainProviderDeleteOptions>;
      request: InstanceDomainProviderManualCleanupRequest;
    }
  | { ok: false; error: string }
> {
  const parsed = await readRequiredJsonObject(request, "Domain provider manual cleanup request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;
  const host = parseRequiredHost(value.host, "Domain provider manual cleanup host");
  const kind = parseRequiredResourceKind(
    value.kind,
    "Domain provider manual cleanup resource kind",
  );
  const logicalId = parseRequiredString(
    value.logicalId,
    "Domain provider manual cleanup logical id",
  );

  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;

  return {
    ok: true,
    options: {
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
    },
    request: {
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
    },
  };
}

async function readApplyJobResultRequest(
  request: Request,
): Promise<
  { ok: true; request: InstanceDomainProviderApplyJobResultRequest } | { ok: false; error: string }
> {
  const parsed = await readRequiredJsonObject(request, "Domain provider apply job result request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;

  if (value.status === "failed") {
    const error = parseOptionalString(value.error, "Domain provider apply job error");

    if (!error.ok || error.value === undefined) {
      return { ok: false, error: "Domain provider apply job error must be a non-empty string." };
    }

    const runnerId = parseOptionalString(value.runnerId, "Domain provider apply job runner id");

    if (!runnerId.ok) {
      return runnerId;
    }

    return {
      ok: true,
      request: {
        error: error.value,
        ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
        status: "failed",
      },
    };
  }

  if (value.status !== "succeeded") {
    return {
      ok: false,
      error: 'Domain provider apply job result status must be "succeeded" or "failed".',
    };
  }

  if (!Array.isArray(value.resources)) {
    return { ok: false, error: "Domain provider apply job result resources must be an array." };
  }

  const resources: InstanceDomainProviderApplyJobResourceEvidence[] = [];

  for (const resource of value.resources) {
    const parsedResource = parseApplyJobResourceEvidence(resource);

    if (!parsedResource.ok) {
      return parsedResource;
    }

    resources.push(parsedResource.resource);
  }

  const runnerId = parseOptionalString(value.runnerId, "Domain provider apply job runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  return {
    ok: true,
    request: {
      resources,
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
      status: "succeeded",
    },
  };
}

async function readDeleteJobResultRequest(
  request: Request,
): Promise<
  { ok: true; request: InstanceDomainProviderDeleteJobResultRequest } | { ok: false; error: string }
> {
  const parsed = await readRequiredJsonObject(request, "Domain provider delete job result request");

  if (!parsed.ok) {
    return parsed;
  }

  const value = parsed.value;

  if (value.status === "failed") {
    const error = parseOptionalString(value.error, "Domain provider delete job error");

    if (!error.ok || error.value === undefined) {
      return { ok: false, error: "Domain provider delete job error must be a non-empty string." };
    }

    const runnerId = parseOptionalString(value.runnerId, "Domain provider delete job runner id");

    if (!runnerId.ok) {
      return runnerId;
    }

    return {
      ok: true,
      request: {
        error: error.value,
        ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
        status: "failed",
      },
    };
  }

  if (value.status !== "succeeded") {
    return {
      ok: false,
      error: 'Domain provider delete job result status must be "succeeded" or "failed".',
    };
  }

  if (!Array.isArray(value.resources)) {
    return { ok: false, error: "Domain provider delete job result resources must be an array." };
  }

  const resources: InstanceDomainProviderDeleteJobResourceEvidence[] = [];

  for (const resource of value.resources) {
    const parsedResource = parseDeleteJobResourceEvidence(resource);

    if (!parsedResource.ok) {
      return parsedResource;
    }

    resources.push(parsedResource.resource);
  }

  const runnerId = parseOptionalString(value.runnerId, "Domain provider delete job runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  return {
    ok: true,
    request: {
      resources,
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
      status: "succeeded",
    },
  };
}

async function readRedirectIntentRequest(
  request: Request,
): Promise<
  | { ok: true; request: CreateInstanceDomainProviderRedirectIntentRequest }
  | { ok: false; error: string }
> {
  const parsed = await readRequiredJsonObject(request, "Domain provider redirect intent request");

  if (!parsed.ok) {
    return parsed;
  }

  return parseRedirectIntentRequest(parsed.value);
}

function parseRedirectIntentRequest(
  value: Record<string, unknown>,
):
  | { ok: true; request: CreateInstanceDomainProviderRedirectIntentRequest }
  | { ok: false; error: string } {
  const fromHost = parseRequiredHost(value.fromHost, "Domain provider redirect from host");
  const enabled = parseOptionalBoolean(value.enabled, "Domain provider redirect enabled");
  const preservePath = parseOptionalBoolean(
    value.preservePath,
    "Domain provider redirect preserve path",
  );
  const preserveQueryString = parseOptionalBoolean(
    value.preserveQueryString,
    "Domain provider redirect preserve query string",
  );
  const statusCode = parseOptionalRedirectStatusCode(
    value.statusCode,
    "Domain provider redirect status code",
  );
  const toHost = parseOptionalHost(value.toHost, "Domain provider redirect target host");
  const toUrl = parseOptionalHttpsUrl(value.toUrl, "Domain provider redirect target URL");

  if (!fromHost.ok) return fromHost;
  if (!enabled.ok) return enabled;
  if (!preservePath.ok) return preservePath;
  if (!preserveQueryString.ok) return preserveQueryString;
  if (!statusCode.ok) return statusCode;
  if (!toHost.ok) return toHost;
  if (!toUrl.ok) return toUrl;

  if ((toHost.value === undefined && toUrl.value === undefined) || (toHost.value && toUrl.value)) {
    return { ok: false, error: "Domain provider redirect must set target host or target URL." };
  }

  return {
    ok: true,
    request: {
      ...(enabled.value === undefined ? {} : { enabled: enabled.value }),
      fromHost: fromHost.value,
      ...(preservePath.value === undefined ? {} : { preservePath: preservePath.value }),
      ...(preserveQueryString.value === undefined
        ? {}
        : { preserveQueryString: preserveQueryString.value }),
      ...(statusCode.value === undefined ? {} : { statusCode: statusCode.value }),
      ...(toHost.value === undefined ? {} : { toHost: toHost.value }),
      ...(toUrl.value === undefined ? {} : { toUrl: toUrl.value }),
    },
  };
}

function parseDeleteRedirectIntentRequest(
  value: unknown,
):
  | { ok: true; request: DeleteInstanceDomainProviderRedirectIntentRequest }
  | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "Domain provider redirect delete request must be an object." };
  }

  const fromHost = parseRequiredHost(value.fromHost, "Domain provider redirect from host");

  if (!fromHost.ok) {
    return fromHost;
  }

  return { ok: true, request: { fromHost: fromHost.value } };
}

function parseApplyJobResourceEvidence(
  value: unknown,
):
  | { ok: true; resource: InstanceDomainProviderApplyJobResourceEvidence }
  | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "Domain provider apply evidence resource must be an object." };
  }

  const accountId = parseRequiredString(value.accountId, "Domain provider apply account id");
  const action = parseRequiredString(value.action, "Domain provider apply action");
  const alchemyResourceId = parseRequiredString(
    value.alchemyResourceId,
    "Domain provider apply Alchemy resource id",
  );
  const host = parseRequiredHost(value.host, "Domain provider apply host");
  const kind = parseRequiredString(value.kind, "Domain provider apply resource kind");
  const logicalId = parseRequiredString(value.logicalId, "Domain provider apply logical id");
  const zoneId = parseRequiredString(value.zoneId, "Domain provider apply zone id");
  const zoneName = parseRequiredString(value.zoneName, "Domain provider apply zone name");

  if (!accountId.ok) return accountId;
  if (!action.ok) return action;
  if (!alchemyResourceId.ok) return alchemyResourceId;
  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;
  if (!zoneId.ok) return zoneId;
  if (!zoneName.ok) return zoneName;

  if (action.value !== "adopted" && action.value !== "created" && action.value !== "overridden") {
    return {
      ok: false,
      error: 'Domain provider apply action must be "adopted", "created", or "overridden".',
    };
  }

  const actionValue = action.value as InstanceDomainProviderApplyJobResourceEvidence["action"];
  const common = {
    accountId: accountId.value,
    action: actionValue,
    alchemyResourceId: alchemyResourceId.value,
    host: host.value,
    logicalId: logicalId.value,
    zoneId: zoneId.value,
    zoneName: zoneName.value,
  };

  if (kind.value === "cloudflare-worker-custom-domain") {
    const profile = parseRequiredString(value.profile, "Domain provider apply profile");
    const targetInstallId = parseOptionalString(
      value.targetInstallId,
      "Domain provider apply target install id",
    );
    const workerDomainId = parseRequiredString(
      value.workerDomainId,
      "Domain provider apply Worker Custom Domain id",
    );
    const workerName = parseRequiredString(value.workerName, "Domain provider apply Worker name");

    if (!profile.ok) return profile;
    if (!targetInstallId.ok) return targetInstallId;
    if (!workerDomainId.ok) return workerDomainId;
    if (!workerName.ok) return workerName;

    if (profile.value !== "instance" && profile.value !== "app" && profile.value !== "publicSite") {
      return {
        ok: false,
        error: 'Domain provider apply profile must be "instance", "app", or "publicSite".',
      };
    }

    return {
      ok: true,
      resource: {
        ...common,
        kind: kind.value,
        profile: profile.value,
        ...(targetInstallId.value === undefined ? {} : { targetInstallId: targetInstallId.value }),
        workerDomainId: workerDomainId.value,
        workerName: workerName.value,
      },
    };
  }

  if (kind.value === "cloudflare-redirect-rule") {
    const preserveQueryString = parseRequiredBoolean(
      value.preserveQueryString,
      "Domain provider apply redirect preserve query string",
    );
    const redirectRuleId = parseRequiredString(
      value.redirectRuleId,
      "Domain provider apply redirect rule id",
    );
    const redirectRulesetId = parseRequiredString(
      value.redirectRulesetId,
      "Domain provider apply redirect ruleset id",
    );
    const statusCode = parseRedirectStatusCode(
      value.statusCode,
      "Domain provider apply redirect status code",
    );
    const targetUrl = parseRequiredString(
      value.targetUrl,
      "Domain provider apply redirect target URL",
    );

    if (!preserveQueryString.ok) return preserveQueryString;
    if (!redirectRuleId.ok) return redirectRuleId;
    if (!redirectRulesetId.ok) return redirectRulesetId;
    if (!statusCode.ok) return statusCode;
    if (!targetUrl.ok) return targetUrl;

    return {
      ok: true,
      resource: {
        ...common,
        kind: kind.value,
        preserveQueryString: preserveQueryString.value,
        redirectRuleId: redirectRuleId.value,
        redirectRulesetId: redirectRulesetId.value,
        statusCode: statusCode.value,
        targetUrl: targetUrl.value,
      },
    };
  }

  if (kind.value === "cloudflare-dns-records") {
    const dnsRecordIds = parseRequiredStringArray(
      value.dnsRecordIds,
      "Domain provider apply DNS record ids",
    );

    if (!dnsRecordIds.ok) return dnsRecordIds;

    return {
      ok: true,
      resource: {
        ...common,
        dnsRecordIds: dnsRecordIds.value,
        kind: kind.value,
      },
    };
  }

  return {
    ok: false,
    error:
      'Domain provider apply resource kind must be "cloudflare-worker-custom-domain", "cloudflare-redirect-rule", or "cloudflare-dns-records".',
  };
}

function parseDeleteJobResourceEvidence(
  value: unknown,
):
  | { ok: true; resource: InstanceDomainProviderDeleteJobResourceEvidence }
  | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "Domain provider delete evidence resource must be an object." };
  }

  const action = parseRequiredString(value.action, "Domain provider delete action");
  const host = parseRequiredHost(value.host, "Domain provider delete host");
  const kind = parseRequiredResourceKind(value.kind, "Domain provider delete resource kind");
  const logicalId = parseRequiredString(value.logicalId, "Domain provider delete logical id");

  if (!action.ok) return action;
  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;

  if (action.value !== "deleted") {
    return { ok: false, error: 'Domain provider delete action must be "deleted".' };
  }

  return {
    ok: true,
    resource: {
      action: "deleted",
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
    },
  };
}

async function readOptionalJsonObject(
  request: Request,
  context: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  const text = await request.text();

  if (text.trim() === "") {
    return { ok: true, value: {} };
  }

  return parseJsonObject(text, context);
}

async function readRequiredJsonObject(
  request: Request,
  context: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  return parseJsonObject(await request.text(), context);
}

function parseJsonObject(
  text: string,
  context: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;

    if (!isRecord(value)) {
      return { ok: false, error: `${context} must be a JSON object.` };
    }

    return { ok: true, value };
  } catch {
    return { ok: false, error: `${context} must be valid JSON.` };
  }
}

function parsePlanOptions(
  searchParams: URLSearchParams,
): { ok: true; options: DomainProviderPlanOptions } | { ok: false; error: string } {
  const host = parseOptionalHost(
    searchParams.get("host") ?? undefined,
    "Domain provider plan host",
  );
  const policy = parsePolicy(
    searchParams.get("policy") ?? undefined,
    "Domain provider plan policy",
  );

  if (!host.ok) {
    return host;
  }

  if (!policy.ok) {
    return policy;
  }

  return {
    ok: true,
    options: {
      ...(host.value === undefined ? {} : { host: host.value }),
      ...(policy.value === undefined ? {} : { policy: policy.value }),
    },
  };
}

function parsePolicy(
  value: unknown,
  context: string,
): { ok: true; value?: DomainProviderApplyPolicy } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (value === "adopt" || value === "create-only" || value === "override") {
    return { ok: true, value };
  }

  return { ok: false, error: `${context} must be "create-only", "adopt", or "override".` };
}

function parseOptionalResourceKind(
  value: unknown,
  context: string,
): { ok: true; value?: DomainProviderResourceKind } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  return parseRequiredResourceKind(value, context);
}

function parseRequiredResourceKind(
  value: unknown,
  context: string,
): { ok: true; value: DomainProviderResourceKind } | { ok: false; error: string } {
  if (
    value === "cloudflare-worker-custom-domain" ||
    value === "cloudflare-redirect-rule" ||
    value === "cloudflare-dns-records"
  ) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: `${context} must be "cloudflare-worker-custom-domain", "cloudflare-redirect-rule", or "cloudflare-dns-records".`,
  };
}

function parseOptionalHost(
  value: unknown,
  context: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string") {
    return { ok: false, error: `${context} must be a string.` };
  }

  const normalized = normalizeInstanceDomainHost(value);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error.message };
  }

  return { ok: true, value: normalized.host };
}

function parseRequiredHost(
  value: unknown,
  context: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const host = parseOptionalHost(value, context);

  if (!host.ok) {
    return host;
  }

  if (host.value === undefined) {
    return { ok: false, error: `${context} must be a non-empty string.` };
  }

  return { ok: true, value: host.value };
}

function parseOptionalBoolean(
  value: unknown,
  context: string,
): { ok: true; value?: boolean } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "boolean") {
    return { ok: false, error: `${context} must be a boolean.` };
  }

  return { ok: true, value };
}

function parseRequiredBoolean(
  value: unknown,
  context: string,
): { ok: true; value: boolean } | { ok: false; error: string } {
  const parsed = parseOptionalBoolean(value, context);

  if (!parsed.ok) {
    return parsed;
  }

  if (parsed.value === undefined) {
    return { ok: false, error: `${context} must be a boolean.` };
  }

  return { ok: true, value: parsed.value };
}

function parseOptionalString(
  value: unknown,
  context: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  return parseRequiredString(value, context);
}

function parseRequiredString(
  value: unknown,
  context: string,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: `${context} must be a non-empty string.` };
  }

  return { ok: true, value: value.trim() };
}

function parseRequiredStringArray(
  value: unknown,
  context: string,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return { ok: false, error: `${context} must be an array.` };
  }

  const values: string[] = [];

  for (const item of value) {
    const parsed = parseRequiredString(item, context);

    if (!parsed.ok) {
      return parsed;
    }

    values.push(parsed.value);
  }

  if (values.length === 0) {
    return { ok: false, error: `${context} must include at least one id.` };
  }

  return { ok: true, value: values };
}

function parseOptionalHttpsUrl(
  value: unknown,
  context: string,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  const parsed = parseRequiredString(value, context);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const url = new URL(parsed.value);

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== ""
    ) {
      return {
        ok: false,
        error: `${context} must be an absolute HTTPS URL without credentials or fragment.`,
      };
    }

    return { ok: true, value: url.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false, error: `${context} must be valid.` };
  }
}

function parseOptionalRedirectStatusCode(
  value: unknown,
  context: string,
): { ok: true; value?: DomainProviderRedirectStatusCode } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true };
  }

  return parseRedirectStatusCode(value, context);
}

function parseRedirectStatusCode(
  value: unknown,
  context: string,
): { ok: true; value: DomainProviderRedirectStatusCode } | { ok: false; error: string } {
  if (value === 301 || value === 302 || value === 303 || value === 307 || value === 308) {
    return { ok: true, value };
  }

  return { ok: false, error: `${context} must be 301, 302, 303, 307, or 308.` };
}

function isRedirectStatusCode(value: unknown): value is DomainProviderRedirectStatusCode {
  return value === 301 || value === 302 || value === 303 || value === 307 || value === 308;
}

function readStoredResourceJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function targetUrlHost(value: string): string | undefined {
  try {
    return new URL(value.replace("/${1}", "/")).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function logicalResourceId(
  instanceId: string,
  kind: string,
  host: string,
  ...parts: readonly (string | undefined)[]
): string {
  return [instanceId, kind, host, ...parts]
    .filter((part): part is string => part !== undefined && part !== "")
    .map((part) => normalizeLogicalIdPart(part, "value"))
    .join("-");
}

function normalizeLogicalIdPart(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized === "" ? fallback : normalized;
}

function configIssue(
  code: DomainProviderConfigIssue["code"],
  envNames: string[],
): DomainProviderConfigIssue {
  return {
    code,
    envNames,
    message: configIssueMessage(code, envNames),
  };
}

function configIssueMessage(code: DomainProviderConfigIssue["code"], envNames: string[]): string {
  switch (code) {
    case "invalid-zone-config":
      return "Domain provider zone config is invalid.";
    case "missing-account-id":
      return `Domain provider planning requires Cloudflare account id in ${envNames.join(" or ")}.`;
    case "missing-alchemy-password":
      return `Domain provider apply requires Alchemy state password secret ${envNames.join(" or ")}.`;
    case "missing-cloudflare-api-token":
      return `Domain provider apply requires Cloudflare API token secret ${envNames.join(" or ")}.`;
    case "missing-instance-id":
      return `Domain provider planning requires instance id in ${envNames.join(" or ")}.`;
    case "missing-worker-name":
      return `Domain provider planning requires Worker name in ${envNames.join(" or ")}.`;
    case "missing-zone-config":
      return `Domain provider planning requires Cloudflare zone config in ${envNames.join(" or ")}.`;
  }
}

function parseApplyJobPath(pathname: string): { jobId: string; result: boolean } | undefined {
  const prefix = `${INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH}/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const rest = pathname.slice(prefix.length);
  const resultSuffix = "/result";
  const encodedJobId = rest.endsWith(resultSuffix) ? rest.slice(0, -resultSuffix.length) : rest;

  if (encodedJobId === "" || encodedJobId.includes("/")) {
    return undefined;
  }

  return {
    jobId: decodeURIComponent(encodedJobId),
    result: rest.endsWith(resultSuffix),
  };
}

function parseDeleteJobPath(pathname: string): { jobId: string; result: boolean } | undefined {
  const prefix = `${INSTANCE_DOMAIN_PROVIDER_DELETE_JOBS_API_PATH}/`;

  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const rest = pathname.slice(prefix.length);
  const resultSuffix = "/result";
  const encodedJobId = rest.endsWith(resultSuffix) ? rest.slice(0, -resultSuffix.length) : rest;

  if (encodedJobId === "" || encodedJobId.includes("/")) {
    return undefined;
  }

  return {
    jobId: decodeURIComponent(encodedJobId),
    result: rest.endsWith(resultSuffix),
  };
}

function isInstanceDomainProviderApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DOMAIN_PROVIDER_API_PATH ||
    pathname.startsWith(`${INSTANCE_DOMAIN_PROVIDER_API_PATH}/`)
  );
}

function methodNotAllowedResponse(allow: string): Response {
  return jsonResponse({ error: "Method not allowed." }, 405, { Allow: allow });
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);

  if (!responseHeaders.has("Cache-Control")) {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}

function optionalEnv(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed === "" ? undefined : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
