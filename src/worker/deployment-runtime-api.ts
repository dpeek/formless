import {
  INSTANCE_DEPLOYMENT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH,
  INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH,
  INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH,
  INSTANCE_DEPLOYMENT_DRIFT_API_PATH,
  INSTANCE_DEPLOYMENT_STATUS_API_PATH,
  deploymentDriftStatuses,
  deploymentEvidenceActions,
  validateDeploymentActorId,
  validateDeploymentAttemptId,
  validateDeploymentAttemptMode,
  validateDeploymentDesiredStateVersionRef,
  validateDeploymentIdempotencyKey,
  validateDeploymentLeaseToken,
  validateDeploymentTargetId,
  type DeploymentActor,
  type DeploymentActorKind,
  type DeploymentAlchemyStatePointer,
  type DeploymentDriftStatus,
  type DeploymentEvidenceAction,
  type DeploymentFailureSummary,
  type DeploymentPlanIssue,
  type DeploymentPlanSummary,
  type DeploymentProviderFamily,
  type DeploymentResourceEvidenceSummary,
  type DeploymentResourceKind,
  type DeploymentRuntimeValidationError,
  type DeploymentTarget,
  type InstanceDeploymentAttemptFailureWritebackRequest,
  type InstanceDeploymentAttemptFailureWritebackResponse,
  type InstanceDeploymentAttemptHeartbeatRequest,
  type InstanceDeploymentAttemptHeartbeatResponse,
  type InstanceDeploymentAttemptPlanWritebackRequest,
  type InstanceDeploymentAttemptPlanWritebackResponse,
  type InstanceDeploymentAttemptStartRequest,
  type InstanceDeploymentAttemptStartResponse,
  type InstanceDeploymentAttemptSuccessWritebackRequest,
  type InstanceDeploymentAttemptSuccessWritebackResponse,
  type InstanceDeploymentDesiredStateResponse,
  type InstanceDeploymentDriftWritebackRequest,
  type InstanceDeploymentDriftWritebackResponse,
  type InstanceDeploymentStatusResponse,
} from "../shared/deployment-runtime.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import type { DeploymentControlPlaneClientEnv } from "./deployment-control-plane-client.ts";
import {
  heartbeatDeploymentAttemptLease,
  INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  materializeDeploymentDesiredStateVersion,
  readLatestDeploymentStatus,
  startDeploymentAttempt,
  writeDeploymentAttemptFailure,
  writeDeploymentAttemptPlan,
  writeDeploymentAttemptSuccess,
  writeDeploymentDriftReport,
} from "./deployment-runtime-state.ts";
import { buildPrimaryInstanceDeploymentDesiredStateProjection } from "./deployment-runtime-projection.ts";

type InstanceDeploymentRuntimeApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type DurableObjectDeploymentRuntimeEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY?: DeploymentControlPlaneClientEnv["FORMLESS_AUTHORITY"];
  FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID?: string;
  FORMLESS_DOMAIN_PROVIDER_WORKER_NAME?: string;
};

const deploymentActorKinds = new Set<DeploymentActorKind>(["ci", "cli", "runner", "system"]);
const deploymentDriftStatusSet = new Set<DeploymentDriftStatus>(deploymentDriftStatuses);
const deploymentEvidenceActionSet = new Set<DeploymentEvidenceAction>(deploymentEvidenceActions);
const deploymentProviderFamilySet = new Set<DeploymentProviderFamily>(["cloudflare"]);
const deploymentResourceKindSet = new Set<DeploymentResourceKind>([
  "cloudflare-dns-records",
  "cloudflare-redirect-rule",
  "cloudflare-worker-custom-domain",
]);

const primaryInstanceDeploymentTarget: DeploymentTarget = {
  kind: "instance",
  label: "Primary instance target",
  targetId: INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
};

