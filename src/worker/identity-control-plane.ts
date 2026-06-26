import { parseIdentityControlPlaneApiRoute } from "../shared/app-storage-identity.ts";
import {
  IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  identityControlPlaneRoleKeys,
  identityControlPlaneSchemaProvenance,
  identityControlPlaneSchema,
  parseIdentityControlPlaneStorageSnapshot,
  validateIdentityControlPlaneRecords,
  type IdentityControlPlaneRoleKey,
} from "@dpeek/formless-identity-control-plane";
import type { RecordValues, StoredRecord } from "@dpeek/formless-storage";
import type { SchemaOperationActorKind } from "@dpeek/formless-schema";
import {
  authorizeAuthorityOperation,
  authorizeOwnerManagementRead,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import { BadRequestError } from "./errors.ts";
import {
  ActiveSchemaRefreshBlockedError,
  ensureStorageTables,
  getBootstrapRecords,
  initializeStorageFromSource,
  type RecordConstraintValidator,
  type StorageSource,
} from "./storage.ts";
import type { WorkerSchemaAppDefinition } from "./schema-apps.ts";

const actorKinds = ["admin", "owner"] as const;
const builtInRoleCreatedAt = "2026-06-26T00:00:00.000Z";
const identityControlPlaneApp = {
  key: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
  label: "Identity control plane",
  route: "/identity-control-plane",
  seedChangeWritePrefix: "seed-identity-control-plane",
  sourceSchema: identityControlPlaneSchema,
  seedRecords: builtInRoleRecords(),
} satisfies WorkerSchemaAppDefinition;

function identityControlPlaneSource(): StorageSource {
  return {
    schema: identityControlPlaneSchema,
    records: builtInRoleRecords(),
    changeWritePrefix: "seed-identity-control-plane",
    schemaKey: IDENTITY_CONTROL_PLANE_SCHEMA_KEY,
    schemaProvenance: identityControlPlaneSchemaProvenance,
    storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  };
}

function ensureIdentityControlPlaneStorage(storage: DurableObjectStorage) {
  ensureStorageTables(storage);
  initializeStorageFromSource(storage, identityControlPlaneSource());
}

type IdentityControlPlaneApiEnv = AuthorityAdminGuardEnv & {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export async function handleIdentityControlPlaneApiRequest(
  request: Request,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const route = parseIdentityControlPlaneApiRoute(new URL(request.url).pathname);

  if (!route) {
    return undefined;
  }

  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(request);
}

export async function handleIdentityControlPlaneDurableObjectRequest(
  request: Request,
  storage: DurableObjectStorage,
  env: IdentityControlPlaneApiEnv,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  const route = parseIdentityControlPlaneApiRoute(url.pathname);

  if (!route) {
    return undefined;
  }

  try {
    const operation = selectAuthorityOperation({
      method: request.method,
      path: route.path,
      searchParams: url.searchParams,
    });

    if (!operation) {
      return jsonResponse({ error: "Not found." }, 404);
    }

    const actorKind = identityControlPlaneActorKindFromRequest(request, url);
    const authorization =
      operation.metadata.mode === "read"
        ? await authorizeOwnerManagementRead(request, env)
        : await authorizeAuthorityOperation(request, operation, env);

    if (!authorization.authorized) {
      return jsonResponse(
        { error: authorization.error },
        authorization.status,
        authorization.headers,
      );
    }

    if (operation.metadata.mode === "write") {
      assertIdentityControlPlaneWriteActor(actorKind, operation);
    }

    const body = operation.metadata.mode === "write" ? await readJson(request) : undefined;

    if (operation.kind === "restoreSnapshot") {
      parseIdentityControlPlaneStorageSnapshot("Identity control-plane storage snapshot", body);
    }

    ensureIdentityControlPlaneStorage(storage);

    const result = executeAuthorityOperation({
      actorKind,
      app: identityControlPlaneApp,
      body,
      identity: route.identity,
      operation,
      source: identityControlPlaneSource(),
      storage,
      validateConstraints:
        operation.metadata.mode === "write"
          ? validateIdentityControlPlaneRecordConstraint(storage)
          : undefined,
      writes: noopWriteNotifier,
    });

    return jsonResponse(result.body, result.status, result.headers);
  } catch (error) {
    if (error instanceof ActiveSchemaRefreshBlockedError) {
      return jsonResponse({ error: error.message, blocker: error.blocker }, 409);
    }

    if (error instanceof BadRequestError) {
      return jsonResponse({ error: error.message }, 400);
    }

    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function validateIdentityControlPlaneRecordConstraint(
  storage: DurableObjectStorage,
): RecordConstraintValidator {
  return (entityName, values, options) => {
    const records = getBootstrapRecords(storage);
    const candidateRecord = candidateIdentityRecord(records, entityName, values, options);
    const candidateRecords = options?.ignoreRecordId
      ? records.map((record) => (record.id === options.ignoreRecordId ? candidateRecord : record))
      : [...records, candidateRecord];

    validateIdentityControlPlaneRecords("Identity control-plane records", candidateRecords);
  };
}

function candidateIdentityRecord(
  records: readonly StoredRecord[],
  entity: string,
  values: RecordValues,
  options: { ignoreRecordId?: string } | undefined,
): StoredRecord {
  const existing = options?.ignoreRecordId
    ? records.find((record) => record.id === options.ignoreRecordId)
    : undefined;

  if (existing) {
    return {
      ...existing,
      values,
      updatedAt: builtInRoleCreatedAt,
    };
  }

  return {
    id: pendingRecordId(records, entity),
    entity,
    values,
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  };
}

function pendingRecordId(records: readonly StoredRecord[], entity: string) {
  const existingIds = new Set(records.map((record) => record.id));
  let id = `pending:${entity}`;

  while (existingIds.has(id)) {
    id = `${id}:next`;
  }

  return id;
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) => builtInRoleRecord(roleKey));
}

function builtInRoleRecord(roleKey: IdentityControlPlaneRoleKey): StoredRecord {
  return {
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: builtInRoleCreatedAt,
    updatedAt: builtInRoleCreatedAt,
  };
}

function identityControlPlaneActorKindFromRequest(
  request: Request,
  url: URL,
): SchemaOperationActorKind {
  const value =
    request.headers.get("X-Formless-Identity-Control-Plane-Actor") ??
    request.headers.get("X-Formless-Actor-Kind") ??
    url.searchParams.get("actorKind") ??
    "owner";

  if (actorKinds.includes(value as (typeof actorKinds)[number])) {
    return value as SchemaOperationActorKind;
  }

  throw new BadRequestError(`Unsupported identity control-plane actor "${value}".`);
}

function assertIdentityControlPlaneWriteActor(
  actorKind: SchemaOperationActorKind,
  operation: AuthorityOperation,
) {
  if (actorKind === "owner" || actorKind === "admin") {
    return;
  }

  throw new BadRequestError(
    `Identity control-plane ${operation.kind} writes are not exposed to actor "${actorKind}".`,
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
