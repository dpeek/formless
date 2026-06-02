import {
  buildInstanceDomainMapping,
  disableInstanceDomainMapping,
  forgetInstanceDomainMapping,
  parseCreateInstanceDomainMappingRequest,
  parseDeleteInstanceDomainMappingRequest,
  parseRecordInstanceDomainMappingApplyEvidenceRequest,
  listInstanceDomainMappings,
  normalizeInstanceDomainHost,
  resolveInstanceDomainMappingProfile,
  type DeleteInstanceDomainMappingResponse,
  type ForgetInstanceDomainMappingResponse,
  type InstanceDomainMapping,
  type InstanceDomainMappingDesiredCleanupEvent,
  type InstanceDomainMappingLookupResponse,
  type InstanceDomainMappingsResponse,
  type RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  readInstanceDomainMappingAppliedStates,
  readInstanceDomainMappingAuditEvents,
  readInstanceDomainMappingDesiredCleanupEvents,
  readInstanceDomainMappings,
  recordInstanceDomainMappingDesiredCleanup,
  recordInstanceDomainMappingApplyEvidence,
} from "./instance-domain-mappings-state.ts";
import { readBackfilledControlPlaneAppInstalls } from "./instance-app-installs.ts";
import {
  readControlPlaneRecords,
  syncDomainIntentToControlPlane,
} from "./deployment-control-plane-client.ts";
import type { StoredRecord } from "../shared/protocol.ts";