export async function handleInstanceDeploymentRuntimeApiRequest(
  request: Request,
  env: InstanceDeploymentRuntimeApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceDeploymentRuntimeApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceDeploymentRuntimeDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceDeploymentRuntimeApiPath(url.pathname)) {
    return undefined;
  }

  try {
    if (url.pathname === INSTANCE_DEPLOYMENT_DESIRED_STATE_API_PATH) {
      return handleDesiredStateRequest(request, storage, url, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_ATTEMPT_START_API_PATH) {
      return handleAttemptStartRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_ATTEMPT_HEARTBEAT_API_PATH) {
      return handleAttemptHeartbeatRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_ATTEMPT_PLAN_API_PATH) {
      return handleAttemptPlanWritebackRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_ATTEMPT_SUCCESS_API_PATH) {
      return handleAttemptSuccessWritebackRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_ATTEMPT_FAILURE_API_PATH) {
      return handleAttemptFailureWritebackRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_DRIFT_API_PATH) {
      return handleDriftWritebackRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DEPLOYMENT_STATUS_API_PATH) {
      return handleStatusRequest(request, storage, url);
    }

    return jsonResponse({ error: "Not found." }, 404);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleDesiredStateRequest(
  request: Request,
  storage: DurableObjectStorage,
  url: URL,
  env: DurableObjectDeploymentRuntimeEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const target = deploymentTargetFromSearchParams(url.searchParams);

  if (!target.ok) {
    return jsonResponse(deploymentValidationErrorBody(target.error), 400);
  }

  if (target.target.targetId !== INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID) {
    return jsonResponse(
      { error: `Deployment target "${target.target.targetId}" was not found.` },
      404,
    );
  }

  const now = nowIsoString();
  const projection = await buildPrimaryInstanceDeploymentDesiredStateProjection(storage, {
    env,
    now,
    requestUrl: request.url,
    target: target.target,
    targetId: target.target.targetId,
  });
  const desiredState = await materializeDeploymentDesiredStateVersion(storage, {
    now,
    resourceGraph: projection.resourceGraph,
    source: projection.source,
    targetId: target.target.targetId,
    title: target.target.label,
  });
  const response: InstanceDeploymentDesiredStateResponse = {
    desiredState,
    target: target.target,
  };

  return jsonResponse(response);
}

async function handleStatusRequest(
  request: Request,
  storage: DurableObjectStorage,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const target = deploymentTargetFromSearchParams(url.searchParams);

  if (!target.ok) {
    return jsonResponse(deploymentValidationErrorBody(target.error), 400);
  }

  const targetError = deploymentTargetNotFoundBody(target.target.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  return jsonResponse({
    status: readLatestDeploymentStatus(storage, {
      now: nowIsoString(),
      targetId: target.target.targetId,
    }),
    target: target.target,
  } satisfies InstanceDeploymentStatusResponse);
}

async function handleAttemptStartRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
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

  const parsed = await readAttemptStartRequest(request);

  if (!parsed.ok) {
    return jsonResponse(parsed.body, 400);
  }

  if (parsed.request.desiredState.targetId !== INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID) {
    return jsonResponse(
      { error: `Deployment target "${parsed.request.desiredState.targetId}" was not found.` },
      404,
    );
  }

  const now = nowIsoString();
  const result = startDeploymentAttempt(storage, {
    actor: parsed.request.actor,
    desiredState: parsed.request.desiredState,
    idempotencyKey: parsed.request.idempotencyKey,
    mode: parsed.request.mode,
    now,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse(
    {
      attempt: result.attempt,
      ...(result.lease === undefined ? {} : { lease: result.lease }),
      replayed: result.replayed,
    } satisfies InstanceDeploymentAttemptStartResponse,
    result.replayed ? 200 : 201,
  );
}

async function handleAttemptHeartbeatRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
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

  const parsed = await readAttemptHeartbeatRequest(request);

  if (!parsed.ok) {
    return jsonResponse(parsed.body, 400);
  }

  if (parsed.request.desiredState.targetId !== INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID) {
    return jsonResponse(
      { error: `Deployment target "${parsed.request.desiredState.targetId}" was not found.` },
      404,
    );
  }

  const now = nowIsoString();
  const result = heartbeatDeploymentAttemptLease(storage, {
    attemptId: parsed.request.attemptId,
    desiredState: parsed.request.desiredState,
    leaseToken: parsed.request.leaseToken,
    now,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    attempt: result.attempt,
    lease: result.lease,
  } satisfies InstanceDeploymentAttemptHeartbeatResponse);
}

async function handleAttemptPlanWritebackRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
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

  const parsed = await readAttemptPlanWritebackRequest(request);

  if (!parsed.ok) {
    return jsonResponse(parsed.body, 400);
  }

  const targetError = deploymentTargetNotFoundBody(parsed.request.desiredState.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  const now = nowIsoString();
  const result = writeDeploymentAttemptPlan(storage, {
    attemptId: parsed.request.attemptId,
    desiredState: parsed.request.desiredState,
    now,
    runnerId: parsed.request.runnerId,
    summary: parsed.request.summary,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    attempt: result.attempt,
    plan: result.plan,
  } satisfies InstanceDeploymentAttemptPlanWritebackResponse);
}

async function handleAttemptSuccessWritebackRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
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

  const parsed = await readAttemptSuccessWritebackRequest(request);

  if (!parsed.ok) {
    return jsonResponse(parsed.body, 400);
  }

  const targetError = deploymentTargetNotFoundBody(parsed.request.desiredState.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  const now = nowIsoString();
  const result = writeDeploymentAttemptSuccess(storage, {
    alchemy: parsed.request.alchemy,
    attemptId: parsed.request.attemptId,
    desiredState: parsed.request.desiredState,
    evidence: parsed.request.evidence,
    leaseToken: parsed.request.leaseToken,
    now,
    runnerId: parsed.request.runnerId,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    attempt: result.attempt,
    lease: result.lease,
    result: result.result,
  } satisfies InstanceDeploymentAttemptSuccessWritebackResponse);
}

async function handleAttemptFailureWritebackRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
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

  const parsed = await readAttemptFailureWritebackRequest(request);

  if (!parsed.ok) {
    return jsonResponse(parsed.body, 400);
  }

  const targetError = deploymentTargetNotFoundBody(parsed.request.desiredState.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  const now = nowIsoString();
  const result = writeDeploymentAttemptFailure(storage, {
    actor: parsed.request.actor,
    attemptId: parsed.request.attemptId,
    desiredState: parsed.request.desiredState,
    leaseToken: parsed.request.leaseToken,
    now,
    runnerId: parsed.request.runnerId,
    summary: parsed.request.summary,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    attempt: result.attempt,
    ...(result.lease === undefined ? {} : { lease: result.lease }),
    result: result.result,
  } satisfies InstanceDeploymentAttemptFailureWritebackResponse);
}

async function handleDriftWritebackRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: DurableObjectDeploymentRuntimeEnv,
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

  const parsed = await readDriftWritebackRequest(request);

  if (!parsed.ok) {
    return jsonResponse(parsed.body, 400);
  }

  const targetError = deploymentTargetNotFoundBody(parsed.request.desiredState.targetId);

  if (targetError) {
    return jsonResponse(targetError, 404);
  }

  const now = nowIsoString();
  const result = writeDeploymentDriftReport(storage, {
    actor: parsed.request.actor,
    desiredState: parsed.request.desiredState,
    now,
    status: parsed.request.status,
    summary: parsed.request.summary,
  });

  if (!result.ok) {
    return jsonResponse({ code: result.code, error: result.error }, result.status);
  }

  return jsonResponse({
    report: result.report,
  } satisfies InstanceDeploymentDriftWritebackResponse);
}

function deploymentTargetFromSearchParams(searchParams: URLSearchParams):
  | {
      ok: true;
      target: DeploymentTarget;
    }
  | {
      ok: false;
      error: DeploymentRuntimeValidationError;
    } {
  const targetId = validateDeploymentTargetId(
    searchParams.get("targetId") ?? INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID,
  );

  if (!targetId.ok) {
    return targetId;
  }

  return {
    ok: true,
    target: {
      ...primaryInstanceDeploymentTarget,
      targetId: targetId.targetId,
    },
  };
}

function deploymentTargetNotFoundBody(targetId: string): { error: string } | undefined {
  return targetId === INSTANCE_DEPLOYMENT_PRIMARY_TARGET_ID
    ? undefined
    : { error: `Deployment target "${targetId}" was not found.` };
}

async function readAttemptPlanWritebackRequest(request: Request): Promise<
  | {
      ok: true;
      request: InstanceDeploymentAttemptPlanWritebackRequest;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  const parsed = await readJsonObject(request, "Deployment attempt plan writeback request");

  if (!parsed.ok) {
    return parsed;
  }

  const attemptId = parseAttemptId(parsed.value.attemptId);

  if (!attemptId.ok) {
    return attemptId;
  }

  const desiredState = validateDeploymentDesiredStateVersionRef(parsed.value.desiredState);

  if (!desiredState.ok) {
    return {
      body: deploymentValidationErrorBody(desiredState.error),
      ok: false,
    };
  }

  const runnerId = optionalTrimmedString(parsed.value.runnerId, "Deployment runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  const summary = parseDeploymentPlanSummary(parsed.value.summary);

  if (!summary.ok) {
    return summary;
  }

  return {
    ok: true,
    request: {
      attemptId: attemptId.attemptId,
      desiredState: desiredState.versionRef,
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
      summary: summary.summary,
    },
  };
}

async function readAttemptSuccessWritebackRequest(request: Request): Promise<
  | {
      ok: true;
      request: InstanceDeploymentAttemptSuccessWritebackRequest;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  const parsed = await readJsonObject(request, "Deployment attempt success writeback request");

  if (!parsed.ok) {
    return parsed;
  }

  const attemptId = parseAttemptId(parsed.value.attemptId);

  if (!attemptId.ok) {
    return attemptId;
  }

  const desiredState = validateDeploymentDesiredStateVersionRef(parsed.value.desiredState);

  if (!desiredState.ok) {
    return {
      body: deploymentValidationErrorBody(desiredState.error),
      ok: false,
    };
  }

  const leaseToken = parseLeaseToken(parsed.value.leaseToken);

  if (!leaseToken.ok) {
    return leaseToken;
  }

  const runnerId = optionalTrimmedString(parsed.value.runnerId, "Deployment runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  const alchemy = parseAlchemyStatePointer(parsed.value.alchemy);

  if (!alchemy.ok) {
    return alchemy;
  }

  const evidence = parseDeploymentEvidenceSummaries(
    parsed.value.evidence,
    desiredState.versionRef.targetId,
  );

  if (!evidence.ok) {
    return evidence;
  }

  return {
    ok: true,
    request: {
      alchemy: alchemy.pointer,
      attemptId: attemptId.attemptId,
      desiredState: desiredState.versionRef,
      evidence: evidence.evidence,
      leaseToken: leaseToken.leaseToken,
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
    },
  };
}

async function readAttemptFailureWritebackRequest(request: Request): Promise<
  | {
      ok: true;
      request: InstanceDeploymentAttemptFailureWritebackRequest;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  const parsed = await readJsonObject(request, "Deployment attempt failure writeback request");

  if (!parsed.ok) {
    return parsed;
  }

  const attemptId = parseAttemptId(parsed.value.attemptId);

  if (!attemptId.ok) {
    return attemptId;
  }

  const desiredState = validateDeploymentDesiredStateVersionRef(parsed.value.desiredState);

  if (!desiredState.ok) {
    return {
      body: deploymentValidationErrorBody(desiredState.error),
      ok: false,
    };
  }

  const leaseToken =
    parsed.value.leaseToken === undefined ? undefined : parseLeaseToken(parsed.value.leaseToken);

  if (leaseToken && !leaseToken.ok) {
    return leaseToken;
  }

  const runnerId = optionalTrimmedString(parsed.value.runnerId, "Deployment runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  const actor = parseDeploymentActor(parsed.value.actor);

  if (!actor.ok) {
    return actor;
  }

  const summary = parseDeploymentFailureSummary(parsed.value.summary);

  if (!summary.ok) {
    return summary;
  }

  return {
    ok: true,
    request: {
      actor: actor.actor,
      attemptId: attemptId.attemptId,
      desiredState: desiredState.versionRef,
      ...(leaseToken === undefined ? {} : { leaseToken: leaseToken.leaseToken }),
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
      summary: summary.summary,
    },
  };
}

async function readDriftWritebackRequest(request: Request): Promise<
  | {
      ok: true;
      request: InstanceDeploymentDriftWritebackRequest;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  const parsed = await readJsonObject(request, "Deployment drift writeback request");

  if (!parsed.ok) {
    return parsed;
  }

  const desiredState = validateDeploymentDesiredStateVersionRef(parsed.value.desiredState);

  if (!desiredState.ok) {
    return {
      body: deploymentValidationErrorBody(desiredState.error),
      ok: false,
    };
  }

  const actor = parseDeploymentActor(parsed.value.actor);

  if (!actor.ok) {
    return actor;
  }

  const status = parseDeploymentDriftStatus(parsed.value.status);

  if (!status.ok) {
    return status;
  }

  const summary = parseDeploymentDriftSummary(parsed.value.summary);

  if (!summary.ok) {
    return summary;
  }

  return {
    ok: true,
    request: {
      actor: actor.actor,
      desiredState: desiredState.versionRef,
      status: status.status,
      summary: summary.summary,
    },
  };
}

async function readAttemptHeartbeatRequest(request: Request): Promise<
  | {
      ok: true;
      request: InstanceDeploymentAttemptHeartbeatRequest;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return {
      body: { error: "Deployment attempt heartbeat request must be a JSON object." },
      ok: false,
    };
  }

  if (!isRecord(value)) {
    return {
      body: { error: "Deployment attempt heartbeat request must be a JSON object." },
      ok: false,
    };
  }

  const attemptId = parseAttemptId(value.attemptId);

  if (!attemptId.ok) {
    return attemptId;
  }

  const desiredState = validateDeploymentDesiredStateVersionRef(value.desiredState);

  if (!desiredState.ok) {
    return {
      body: deploymentValidationErrorBody(desiredState.error),
      ok: false,
    };
  }

  const leaseToken = parseLeaseToken(value.leaseToken);

  if (!leaseToken.ok) {
    return leaseToken;
  }

  return {
    ok: true,
    request: {
      attemptId: attemptId.attemptId,
      desiredState: desiredState.versionRef,
      leaseToken: leaseToken.leaseToken,
    },
  };
}

async function readAttemptStartRequest(request: Request): Promise<
  | {
      ok: true;
      request: InstanceDeploymentAttemptStartRequest;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return {
      body: { error: "Deployment attempt start request must be a JSON object." },
      ok: false,
    };
  }

  if (!isRecord(value)) {
    return {
      body: { error: "Deployment attempt start request must be a JSON object." },
      ok: false,
    };
  }

  const desiredState = validateDeploymentDesiredStateVersionRef(value.desiredState);

  if (!desiredState.ok) {
    return {
      body: deploymentValidationErrorBody(desiredState.error),
      ok: false,
    };
  }

  const mode = parseAttemptMode(value.mode);

  if (!mode.ok) {
    return mode;
  }

  const idempotencyKey = parseIdempotencyKey(value.idempotencyKey);

  if (!idempotencyKey.ok) {
    return idempotencyKey;
  }

  const actor = parseDeploymentActor(value.actor);

  if (!actor.ok) {
    return actor;
  }

  return {
    ok: true,
    request: {
      actor: actor.actor,
      desiredState: desiredState.versionRef,
      idempotencyKey: idempotencyKey.idempotencyKey,
      mode: mode.mode,
    },
  };
}

function parseAttemptId(value: unknown):
  | {
      attemptId: InstanceDeploymentAttemptHeartbeatRequest["attemptId"];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "string") {
    return {
      body: {
        code: "invalid-attempt-id",
        error: "Deployment attempt id must be a string.",
        field: "attemptId",
      },
      ok: false,
    };
  }

  const attemptId = validateDeploymentAttemptId(value);

  if (!attemptId.ok) {
    return {
      body: deploymentValidationErrorBody(attemptId.error),
      ok: false,
    };
  }

  return { attemptId: attemptId.attemptId, ok: true };
}

function parseAttemptMode(value: unknown):
  | {
      mode: InstanceDeploymentAttemptStartRequest["mode"];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "string") {
    return {
      body: {
        code: "invalid-attempt-mode",
        error: "Deployment attempt mode must be a string.",
        field: "mode",
      },
      ok: false,
    };
  }

  const mode = validateDeploymentAttemptMode(value);

  if (!mode.ok) {
    return {
      body: deploymentValidationErrorBody(mode.error),
      ok: false,
    };
  }

  return { mode: mode.mode, ok: true };
}

function parseIdempotencyKey(value: unknown):
  | {
      idempotencyKey: InstanceDeploymentAttemptStartRequest["idempotencyKey"];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "string") {
    return {
      body: {
        code: "invalid-idempotency-key",
        error: "Deployment idempotency key must be a string.",
        field: "idempotencyKey",
      },
      ok: false,
    };
  }

  const idempotencyKey = validateDeploymentIdempotencyKey(value);

  if (!idempotencyKey.ok) {
    return {
      body: deploymentValidationErrorBody(idempotencyKey.error),
      ok: false,
    };
  }

  return { idempotencyKey: idempotencyKey.idempotencyKey, ok: true };
}

