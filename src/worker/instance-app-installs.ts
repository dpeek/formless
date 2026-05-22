import { listBundledAppPackages } from "../shared/app-installs.ts";
import {
  parseCreateAppInstallRequest,
  type AppInstallsResponse,
  type CreateAppInstallResponse,
} from "../shared/protocol.ts";
import { nowIsoString } from "../shared/clock.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import {
  createInstanceAppInstall,
  readInstanceAppInstalls,
} from "./instance-app-installs-state.ts";

export const INSTANCE_APP_INSTALLS_API_PATH = "/api/formless/app-installs";

type InstanceAppInstallsApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export async function handleInstanceAppInstallsApiRequest(
  request: Request,
  env: InstanceAppInstallsApiEnv,
): Promise<Response | undefined> {
  if (!isInstanceAppInstallsApiPath(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(FORMLESS_INSTANCE_AUTHORITY_NAME);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceAppInstallsDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: AuthorityAdminGuardEnv,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;

  if (!isInstanceAppInstallsApiPath(pathname)) {
    return undefined;
  }

  try {
    if (pathname !== INSTANCE_APP_INSTALLS_API_PATH) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    if (request.method === "GET") {
      return jsonResponse(appInstallsResponse(storage));
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

      const body = parseCreateAppInstallRequest(await readJson(request));
      const result = createInstanceAppInstall(storage, { ...body, now: nowIsoString() });

      if (!result.ok) {
        return jsonResponse(
          {
            error: result.error.message,
            code: result.error.code,
            ...(result.error.field === undefined ? {} : { field: result.error.field }),
            installs: result.installs,
          },
          installFailureStatus(result.error.code),
        );
      }

      const response: CreateAppInstallResponse = {
        initialization: result.initialization,
        install: result.install,
        installs: result.installs,
      };

      return jsonResponse(response, 201);
    }

    return methodNotAllowedResponse("GET, POST");
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function isInstanceAppInstallsApiPath(pathname: string) {
  return (
    pathname === INSTANCE_APP_INSTALLS_API_PATH ||
    pathname.startsWith(`${INSTANCE_APP_INSTALLS_API_PATH}/`)
  );
}

function appInstallsResponse(storage: DurableObjectStorage): AppInstallsResponse {
  return {
    packages: listBundledAppPackages(),
    installs: readInstanceAppInstalls(storage),
  };
}

function installFailureStatus(code: string) {
  return code === "duplicate-install-id" ? 409 : 400;
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
