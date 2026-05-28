import {
  installedAppStorageIdentity,
  parseInstanceControlPlaneApiRoute,
} from "../shared/app-storage-identity.ts";
import {
  appInstallRegistryError,
  createAppInstall,
  findBundledAppPackage,
  listAppInstalls,
  type AppInstall,
} from "../shared/app-installs.ts";
import { nowIsoString } from "../shared/clock.ts";
import {
  INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX,
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneRecordsForAppInstall,
  instanceControlPlaneSchema,
} from "../shared/instance-control-plane.ts";
import {
  parseCreateAppInstallRequest,
  type ActionResponse,
  type CreateAppInstallRequest,
  type RecordValues,
} from "../shared/protocol.ts";
import { parseAppSchema, type SchemaActionActorKind } from "../shared/schema.ts";
import {
  authorizeAuthorityOperation,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import { validateRecordValues } from "./authority-validation.ts";
import { assertUniqueConstraints } from "./constraints.ts";
import { BadRequestError } from "./errors.ts";
import { findWorkerSchemaAppDefinition, type WorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  createRecordSetForActionOutcome,
  ensureStorageTables,
  getActionResponseById,
  getBootstrapRecords,
  initializeStorageFromSource,
  type StorageSource,
} from "./storage.ts";

const actorKinds = ["admin", "cliDeployer", "owner", "runner"] as const;
const createAppInstallControlPlaneAction = "createAppInstall";
const instanceControlPlaneSourceSchema = parseAppSchema(instanceControlPlaneSchema);
const instanceControlPlaneSource: StorageSource = {
  schema: instanceControlPlaneSourceSchema,
  records: [],
  changeMutationPrefix: "seed-instance-control-plane",
};
const instanceControlPlaneApp = {
  key: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  label: "Instance control plane",
  route: "/instance-control-plane",
  schemaRoute: "/instance-control-plane/schema",
  seedChangeMutationPrefix: "seed-instance-control-plane",
  sourceSchema: instanceControlPlaneSourceSchema,
  seedRecords: [],
} satisfies WorkerSchemaAppDefinition;

type InstanceControlPlaneApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

type ParsedCreateAppInstallActionRequest = {
  actionId: string;
  input: CreateAppInstallRequest;
};

export async function handleInstanceControlPlaneApiRequest(
  request: Request,
  env: InstanceControlPlaneApiEnv,
): Promise<Response | undefined> {
  if (!parseInstanceControlPlaneApiRoute(new URL(request.url).pathname)) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleInstanceControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const route = parseInstanceControlPlaneApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  try {
    if (route.path === `/${createAppInstallControlPlaneAction}`) {
      return redirectControlPlaneActionRoute(request, createAppInstallControlPlaneAction);
    }

    if (route.path === `/actions/${createAppInstallControlPlaneAction}`) {
      return await handleCreateAppInstallAction(request, storage, env);
    }

    const operation = selectAuthorityOperation({
      method: request.method,
      path: route.path,
      searchParams: url.searchParams,
    });

    if (!operation) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const actorKind = controlPlaneActorKindFromRequest(request, url);
    const authorization = await authorizeAuthorityOperation(request, operation, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    if (operation.metadata.mode === "write" && operation.kind !== "action") {
      assertBrowserControlPlaneWriteActor(actorKind, operation);
    }

    const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;
    ensureStorageTables(storage);
    const result = executeAuthorityOperation({
      actorKind,
      app: instanceControlPlaneApp,
      body,
      identity: route.identity,
      operation,
      source: instanceControlPlaneSource,
      storage,
      writes: noopWriteNotifier,
    });

    return jsonResponse(result.body, result.status, result.headers);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

export function readControlPlaneAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  return listAppInstalls(
    getBootstrapRecords(storage)
      .filter((record) => record.entity === "appInstall" && !record.deletedAt)
      .map((record) => appInstallFromControlPlaneValues(record.values)),
  );
}

async function handleCreateAppInstallAction(
  request: Request,
  storage: DurableObjectStorage,
  env: InstanceControlPlaneApiEnv,
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const actorKind = controlPlaneActorKindFromRequest(request, new URL(request.url));
  assertBrowserControlPlaneActionActor(actorKind, createAppInstallControlPlaneAction);

  const authorization = await authorizeAuthorityOperation(
    request,
    {
      kind: "action",
      metadata: {
        kind: "action",
        method: request.method,
        mode: "write",
        path: `/actions/${createAppInstallControlPlaneAction}`,
      },
    },
    env,
  );

  if (!authorization.authorized) {
    return jsonResponse(
      { error: authorization.error },
      authorization.status,
      authorization.headers,
    );
  }

  ensureStorageTables(storage);
  initializeStorageFromSource(storage, instanceControlPlaneSource);

  const parsed = parseCreateAppInstallActionRequest(await readJson(request));
  const replay = getActionResponseById(storage, parsed.actionId);

  if (replay) {
    return jsonResponse(replay);
  }

  const now = nowIsoString();
  const result = createAppInstall({
    existingInstalls: readControlPlaneAppInstalls(storage),
    installId: parsed.input.installId,
    label: parsed.input.label,
    now,
    packageAppKey: parsed.input.packageAppKey,
    validateInitialSource: ({ initialization }) => {
      const source = findWorkerSchemaAppDefinition(initialization.sourceSchemaKey);
      const seed = findWorkerSchemaAppDefinition(initialization.seedRecordsKey);

      if (!source || !seed) {
        return appInstallRegistryError(
          "source-validation-failed",
          "source",
          `Package app "${initialization.packageAppKey}" source is unavailable.`,
        );
      }

      return undefined;
    },
  });

  if (!result.ok) {
    return jsonResponse(
      {
        error: result.error.message,
        code: result.error.code,
        ...(result.error.field === undefined ? {} : { field: result.error.field }),
        installs: result.installs,
      },
      result.error.code === "duplicate-install-id" ? 409 : 400,
    );
  }

  await initializeInstalledAppStorageForInstall(result.install, env, request.url);

  const records = instanceControlPlaneRecordsForAppInstall({ install: result.install, now });
  const outcome = noopWriteNotifier.apply(() =>
    createRecordSetForActionOutcome(
      storage,
      parsed.actionId,
      "appInstall",
      createAppInstallControlPlaneAction,
      records.map((record) => ({
        entity: record.entity,
        id: record.id,
        values: record.values,
      })),
      validateControlPlaneRecordWrite(storage, instanceControlPlaneSource.schema),
    ),
  );

  return jsonResponse(outcome.response satisfies ActionResponse, 201);
}

async function initializeInstalledAppStorageForInstall(
  install: AppInstall,
  env: InstanceControlPlaneApiEnv,
  requestUrl: string,
) {
  const identity = installedAppStorageIdentity({
    installId: install.installId,
    packageAppKey: install.packageAppKey,
  });

  if (!identity) {
    throw new BadRequestError(`Install "${install.installId}" does not resolve to app storage.`);
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(identity.authorityName);
  const response = await env.FORMLESS_AUTHORITY.get(id).fetch(
    new Request(new URL(`${identity.apiRoutePrefix}/bootstrap`, requestUrl), {
      headers: { Accept: "application/json" },
      method: "GET",
    }),
  );

  if (!response.ok) {
    throw new BadRequestError(`Install "${install.installId}" storage could not be initialized.`);
  }
}

function validateControlPlaneRecordWrite(
  storage: DurableObjectStorage,
  schema: typeof instanceControlPlaneSource.schema,
) {
  return (entityName: string, values: RecordValues, options?: { ignoreRecordId?: string }) => {
    const entity = schema.entities[entityName];

    if (!entity) {
      throw new BadRequestError(`Unknown entity "${entityName}".`);
    }

    const validated = validateRecordValues(values, entity, storage, {
      entityName,
      schema,
      existingRecordId: options?.ignoreRecordId,
    });

    assertUniqueConstraints(storage, schema, entityName, validated, options);
  };
}

function parseCreateAppInstallActionRequest(value: unknown): ParsedCreateAppInstallActionRequest {
  if (!isRecord(value)) {
    throw new BadRequestError("Control-plane action request must be an object.");
  }

  const inputValue = isRecord(value.input) ? value.input : value;
  const input = parseCreateAppInstallRequest(inputValue);
  const actionId =
    parseOptionalActionIdentity(value.actionId) ??
    parseOptionalActionIdentity(value.idempotencyKey) ??
    `createAppInstall:${input.installId}`;

  return { actionId, input };
}

function parseOptionalActionIdentity(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError("Control-plane action id must be a non-empty string.");
  }

  return value.trim();
}

function appInstallFromControlPlaneValues(values: RecordValues): AppInstall {
  const packageAppKey = String(values.packageAppKey);
  const packageApp = findBundledAppPackage(packageAppKey);

  if (!packageApp) {
    throw new Error(`Stored app install "${String(values.installId)}" has unsupported package.`);
  }

  const installId = String(values.installId);

  return {
    installId,
    packageAppKey: packageApp.packageAppKey,
    label: String(values.label),
    status: "installed",
    createdAt: String(values.createdAt),
    updatedAt: String(values.updatedAt),
    adminRoute: `${packageApp.adminRouteBase}/${installId}`,
    schemaRoute: `${packageApp.adminRouteBase}/${installId}/schema`,
    ...(packageApp.publicRouteBase === undefined
      ? {}
      : {
          publicRoute: `${packageApp.publicRouteBase}/${installId}`,
          publicRoutePrefix: `${packageApp.publicRouteBase}/${installId}/`,
        }),
  };
}

function controlPlaneActorKindFromRequest(request: Request, url: URL): SchemaActionActorKind {
  const value =
    request.headers.get("X-Formless-Control-Plane-Actor") ??
    request.headers.get("X-Formless-Actor-Kind") ??
    url.searchParams.get("actorKind") ??
    "owner";

  if (actorKinds.includes(value as SchemaActionActorKind)) {
    return value as SchemaActionActorKind;
  }

  throw new BadRequestError(`Unsupported control-plane actor "${value}".`);
}

function assertBrowserControlPlaneWriteActor(
  actorKind: SchemaActionActorKind,
  operation: AuthorityOperation,
) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(
    `Control-plane ${operation.kind} writes are not exposed to actor "${actorKind}".`,
  );
}

function assertBrowserControlPlaneActionActor(actorKind: SchemaActionActorKind, action: string) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(`Action "${action}" is not exposed to actor "${actorKind}".`);
}

function redirectControlPlaneActionRoute(request: Request, action: string) {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  return Response.redirect(
    new URL(`${INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX}/actions/${action}`, request.url),
    308,
  );
}

const noopWriteNotifier: AuthorityWriteNotifier = {
  apply(write) {
    return write();
  },
};

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequestError("Request body must be valid JSON.");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