function parseLeaseToken(value: unknown):
  | {
      leaseToken: InstanceDeploymentAttemptHeartbeatRequest["leaseToken"];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "string") {
    return {
      body: {
        code: "invalid-lease-token",
        error: "Deployment lease token must be a string.",
        field: "leaseToken",
      },
      ok: false,
    };
  }

  const leaseToken = validateDeploymentLeaseToken(value);

  if (!leaseToken.ok) {
    return {
      body: deploymentValidationErrorBody(leaseToken.error),
      ok: false,
    };
  }

  return { leaseToken: leaseToken.leaseToken, ok: true };
}

function parseDeploymentActor(value: unknown):
  | {
      actor: DeploymentActor;
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: "Deployment actor must be an object." },
      ok: false,
    };
  }

  if (typeof value.actorId !== "string") {
    return {
      body: {
        code: "invalid-actor-id",
        error: "Deployment actor id must be a string.",
        field: "actorId",
      },
      ok: false,
    };
  }

  const actorId = validateDeploymentActorId(value.actorId);

  if (!actorId.ok) {
    return {
      body: deploymentValidationErrorBody(actorId.error),
      ok: false,
    };
  }

  if (
    typeof value.kind !== "string" ||
    !deploymentActorKinds.has(value.kind as DeploymentActorKind)
  ) {
    return {
      body: {
        error: 'Deployment actor kind must be "ci", "cli", "runner", or "system".',
        field: "kind",
      },
      ok: false,
    };
  }

  const displayName = optionalTrimmedString(value.displayName, "Deployment actor display name");

  if (!displayName.ok) {
    return displayName;
  }

  const runnerId = optionalTrimmedString(value.runnerId, "Deployment actor runner id");

  if (!runnerId.ok) {
    return runnerId;
  }

  return {
    actor: {
      actorId: actorId.actorId,
      ...(displayName.value === undefined ? {} : { displayName: displayName.value }),
      kind: value.kind as DeploymentActorKind,
      ...(runnerId.value === undefined ? {} : { runnerId: runnerId.value }),
    },
    ok: true,
  };
}

