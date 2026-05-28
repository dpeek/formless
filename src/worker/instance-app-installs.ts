import {
  appInstallInitializationPlan,
  findAppInstall,
  listBundledAppPackages,
  type AppInstall,
} from "../shared/app-installs.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
} from "../shared/instance-control-plane.ts";
import {
  parseCreateAppInstallRequest,
  type AppInstallsResponse,
  type CreateAppInstallRequest,
  type CreateAppInstallResponse,
} from "../shared/protocol.ts";
import { authorizeInstanceWrite, type AuthorityAdminGuardEnv } from "./authority-admin-guard.ts";
import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "./formless-instance.ts";
import { INTERNAL_BACKFILL_APP_INSTALLS_PATH } from "./instance-control-plane.ts";
import { readLegacyInstanceAppInstalls } from "./instance-app-installs-state.ts";

export const INSTANCE_APP_INSTALLS_API_PATH = "/api/formless/app-installs";

export type InstanceAppInstallsApiEnv = AuthorityAdminGuardEnv & {
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

export async function lookupInstanceAppInstallForRequest(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  installId: string,
): Promise<AppInstall | undefined> {
  const requestUrl = new URL(request.url);
  const lookupUrl = new URL(INSTANCE_APP_INSTALLS_API_PATH, requestUrl.origin);
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

  const body = (await response.json()) as AppInstallsResponse;

  return findAppInstall(body.installs, installId);
}

export async function handleInstanceAppInstallsDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAppInstallsApiEnv,
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
      return jsonResponse(await appInstallsResponse(request, storage, env));
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
      await readBackfilledControlPlaneAppInstalls(storage, env, request.url);
      const created = await createControlPlaneAppInstall(request, env, body);

      if (!created.response.ok) {
        return jsonResponse(
          created.body,
          installFailureStatus(
            typeof created.body === "object" && created.body !== null && "code" in created.body
              ? String(created.body.code)
              : undefined,
          ),
        );
      }

      const installs = await readBackfilledControlPlaneAppInstalls(storage, env, request.url);
      const install = findAppInstall(installs, body.installId);

      if (!install) {
        throw new Error(`Created install "${body.installId}" was not returned by control-plane.`);
      }

      const response: CreateAppInstallResponse = {
        initialization: appInstallInitializationPlan(install),
        install,
        installs,
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

async function appInstallsResponse(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceAppInstallsApiEnv,
): Promise<AppInstallsResponse> {
  return {
    packages: listBundledAppPackages(),
    installs: await readBackfilledControlPlaneAppInstalls(storage, env, request.url),
  };
}

export async function readBackfilledControlPlaneAppInstalls(
  storage: DurableObjectStorage,
  env: InstanceAppInstallsApiEnv,
  requestUrl: string,
): Promise<AppInstall[]> {
  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      new URL(
        `${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}${INTERNAL_BACKFILL_APP_INSTALLS_PATH}`,
        requestUrl,
      ),
      {
        body: JSON.stringify({ installs: readLegacyInstanceAppInstalls(storage) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    ),
  );

  const body = (await response.json()) as { installs?: AppInstall[]; error?: string };

  if (!response.ok || !Array.isArray(body.installs)) {
    throw new Error(body.error ?? "Control-plane app install backfill failed.");
  }

  return body.installs;
}

async function createControlPlaneAppInstall(
  request: Request,
  env: InstanceAppInstallsApiEnv,
  input: CreateAppInstallRequest,
): Promise<{ body: unknown; response: Response }> {
  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);
  const headers = new Headers(request.headers);

  headers.set("Content-Type", "application/json");

  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(
      new URL(`${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/actions/createAppInstall`, request.url),
      {
        body: JSON.stringify({
          actionId: `legacyAppInstallApi:${input.installId}:${crypto.randomUUID()}`,
          input,
        }),
        headers,
        method: "POST",
      },
    ),
  );

  return {
    body: await response.json(),
    response,
  };
}

function installFailureStatus(code: string | undefined) {
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