export const INSTANCE_DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
const INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/lookup`;
const INSTANCE_DOMAIN_MAPPINGS_FORGET_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/forget`;
const INSTANCE_DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/apply-evidence`;

type InstanceDomainMappingsApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export async function handleInstanceDomainMappingsApiRequest(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceDomainMappingsApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function lookupEnabledInstanceSiteDomainMappingForRequestHost(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
): Promise<InstanceDomainMapping | undefined> {
  return lookupEnabledInstanceDomainMappingForRequestHost(request, env, "publicSite");
}

export async function lookupEnabledInstanceRoutableDomainMappingForRequestHost(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
): Promise<InstanceDomainMapping | undefined> {
  return (
    (await lookupEnabledInstanceDomainMappingForRequestHost(request, env, "instance")) ??
    (await lookupEnabledInstanceDomainMappingForRequestHost(request, env, "app")) ??
    (await lookupEnabledInstanceDomainMappingForRequestHost(request, env, "publicSite"))
  );
}

async function lookupEnabledInstanceDomainMappingForRequestHost(
  request: Request,
  env: InstanceDomainMappingsApiEnv,
  profile: "instance" | "app" | "publicSite",
): Promise<InstanceDomainMapping | undefined> {
  const requestUrl = new URL(request.url);
  const lookupUrl = new URL(INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH, requestUrl.origin);
  lookupUrl.searchParams.set("host", requestUrl.host);
  lookupUrl.searchParams.set("profile", profile);

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(lookupUrl, {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    return undefined;
  }

  const body = (await response.json()) as InstanceDomainMappingLookupResponse;

  return body.mapping ?? undefined;
}

export async function handleInstanceDomainMappingsDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceDomainMappingsApiPath(url.pathname)) {
    return undefined;
  }

  try {
    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH) {
      return handleApplyEvidenceRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_FORGET_API_PATH) {
      return handleForgetRequest(request, storage, env, url);
    }

    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH) {
      return await handleLookupRequest(request, storage, env, url);
    }

    if (url.pathname !== INSTANCE_DOMAIN_MAPPINGS_API_PATH) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method === "GET") {
      return jsonResponse(await domainMappingsResponse(storage, env, request.url));
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

      const body = parseCreateInstanceDomainMappingRequest(await readJson(request));
      const now = nowIsoString();
      const existingMappings = await readControlPlaneSyncedDomainMappings(
        storage,
        env,
        request.url,
      );
      const installs = await readBackfilledControlPlaneAppInstalls(storage, env, request.url);
      const result = buildInstanceDomainMapping({
        ...body,
        existingMappings,
        installs,
        now,
      });

      if (!result.ok) {
        return jsonResponse(
          {
            error: result.error.message,
            code: result.error.code,
            ...(result.error.field === undefined ? {} : { field: result.error.field }),
            mappings: existingMappings,
          },
          domainMappingFailureStatus(result.error.code),
        );
      }

      const mappings = await writeControlPlaneDomainMappings(storage, env, request.url, {
        mappings: result.mappings,
        now,
      });

      return jsonResponse(
        {
          mapping: findDomainMapping(mappings, result.mapping) ?? result.mapping,
          mappings,
        },
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

      const body = parseDeleteInstanceDomainMappingRequest({
        host: url.searchParams.get("host") ?? "",
        profile: url.searchParams.get("profile") ?? undefined,
        surface:
          url.searchParams.get("surface") ?? (url.searchParams.has("profile") ? undefined : "site"),
      });
      const now = nowIsoString();
      const existingMappings = await readControlPlaneSyncedDomainMappings(
        storage,
        env,
        request.url,
      );
      const result = disableInstanceDomainMapping({
        ...body,
        existingMappings,
        now,
      });

      if (!result.ok) {
        return jsonResponse(
          {
            error: result.error.message,
            code: result.error.code,
            ...(result.error.field === undefined ? {} : { field: result.error.field }),
            mappings: existingMappings,
          },
          domainMappingFailureStatus(result.error.code),
        );
      }

      const mappings = await writeControlPlaneDomainMappings(storage, env, request.url, {
        mappings: result.mappings,
        now,
      });
      const response: DeleteInstanceDomainMappingResponse = {
        mapping: findDomainMapping(mappings, result.mapping) ?? result.mapping,
        mappings,
      };

      return jsonResponse(response);
    }

    return methodNotAllowedResponse("GET, POST, DELETE");
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleForgetRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
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

  const body = parseDeleteInstanceDomainMappingRequest({
    host: url.searchParams.get("host") ?? "",
    profile: url.searchParams.get("profile") ?? undefined,
    surface:
      url.searchParams.get("surface") ?? (url.searchParams.has("profile") ? undefined : "site"),
  });
  const now = nowIsoString();
  const existingMappings = await readControlPlaneSyncedDomainMappings(storage, env, request.url);
  const result = forgetInstanceDomainMapping({
    ...body,
    appliedStates: readInstanceDomainMappingAppliedStates(storage),
    existingMappings,
    now,
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.error.message,
        code: result.error.code,
        ...(result.error.field === undefined ? {} : { field: result.error.field }),
        mappings: existingMappings,
      },
      domainMappingFailureStatus(result.error.code),
    );
  }

  const cleanup = recordInstanceDomainMappingDesiredCleanup(storage, {
    mapping: result.mapping,
    now,
  });
  const mappings = await writeControlPlaneDomainMappings(storage, env, request.url, {
    mappings: result.mappings,
    now,
  });

  const response: ForgetInstanceDomainMappingResponse = {
    desiredCleanupEvent: cleanup.desiredCleanupEvent,
    desiredCleanupEvents: cleanup.desiredCleanupEvents,
    mapping: result.mapping,
    mappings,
  };

  return jsonResponse(response);
}

async function handleApplyEvidenceRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
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

  const body = parseRecordInstanceDomainMappingApplyEvidenceRequest(await readJson(request));
  const existingMappings = await readControlPlaneSyncedDomainMappings(storage, env, request.url);
  const result = recordInstanceDomainMappingApplyEvidence(storage, {
    ...body,
    existingMappings,
    now: nowIsoString(),
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.error.message,
        code: result.error.code,
        ...(result.error.field === undefined ? {} : { field: result.error.field }),
      },
      domainMappingFailureStatus(result.error.code),
    );
  }

  const response: RecordInstanceDomainMappingApplyEvidenceResponse = {
    appliedState: result.appliedState,
    appliedStates: result.appliedStates,
    auditEvent: result.auditEvent,
    auditEvents: result.auditEvents,
  };

  return jsonResponse(response);
}

async function handleLookupRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const host = url.searchParams.get("host");
  const profile = url.searchParams.get("profile") ?? undefined;
  const surface = url.searchParams.get("surface") ?? (profile === undefined ? "site" : undefined);

  if (host === null || host.trim() === "") {
    return jsonResponse({ error: "Domain mapping lookup requires host." }, 400);
  }

  const profileResult = resolveInstanceDomainMappingProfile(
    { profile, surface },
    { defaultProfile: "publicSite" },
  );

  if (!profileResult.ok) {
    return jsonResponse(
      {
        error: profileResult.error.message,
        code: profileResult.error.code,
        ...(profileResult.error.field === undefined ? {} : { field: profileResult.error.field }),
      },
      400,
    );
  }

  const mappings = await readControlPlaneSyncedDomainMappings(storage, env, request.url);
  const response: InstanceDomainMappingLookupResponse = {
    mapping:
      findEnabledDomainMapping(mappings, {
        host,
        profile: profileResult.profile,
      }) ?? null,
  };

  return jsonResponse(response);
}

function isInstanceDomainMappingsApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DOMAIN_MAPPINGS_API_PATH ||
    pathname.startsWith(`${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/`)
  );
}

async function domainMappingsResponse(
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
  requestUrl: string,
): Promise<InstanceDomainMappingsResponse> {
  return {
    appliedStates: readInstanceDomainMappingAppliedStates(storage),
    auditEvents: readInstanceDomainMappingAuditEvents(storage),
    desiredCleanupEvents: readInstanceDomainMappingDesiredCleanupEvents(storage),
    mappings: await readControlPlaneSyncedDomainMappings(storage, env, requestUrl),
  };
}

async function readControlPlaneSyncedDomainMappings(
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
  requestUrl: string,
): Promise<InstanceDomainMapping[]> {
  await readBackfilledControlPlaneAppInstalls(storage, env, requestUrl);
  const cleanupEvents = readInstanceDomainMappingDesiredCleanupEvents(storage);
  const legacyMappings = readInstanceDomainMappings(storage).filter(
    (mapping) => !isForgottenDomainMapping(mapping, cleanupEvents),
  );
  const records = await readControlPlaneRecords({ env, requestUrl });

  if (records === undefined) {
    return legacyMappings;
  }

  const routeMappings = domainMappingsFromControlPlaneRecords(records, cleanupEvents);
  const mergedMappings = mergeDomainMappings(legacyMappings, routeMappings);

  if (legacyMappings.length === 0) {
    return mergedMappings;
  }

  return writeControlPlaneDomainMappings(storage, env, requestUrl, {
    mappings: mergedMappings,
    now: nowIsoString(),
  });
}

async function writeControlPlaneDomainMappings(
  storage: DurableObjectStorage,
  env: InstanceDomainMappingsApiEnv,
  requestUrl: string,
  input: { mappings: readonly InstanceDomainMapping[]; now: string },
): Promise<InstanceDomainMapping[]> {
  const records = await syncDomainIntentToControlPlane({
    env,
    mappings: [...input.mappings],
    now: input.now,
    requestUrl,
  });

  if (records === undefined) {
    return listInstanceDomainMappings(input.mappings);
  }

  return domainMappingsFromControlPlaneRecords(
    records,
    readInstanceDomainMappingDesiredCleanupEvents(storage),
  );
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
          typeof record.values["match-host"] === "string",
      )
      .map(domainMappingFromControlPlaneRecord),
  ).filter((mapping) => !isForgottenDomainMapping(mapping, cleanupEvents));
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

function domainMappingFromControlPlaneRecord(record: StoredRecord): InstanceDomainMapping {
  const profile = domainMappingProfileFromRouteTarget(record.values["target-profile"]);
  const targetInstallId =
    typeof record.values["app-install"] === "string" ? record.values["app-install"] : undefined;

  return {
    host: String(record.values["match-host"]),
    profile,
    ...(profile === "publicSite" ? { surface: "site" as const } : {}),
    ...(targetInstallId === undefined ? {} : { installId: targetInstallId, targetInstallId }),
    enabled: record.values.enabled === true,
    createdAt: String(record.values["created-at"]),
    updatedAt: String(record.values["updated-at"]),
  };
}

function domainMappingProfileFromRouteTarget(value: unknown): InstanceDomainMapping["profile"] {
  if (value === "app" || value === "instance") {
    return value;
  }

  return "publicSite";
}

function findEnabledDomainMapping(
  mappings: readonly InstanceDomainMapping[],
  input: Pick<InstanceDomainMapping, "host" | "profile">,
): InstanceDomainMapping | undefined {
  const hostResult = normalizeInstanceDomainHost(input.host);

  if (!hostResult.ok) {
    throw new Error(hostResult.error.message);
  }

  return mappings.find(
    (mapping) =>
      mapping.enabled && mapping.host === hostResult.host && mapping.profile === input.profile,
  );
}

function findDomainMapping(
  mappings: readonly InstanceDomainMapping[],
  input: Pick<InstanceDomainMapping, "host" | "profile">,
): InstanceDomainMapping | undefined {
  return mappings.find(
    (mapping) => mapping.host === input.host && mapping.profile === input.profile,
  );
}

function domainMappingKey(mapping: Pick<InstanceDomainMapping, "host" | "profile">) {
  return `${mapping.profile}:${mapping.host}`;
}

function domainMappingFailureStatus(code: string) {
  if (
    code === "domain-mapping-enabled" ||
    code === "domain-mapping-has-applied-state" ||
    code === "duplicate-domain-mapping"
  ) {
    return 409;
  }

  if (code === "domain-mapping-not-found") {
    return 404;
  }

  return 400;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Bad request.";
}