async function readJsonObject(
  request: Request,
  context: string,
): Promise<
  | {
      ok: true;
      value: Record<string, unknown>;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    }
> {
  let value: unknown;

  try {
    value = await request.json();
  } catch {
    return {
      body: { error: `${context} must be a JSON object.` },
      ok: false,
    };
  }

  if (!isRecord(value)) {
    return {
      body: { error: `${context} must be a JSON object.` },
      ok: false,
    };
  }

  return { ok: true, value };
}

function parseDeploymentPlanSummary(value: unknown):
  | {
      ok: true;
      summary: DeploymentPlanSummary;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: "Deployment plan summary must be an object." },
      ok: false,
    };
  }

  const changes = parseDeploymentPlanChangeCounts(value.changes);

  if (!changes.ok) {
    return changes;
  }

  const blockers = parseDeploymentPlanIssues(value.blockers, "Deployment plan blockers");

  if (!blockers.ok) {
    return blockers;
  }

  const warnings = parseDeploymentPlanIssues(value.warnings, "Deployment plan warnings");

  if (!warnings.ok) {
    return warnings;
  }

  const displayText = optionalTrimmedString(value.displayText, "Deployment plan display text");

  if (!displayText.ok) {
    return displayText;
  }

  return {
    ok: true,
    summary: {
      blockers: blockers.issues,
      changes: changes.changes,
      ...(displayText.value === undefined ? {} : { displayText: displayText.value }),
      warnings: warnings.issues,
    },
  };
}

