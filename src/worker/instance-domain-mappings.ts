import {
  parseCreateInstanceDomainMappingRequest,
  type InstanceDomainMappingLookupResponse,
  type InstanceDomainMappingsResponse,
} from "../shared/instance-domain-mappings.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  createInstanceDomainMapping,
  readEnabledInstanceDomainMappingForHost,
  readInstanceDomainMappings,
} from "./instance-domain-mappings-state.ts";

export const INSTANCE_DOMAIN_MAPPINGS_API_PATH = "/api/formless/domain-mappings";
const INSTANCE_DOMAIN_MAPPINGS_LOOKUP_API_PATH = `${INSTANCE_DOMAIN_MAPPINGS_API_PATH}/lookup`;

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
    mappings: readInstanceDomainMappings(storage),
  };
}

function domainMappingFailureStatus(code: string) {
  return code === "duplicate-domain-mapping" ? 409 : 400;
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
