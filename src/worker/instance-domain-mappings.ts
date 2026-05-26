import {
  parseCreateInstanceDomainMappingRequest,
  parseRecordInstanceDomainMappingApplyEvidenceRequest,
  type InstanceDomainMapping,
  type InstanceDomainMappingLookupResponse,
  type InstanceDomainMappingsResponse,
  type RecordInstanceDomainMappingApplyEvidenceResponse,
} from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  createInstanceDomainMapping,
  readInstanceDomainMappingAppliedStates,
  readInstanceDomainMappingAuditEvents,
  readEnabledInstanceDomainMappingForHost,
  readInstanceDomainMappings,
  recordInstanceDomainMappingApplyEvidence,
} from "./instance-domain-mappings-state.ts";

export const INSTANCE_DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
const INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/lookup`;
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
  const requestUrl = new URL(request.url);
  const lookupUrl = new URL(INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH, requestUrl.origin);
  lookupUrl.searchParams.set("host", requestUrl.host);
  lookupUrl.searchParams.set("surface", "site");

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
  env: AuthorityAdminGuardEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (!isInstanceDomainMappingsApiPath(url.pathname)) {
    return undefined;
  }

  try {
    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_APPLY_EVIDENCE_API_PATH) {
      return handleApplyEvidenceRequest(request, storage, env);
    }

    if (url.pathname === INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH) {
      return handleLookupRequest(request, storage, url);
    }

    if (url.pathname !== INSTANCE_DOMAIN_MAPPINGS_API_PATH) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method === "GET") {
      return jsonResponse(domainMappingsResponse(storage));
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
      const result = createInstanceDomainMapping(storage, {
        ...body,
        now: nowIsoString(),
      });

      if (!result.ok) {
        return jsonResponse(
          {
            error: result.error.message,
            code: result.error.code,
            ...(result.error.field === undefined ? {} : { field: result.error.field }),
            mappings: result.mappings,
          },
          domainMappingFailureStatus(result.error.code),
        );
      }

      return jsonResponse(
        {
          mapping: result.mapping,
          mappings: result.mappings,
        },
        201,
      );
    }

    return methodNotAllowedResponse("GET, POST");
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

async function handleApplyEvidenceRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: AuthorityAdminGuardEnv,
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
  const result = recordInstanceDomainMappingApplyEvidence(storage, {
    ...body,
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

function handleLookupRequest(request: Request, storage: DurableObjectStorage, url: URL): Response {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const host = url.searchParams.get("host");
  const surface = url.searchParams.get("surface") ?? "site";

  if (host === null || host.trim() === "") {
    return jsonResponse({ error: "Domain mapping lookup requires host." }, 400);
  }

  if (surface !== "site") {
    return jsonResponse({ error: 'Domain mapping surface must be "site".' }, 400);
  }

  const response: InstanceDomainMappingLookupResponse = {
    mapping: readEnabledInstanceDomainMappingForHost(storage, { host, surface }) ?? null,
  };

  return jsonResponse(response);
}

function isInstanceDomainMappingsApiPath(pathname: string) {
  return (
    pathname === INSTANCE_DOMAIN_MAPPINGS_API_PATH ||
    pathname.startsWith(`${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/`)
  );
}

function domainMappingsResponse(storage: DurableObjectStorage): InstanceDomainMappingsResponse {
  return {
    appliedStates: readInstanceDomainMappingAppliedStates(storage),
    auditEvents: readInstanceDomainMappingAuditEvents(storage),
    mappings: readInstanceDomainMappings(storage),
  };
}

function domainMappingFailureStatus(code: string) {
  if (code === "duplicate-domain-mapping") {
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