function parseDeploymentPlanChangeCounts(value: unknown):
  | {
      changes: DeploymentPlanSummary["changes"];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: "Deployment plan changes must be an object." },
      ok: false,
    };
  }

  const create = parseNonNegativeInteger(value.create, "Deployment plan create count");
  const update = parseNonNegativeInteger(value.update, "Deployment plan update count");
  const deleteCount = parseNonNegativeInteger(value.delete, "Deployment plan delete count");
  const noChange = parseNonNegativeInteger(value.noChange, "Deployment plan no-change count");

  if (!create.ok) {
    return create;
  }

  if (!update.ok) {
    return update;
  }

  if (!deleteCount.ok) {
    return deleteCount;
  }

  if (!noChange.ok) {
    return noChange;
  }

  return {
    changes: {
      create: create.value,
      delete: deleteCount.value,
      noChange: noChange.value,
      update: update.value,
    },
    ok: true,
  };
}

function parseDeploymentPlanIssues(
  value: unknown,
  context: string,
):
  | {
      issues: DeploymentPlanIssue[];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!Array.isArray(value)) {
    return {
      body: { error: `${context} must be an array.` },
      ok: false,
    };
  }

  const issues: DeploymentPlanIssue[] = [];

  for (const [index, issueValue] of value.entries()) {
    const issue = parseDeploymentPlanIssue(issueValue, `${context}[${index}]`);

    if (!issue.ok) {
      return issue;
    }

    issues.push(issue.issue);
  }

  return { issues, ok: true };
}

