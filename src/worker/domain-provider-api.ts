import {
  INSTANCE_DOMAIN_PROVIDER_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_APPLY_API_PATH,
  INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH,
  type DomainProviderConfigIssue,
  type DomainProviderConfigStatus,
  type InstanceDomainProviderApplyBlockedCode,
  type InstanceDomainProviderApplyResponse,
  type InstanceDomainProviderPlanResponse,
} from "../shared/domain-provider-api.ts";
import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import type { DomainProviderZone } from "../shared/domain-provider-protocol.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { readInstanceDomainMappings } from "./instance-domain-mappings-state.ts";

const APPLY_LOCK_ID = "domain-provider-apply";
const applyLockTableSql = `
  CREATE TABLE IF NOT EXISTS instance_domain_provider_apply_lock (
    lock_id TEXT PRIMARY KEY CHECK (lock_id = '${APPLY_LOCK_ID}'),
    acquired_at TEXT NOT NULL
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

  if (
    url.pathname === INSTANCE_DOMAIN_PROVIDER_API_PATH ||
    url.pathname === INSTANCE_DOMAIN_PROVIDER_PLAN_API_PATH
  ) {
    if (request.method !== "GET") {
      return methodNotAllowedResponse("GET");
    }

    return jsonResponse(domainProviderPlanResponse(storage, env));
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

  const response = domainProviderPlanResponse(storage, env);

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

  const lock = acquireDomainProviderApplyLock(storage, nowIsoString());

  if (!lock.acquired) {
    return applyBlockedResponse(
      "domain-provider-apply-running",
      `Domain provider apply is already running since ${lock.acquiredAt}.`,
      response,
      409,
    );
  }

  try {
    await yieldToConcurrentApplyRequests();

    return jsonResponse(
      {
        code: "domain-provider-apply-executor-missing",
        config: response.config,
        error:
          "Domain provider apply executor is not installed yet. This API is ready for the Alchemy executor chunk.",
        plan: response.plan,
        status: "not-implemented",
      } satisfies InstanceDomainProviderApplyResponse,
      501,
    );
  } finally {
    releaseDomainProviderApplyLock(storage);
  }
}

function domainProviderPlanResponse(
  storage: DurableObjectStorage,
  env: DurableObjectDomainProviderEnv,
): InstanceDomainProviderPlanResponse {
  const config = domainProviderConfigStatus(env);
  const plan = planDomainProviderResources({
    instanceId: config.instanceId ?? "unconfigured-instance",
    mappings: readInstanceDomainMappings(storage).map((mapping) => ({
      enabled: mapping.enabled,
      host: mapping.host,
      profile: mapping.profile,
      ...(mapping.targetInstallId === undefined
        ? {}
        : { targetInstallId: mapping.targetInstallId }),
    })),
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

function yieldToConcurrentApplyRequests(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
