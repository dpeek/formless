import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_JOBS_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH,
  type DomainProviderConfigIssue,
  type DomainProviderConfigStatus,
  type InstanceDomainProviderApplyBlockedCode,
  type InstanceDomainProviderApplyJob,
  type InstanceDomainProviderApplyJobResourceEvidence,
  type InstanceDomainProviderApplyJobResponse,
  type InstanceDomainProviderApplyJobResultRequest,
  type InstanceDomainProviderApplyJobResultSummary,
  type InstanceDomainProviderApplyRequest,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import type {
  DomainProviderApplyPolicy,
  DomainProviderPlan,
  DomainProviderResource,
  DomainProviderZone,
} from "../shared/domain-provider-protocol.ts";
import { normalizeInstanceDomainHost } from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  readInstanceDomainMappings,
  recordInstanceDomainMappingApplyEvidence,
} from "./instance-domain-mappings-state.ts";

const APPLY_LOCK_ID = "domain-provider-apply";
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
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

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

type DurableObjectDomainProviderEnv = Omit<InstanceDomainProviderApiEnv, "FORMLESS_AUTHORITY">;

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

type DomainProviderApplyJobRow = {
  job_id: string;
  status: InstanceDomainProviderApplyJob["status"];
  runner_id: string | null;
  plan_json: string;
  result_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
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

  if (applyJobPath) {
    if (applyJobPath.result) {
      return handleApplyJobResultRequest(request, storage, env, applyJobPath.jobId);
    }

    return handleApplyJobStatusRequest(request, storage, applyJobPath.jobId);
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

    return jsonResponse(domainProviderPlanResponse(storage, env, options.options));
  }

  if (url.pathname === INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH) {
    return handleApplyRequest(request, storage, env);
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

  const response = domainProviderPlanResponse(storage, env, applyRequest.options);

  if (!response.config.applyReady) {
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

  let job: InstanceDomainProviderApplyJob;

  try {
    job = writeApplyJob(storage, {
      jobId: `domain-provider-apply-${crypto.randomUUID()}`,
      now,
      plan: response.plan,
      runnerId: applyRequest.request.runnerId,
    });
  } catch (error) {
    releaseDomainProviderApplyLock(storage);
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

  const completed = completeApplyJob(storage, {
    jobId,
    now: nowIsoString(),
    result: result.request,
  });

  if (!completed.ok) {
    return jsonResponse({ error: completed.error }, completed.status);
  }

  return jsonResponse({ job: completed.job } satisfies InstanceDomainProviderApplyJobResponse);
}

function domainProviderPlanResponse(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
  options: DomainProviderPlanOptions = {},
): InstanceDomainProviderPlanResponse {
  const config = domainProviderConfigStatus(env);
  const plan = planDomainProviderResources({
    instanceId: config.instanceId ?? "unconfigured-instance",
    mappings: readInstanceDomainMappings(storage)
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
    workerName: config.workerName ?? "unconfigured-worker",
    zones: config.zones,
  });

  return {
    config,
    plan,
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

  if (!cloudflareApiToken) {
    issues.push(
      configIssue("missing-cloudflare-api-token", ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"]),
    );
  }

  if (!alchemyPassword) {
    issues.push(configIssue("missing-alchemy-password", ["ALCHEMY_PASSWORD"]));
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

  const planReady = Boolean(
    instanceId && workerName && zoneResult.ok && zoneResult.zones.length > 0,
  );
  const applyReady = Boolean(planReady && accountId && cloudflareApiToken && alchemyPassword);

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
    planReady,
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

function writeApplyJob(
  storage: DurableObjectStorage,
  input: {
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
        result_json,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)
    `,
    input.jobId,
    "ready",
    input.runnerId ?? null,
    JSON.stringify(input.plan),
    input.now,
    input.now,
  );

  const job = readApplyJob(storage, input.jobId);

  if (!job) {
    throw new Error("Domain provider apply job was not written.");
  }

  return job;
}

function completeApplyJob(
  storage: DurableObjectStorage,
  input: {
    jobId: string;
    now: string;
    result: InstanceDomainProviderApplyJobResultRequest;
  },
):
  | { ok: true; job: InstanceDomainProviderApplyJob }
  | { ok: false; error: string; status: number } {
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

  for (const evidence of input.result.resources) {
    const recorded = recordInstanceDomainMappingApplyEvidence(storage, {
      action: evidence.action,
      alchemyResourceId: evidence.alchemyResourceId,
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
  }

  return finishApplyJob(storage, {
    job,
    now: input.now,
    result: { evidenceCount: input.result.resources.length },
    runnerId: input.result.runnerId,
    status: "succeeded",
  });
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
  if (resource.kind !== "cloudflare-worker-custom-domain") {
    return {
      ok: false,
      error: `Domain provider apply evidence for "${resource.logicalId}" is not supported yet.`,
    };
  }

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
}

function readApplyJob(
  storage: DurableObjectStorage,
  jobId: string,
): InstanceDomainProviderApplyJob | undefined {
  ensureDomainProviderApplyJobsTable(storage);

  for (const row of storage.sql.exec<DomainProviderApplyJobRow>(
    `
      SELECT job_id, status, runner_id, plan_json, result_json, error, created_at, updated_at
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
  const zoneId = parseRequiredString(value.zoneId, "Domain provider apply zone id");
  const zoneName = parseRequiredString(value.zoneName, "Domain provider apply zone name");

  if (!accountId.ok) return accountId;
  if (!action.ok) return action;
  if (!alchemyResourceId.ok) return alchemyResourceId;
  if (!host.ok) return host;
  if (!kind.ok) return kind;
  if (!logicalId.ok) return logicalId;
  if (!profile.ok) return profile;
  if (!targetInstallId.ok) return targetInstallId;
  if (!workerDomainId.ok) return workerDomainId;
  if (!workerName.ok) return workerName;
  if (!zoneId.ok) return zoneId;
  if (!zoneName.ok) return zoneName;

  if (kind.value !== "cloudflare-worker-custom-domain") {
    return {
      ok: false,
      error: 'Domain provider apply resource kind must be "cloudflare-worker-custom-domain".',
    };
  }

  if (profile.value !== "instance" && profile.value !== "app" && profile.value !== "publicSite") {
    return {
      ok: false,
      error: 'Domain provider apply profile must be "instance", "app", or "publicSite".',
    };
  }

  if (action.value !== "adopted" && action.value !== "created" && action.value !== "overridden") {
    return {
      ok: false,
      error: 'Domain provider apply action must be "adopted", "created", or "overridden".',
    };
  }

  return {
    ok: true,
    resource: {
      accountId: accountId.value,
      action: action.value,
      alchemyResourceId: alchemyResourceId.value,
      host: host.value,
      kind: kind.value,
      logicalId: logicalId.value,
      profile: profile.value,
      ...(targetInstallId.value === undefined ? {} : { targetInstallId: targetInstallId.value }),
      workerDomainId: workerDomainId.value,
      workerName: workerName.value,
      zoneId: zoneId.value,
      zoneName: zoneName.value,
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
      return `Domain provider apply requires Cloudflare account id in ${envNames.join(" or ")}.`;
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