function parseDeploymentPlanIssue(
  value: unknown,
  context: string,
):
  | {
      issue: DeploymentPlanIssue;
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: `${context} must be an object.` },
      ok: false,
    };
  }

  const code = requiredTrimmedString(value.code, `${context} code`);

  if (!code.ok) {
    return code;
  }

  const message = requiredTrimmedString(value.message, `${context} message`);

  if (!message.ok) {
    return message;
  }

  const logicalId = optionalTrimmedString(value.logicalId, `${context} logical id`);

  if (!logicalId.ok) {
    return logicalId;
  }

  return {
    issue: {
      code: code.value,
      ...(logicalId.value === undefined ? {} : { logicalId: logicalId.value }),
      message: message.value,
    },
    ok: true,
  };
}

function parseAlchemyStatePointer(value: unknown):
  | {
      ok: true;
      pointer: DeploymentAlchemyStatePointer;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: "Deployment Alchemy state pointer must be an object." },
      ok: false,
    };
  }

  const app = optionalTrimmedString(value.app, "Deployment Alchemy app");
  const stage = optionalTrimmedString(value.stage, "Deployment Alchemy stage");
  const scope = optionalTrimmedString(value.scope, "Deployment Alchemy scope");

  if (!app.ok) {
    return app;
  }

  if (!stage.ok) {
    return stage;
  }

  if (!scope.ok) {
    return scope;
  }

  return {
    ok: true,
    pointer: {
      ...(app.value === undefined ? {} : { app: app.value }),
      ...(scope.value === undefined ? {} : { scope: scope.value }),
      ...(stage.value === undefined ? {} : { stage: stage.value }),
    },
  };
}

function parseDeploymentEvidenceSummaries(
  value: unknown,
  targetId: string,
):
  | {
      evidence: DeploymentResourceEvidenceSummary[];
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!Array.isArray(value)) {
    return {
      body: { error: "Deployment resource evidence must be an array." },
      ok: false,
    };
  }

  const evidence: DeploymentResourceEvidenceSummary[] = [];
  const logicalIds = new Set<string>();

  for (const [index, evidenceValue] of value.entries()) {
    const parsed = parseDeploymentEvidenceSummary(
      evidenceValue,
      targetId,
      `Deployment resource evidence[${index}]`,
    );

    if (!parsed.ok) {
      return parsed;
    }

    if (logicalIds.has(parsed.evidence.logicalId)) {
      return {
        body: {
          error: `Deployment resource evidence logical id "${parsed.evidence.logicalId}" is duplicated.`,
        },
        ok: false,
      };
    }

    logicalIds.add(parsed.evidence.logicalId);
    evidence.push(parsed.evidence);
  }

  return { evidence, ok: true };
}

function parseDeploymentEvidenceSummary(
  value: unknown,
  targetId: string,
  context: string,
):
  | {
      evidence: DeploymentResourceEvidenceSummary;
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: `${context} must be an object.` },
      ok: false,
    };
  }

  const unexpectedKeys = unexpectedRecordKeys(value, [
    "action",
    "alchemyResourceId",
    "displayName",
    "kind",
    "logicalId",
    "providerFamily",
    "providerResourceIds",
    "targetId",
  ]);

  if (unexpectedKeys.length > 0) {
    return {
      body: {
        error: `${context} has unsupported field "${unexpectedKeys[0]}".`,
      },
      ok: false,
    };
  }

  const logicalId = requiredTrimmedString(value.logicalId, `${context} logical id`);

  if (!logicalId.ok) {
    return logicalId;
  }

  if (typeof value.targetId !== "string") {
    return {
      body: { error: `${context} target id must be a string.` },
      ok: false,
    };
  }

  const evidenceTargetId = validateDeploymentTargetId(value.targetId);

  if (!evidenceTargetId.ok) {
    return {
      body: deploymentValidationErrorBody(evidenceTargetId.error),
      ok: false,
    };
  }

  if (evidenceTargetId.targetId !== targetId) {
    return {
      body: { error: `${context} target id must match the desired-state target id.` },
      ok: false,
    };
  }

  const kind = parseDeploymentResourceKind(value.kind, `${context} kind`);

  if (!kind.ok) {
    return kind;
  }

  const providerFamily = parseDeploymentProviderFamily(
    value.providerFamily,
    `${context} provider family`,
  );

  if (!providerFamily.ok) {
    return providerFamily;
  }

  const action = parseDeploymentEvidenceAction(value.action, `${context} action`);

  if (!action.ok) {
    return action;
  }

  const providerResourceIds = parseStringArray(
    value.providerResourceIds,
    `${context} provider resource ids`,
  );

  if (!providerResourceIds.ok) {
    return providerResourceIds;
  }

  const forbiddenProviderResourceId = providerResourceIds.values.find(
    containsForbiddenDeploymentSecretValue,
  );

  if (forbiddenProviderResourceId !== undefined) {
    return {
      body: {
        error: `${context} provider resource ids cannot include secret values.`,
      },
      ok: false,
    };
  }

  const displayName = optionalTrimmedString(value.displayName, `${context} display name`);

  if (!displayName.ok) {
    return displayName;
  }

  const alchemyResourceId = optionalTrimmedString(
    value.alchemyResourceId,
    `${context} Alchemy resource id`,
  );

  if (!alchemyResourceId.ok) {
    return alchemyResourceId;
  }

  return {
    evidence: {
      action: action.action,
      ...(alchemyResourceId.value === undefined
        ? {}
        : { alchemyResourceId: alchemyResourceId.value }),
      ...(displayName.value === undefined ? {} : { displayName: displayName.value }),
      kind: kind.kind,
      logicalId: logicalId.value,
      providerFamily: providerFamily.providerFamily,
      providerResourceIds: providerResourceIds.values,
      targetId: evidenceTargetId.targetId,
    },
    ok: true,
  };
}

function parseDeploymentFailureSummary(value: unknown):
  | {
      ok: true;
      summary: DeploymentFailureSummary;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: "Deployment failure summary must be an object." },
      ok: false,
    };
  }

  const code = requiredTrimmedString(value.code, "Deployment failure code");

  if (!code.ok) {
    return code;
  }

  const displayMessage = requiredTrimmedString(
    value.displayMessage,
    "Deployment failure display message",
  );

  if (!displayMessage.ok) {
    return displayMessage;
  }

  const details = optionalTrimmedString(value.details, "Deployment failure details");

  if (!details.ok) {
    return details;
  }

  return {
    ok: true,
    summary: {
      code: code.value,
      ...(details.value === undefined ? {} : { details: details.value }),
      displayMessage: displayMessage.value,
    },
  };
}

function parseDeploymentDriftStatus(value: unknown):
  | {
      ok: true;
      status: DeploymentDriftStatus;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "string" || !deploymentDriftStatusSet.has(value as DeploymentDriftStatus)) {
    return {
      body: { error: 'Deployment drift status must be "drifted", "in-sync", or "unknown".' },
      ok: false,
    };
  }

  return { ok: true, status: value as DeploymentDriftStatus };
}

function parseDeploymentDriftSummary(value: unknown):
  | {
      ok: true;
      summary: InstanceDeploymentDriftWritebackRequest["summary"];
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!isRecord(value)) {
    return {
      body: { error: "Deployment drift summary must be an object." },
      ok: false,
    };
  }

  const affectedLogicalIds = parseStringArray(
    value.affectedLogicalIds,
    "Deployment drift affected logical ids",
  );
  const create = parseNonNegativeInteger(value.create, "Deployment drift create count");
  const update = parseNonNegativeInteger(value.update, "Deployment drift update count");
  const deleteCount = parseNonNegativeInteger(value.delete, "Deployment drift delete count");

  if (!affectedLogicalIds.ok) {
    return affectedLogicalIds;
  }

  if (!create.ok) {
    return create;
  }

  if (!update.ok) {
    return update;
  }

  if (!deleteCount.ok) {
    return deleteCount;
  }

  return {
    ok: true,
    summary: {
      affectedLogicalIds: affectedLogicalIds.values,
      create: create.value,
      delete: deleteCount.value,
      update: update.value,
    },
  };
}

function parseDeploymentResourceKind(
  value: unknown,
  context: string,
):
  | {
      kind: DeploymentResourceKind;
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (
    typeof value !== "string" ||
    !deploymentResourceKindSet.has(value as DeploymentResourceKind)
  ) {
    return {
      body: {
        error: `${context} must be "cloudflare-worker-custom-domain", "cloudflare-redirect-rule", or "cloudflare-dns-records".`,
      },
      ok: false,
    };
  }

  return { kind: value as DeploymentResourceKind, ok: true };
}

function parseDeploymentProviderFamily(
  value: unknown,
  context: string,
):
  | {
      ok: true;
      providerFamily: DeploymentProviderFamily;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (
    typeof value !== "string" ||
    !deploymentProviderFamilySet.has(value as DeploymentProviderFamily)
  ) {
    return {
      body: { error: `${context} must be "cloudflare".` },
      ok: false,
    };
  }

  return { ok: true, providerFamily: value as DeploymentProviderFamily };
}

function parseDeploymentEvidenceAction(
  value: unknown,
  context: string,
):
  | {
      action: DeploymentEvidenceAction;
      ok: true;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (
    typeof value !== "string" ||
    !deploymentEvidenceActionSet.has(value as DeploymentEvidenceAction)
  ) {
    return {
      body: {
        error: `${context} must be "adopted", "created", "deleted", "no-change", or "updated".`,
      },
      ok: false,
    };
  }

  return { action: value as DeploymentEvidenceAction, ok: true };
}

function parseStringArray(
  value: unknown,
  context: string,
):
  | {
      ok: true;
      values: string[];
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (!Array.isArray(value)) {
    return {
      body: { error: `${context} must be an array.` },
      ok: false,
    };
  }

  const values: string[] = [];

  for (const [index, item] of value.entries()) {
    const parsed = requiredTrimmedString(item, `${context}[${index}]`);

    if (!parsed.ok) {
      return parsed;
    }

    values.push(parsed.value);
  }

  return { ok: true, values };
}

function parseNonNegativeInteger(
  value: unknown,
  context: string,
):
  | {
      ok: true;
      value: number;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return {
      body: { error: `${context} must be a non-negative safe integer.` },
      ok: false,
    };
  }

  return { ok: true, value };
}

function requiredTrimmedString(
  value: unknown,
  context: string,
):
  | {
      ok: true;
      value: string;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (typeof value !== "string") {
    return {
      body: { error: `${context} must be a string.` },
      ok: false,
    };
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return {
      body: { error: `${context} must not be empty.` },
      ok: false,
    };
  }

  return { ok: true, value: trimmed };
}

function optionalTrimmedString(
  value: unknown,
  context: string,
):
  | {
      ok: true;
      value?: string;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
    } {
  if (value === undefined) {
    return { ok: true };
  }

  if (typeof value !== "string") {
    return {
      body: { error: `${context} must be a string.` },
      ok: false,
    };
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return {
      body: { error: `${context} must not be empty.` },
      ok: false,
    };
  }

  return { ok: true, value: trimmed };
}

function isInstanceDeploymentRuntimeApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DEPLOYMENT_API_PATH ||
    pathname.startsWith(`${INSTANCE_DEPLOYMENT_API_PATH}/`)
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

function deploymentValidationErrorBody(error: DeploymentRuntimeValidationError) {
  return {
    error: error.message,
    code: error.code,
    ...(error.field === undefined ? {} : { field: error.field }),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}

function unexpectedRecordKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);

  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort((left, right) => left.localeCompare(right));
}

function containsForbiddenDeploymentSecretValue(value: string) {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return (
    normalized.includes("cf_api_token") ||
    normalized.includes("cloudflare_api_token") ||
    normalized.includes("alchemy_password") ||
    normalized.includes("alchemy_state_token") ||
    normalized.includes("raw_lease_token") ||
    normalized.includes("lease_token") ||
    value.includes("-----BEGIN PRIVATE KEY-----")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
