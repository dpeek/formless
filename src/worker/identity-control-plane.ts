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
import type { OwnerIdentity, OwnerIdentityInput } from "../shared/protocol.ts";
import type { SchemaOperationActorKind } from "@dpeek/formless-schema";
import {
  authorizeAuthorityOperation,
  authorizeOwnerManagementRead,
  type AuthorityAdminGuardEnv,
} from "./authority-admin-guard.ts";
import {
  INTERNAL_IDENTITY_OWNER_PATH,
  INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH,
  INTERNAL_IDENTITY_OWNER_RESET_PATH,
} from "./identity-owner-internal.ts";
import {
  executeAuthorityOperation,
  selectAuthorityOperation,
  type AuthorityOperation,
  type AuthorityWriteNotifier,
} from "./authority-operations.ts";
import type { OwnerSession } from "./owner-session.ts";
import { BadRequestError } from "./errors.ts";
import {
  ActiveSchemaRefreshBlockedError,
  ensureStorageTables,
  getBootstrapRecords,
  initializeStorageFromSource,
  resetStorageToSourceSeedOutcome,
  writeRecordSetForCommandOperationOutcome,
  type RecordConstraintValidator,
  type OperationRecordWritePlan,
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

export type IdentityOwnerEnv = {
  FORMLESS_AUTHORITY: DurableObjectNamespace;
};

export type EnsureIdentityOwnerInput = {
  now: string;
  owner: OwnerIdentityInput;
  ownerId?: string;
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
  const identityOwnerResponse = await handleIdentityOwnerInternalRequest(request, storage);

  if (identityOwnerResponse) {
    return identityOwnerResponse;
  }

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
    const resolveOwnerSession = (session: OwnerSession) =>
      Promise.resolve(readActiveIdentityOwnerForPrincipal(storage, session.principalId));
    const authorization =
      operation.metadata.mode === "read"
        ? await authorizeOwnerManagementRead(request, env, { resolveOwnerSession })
        : await authorizeAuthorityOperation(request, operation, env, { resolveOwnerSession });

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

export async function readIdentityOwner(env: IdentityOwnerEnv): Promise<OwnerIdentity | null> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_PATH, {
    method: "GET",
  });
  const body = (await response.json()) as { owner?: OwnerIdentity | null; error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner lookup failed.");
  }

  return body.owner ?? null;
}

export async function ensureIdentityOwner(
  env: IdentityOwnerEnv,
  input: EnsureIdentityOwnerInput,
): Promise<OwnerIdentity> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_PATH, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as { owner?: OwnerIdentity; error?: string };

  if (!response.ok || !body.owner) {
    throw new Error(body.error ?? "Identity owner creation failed.");
  }

  return body.owner;
}

export async function resetIdentityOwner(env: IdentityOwnerEnv): Promise<void> {
  const response = await fetchIdentityOwnerInternal(env, INTERNAL_IDENTITY_OWNER_RESET_PATH, {
    method: "POST",
  });
  const body = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? "Identity owner reset failed.");
  }
}

async function fetchIdentityOwnerInternal(
  env: IdentityOwnerEnv,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const id = env.FORMLESS_AUTHORITY.idFromName(IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY);

  return env.FORMLESS_AUTHORITY.get(id).fetch(new Request(`http://internal${path}`, init));
}

async function handleIdentityOwnerInternalRequest(
  request: Request,
  storage: DurableObjectStorage,
): Promise<Response | undefined> {
  const url = new URL(request.url);

  if (url.pathname === INTERNAL_IDENTITY_OWNER_RESET_PATH) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "POST" });
    }

    ensureIdentityControlPlaneStorage(storage);
    resetStorageToSourceSeedOutcome(storage, identityControlPlaneSource());

    return jsonResponse({ reset: true });
  }

  if (url.pathname === INTERNAL_IDENTITY_OWNER_PRINCIPAL_PATH) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
    }

    const principalId = parseNonEmptyString(
      "Identity owner principal id",
      url.searchParams.get("principalId"),
    );

    return jsonResponse({ owner: readActiveIdentityOwnerForPrincipal(storage, principalId) });
  }

  if (url.pathname !== INTERNAL_IDENTITY_OWNER_PATH) {
    return undefined;
  }

  try {
    if (request.method === "GET") {
      return jsonResponse({ owner: readActiveIdentityOwner(storage) });
    }

    if (request.method === "POST") {
      const input = parseEnsureIdentityOwnerRequest(await readJson(request));
      const result = ensureIdentityOwnerRecords(storage, input);

      return jsonResponse(result);
    }

    return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET, POST" });
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }
}

function ensureIdentityOwnerRecords(
  storage: DurableObjectStorage,
  input: EnsureIdentityOwnerInput,
): { created: boolean; owner: OwnerIdentity } {
  const existingOwner = readActiveIdentityOwner(storage);

  if (existingOwner) {
    return { created: false, owner: existingOwner };
  }

  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const now = parseNonEmptyString("Identity owner createdAt", input.now);
  const ownerInput = normalizeIdentityOwnerInput(input.owner);
  const principalId =
    input.ownerId === undefined
      ? crypto.randomUUID()
      : parseNonEmptyString("Identity owner principal id", input.ownerId);
  const newRecords = identityOwnerRecords({
    now,
    owner: ownerInput,
    principalId,
    records,
  });

  validateIdentityControlPlaneRecords("Identity owner records", [...records, ...newRecords]);

  writeRecordSetForCommandOperationOutcome(
    storage,
    `identity-owner:ensure:${principalId}`,
    newRecords.map(
      (record): OperationRecordWritePlan => ({
        kind: "create",
        entity: record.entity,
        id: record.id,
        values: record.values,
      }),
    ),
    undefined,
    { now },
  );

  const owner = readActiveIdentityOwner(storage);

  if (!owner) {
    throw new Error("Identity owner records did not produce an active owner.");
  }

  return { created: true, owner };
}

function identityOwnerRecords(input: {
  now: string;
  owner: OwnerIdentityInput;
  principalId: string;
  records: readonly StoredRecord[];
}): StoredRecord[] {
  const ownerRole = activeRoleRecord(input.records, "instance.owner");
  const records: StoredRecord[] = [
    {
      id: input.principalId,
      entity: "principal",
      values: {
        displayName: input.owner.name,
        kind: "human",
        status: "active",
      },
      createdAt: input.now,
      updatedAt: input.now,
    },
    {
      id: `role-assignment:${input.principalId}:instance.owner`,
      entity: "role-assignment",
      values: {
        role: ownerRole.id,
        targetKind: "principal",
        targetPrincipal: input.principalId,
        scopeKind: "instance",
        status: "active",
      },
      createdAt: input.now,
      updatedAt: input.now,
    },
  ];

  if (input.owner.email !== undefined) {
    records.splice(1, 0, {
      id: `principal-email:${input.principalId}:primary`,
      entity: "principal-email",
      values: {
        principal: input.principalId,
        displayEmail: input.owner.email,
        normalizedEmail: normalizeIdentityEmail(input.owner.email),
        verificationStatus: "unverified",
        primary: true,
        recovery: true,
      },
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  assertNewIdentityRecordIds(input.records, records);

  return records;
}

function readActiveIdentityOwner(storage: DurableObjectStorage): OwnerIdentity | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const ownerRole = activeRoleRecord(records, "instance.owner");
  const principals = new Map(
    records
      .filter(
        (record) =>
          record.entity === "principal" && !record.deletedAt && record.values.status === "active",
      )
      .map((record) => [record.id, record]),
  );
  const assignment = records
    .filter(
      (record) =>
        record.entity === "role-assignment" &&
        !record.deletedAt &&
        record.values.status === "active" &&
        record.values.role === ownerRole.id &&
        record.values.targetKind === "principal" &&
        record.values.scopeKind === "instance" &&
        typeof record.values.targetPrincipal === "string" &&
        principals.has(record.values.targetPrincipal),
    )
    .sort(compareStoredRecords)[0];

  if (!assignment || typeof assignment.values.targetPrincipal !== "string") {
    return null;
  }

  const principal = principals.get(assignment.values.targetPrincipal);

  if (!principal) {
    return null;
  }

  return identityOwnerFromPrincipal(records, principal);
}

function readActiveIdentityOwnerForPrincipal(
  storage: DurableObjectStorage,
  principalId: string,
): OwnerIdentity | null {
  ensureIdentityControlPlaneStorage(storage);

  const records = getBootstrapRecords(storage);
  const ownerRole = activeRoleRecord(records, "instance.owner");
  const principal = records.find(
    (record) =>
      record.id === principalId &&
      record.entity === "principal" &&
      !record.deletedAt &&
      record.values.status === "active",
  );

  if (!principal) {
    return null;
  }

  const assignment = records.find(
    (record) =>
      record.entity === "role-assignment" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.role === ownerRole.id &&
      record.values.targetKind === "principal" &&
      record.values.scopeKind === "instance" &&
      record.values.targetPrincipal === principal.id,
  );

  if (!assignment) {
    return null;
  }

  return identityOwnerFromPrincipal(records, principal);
}

function identityOwnerFromPrincipal(
  records: readonly StoredRecord[],
  principal: StoredRecord,
): OwnerIdentity {
  const email = primaryPrincipalEmail(records, principal.id);

  return {
    id: principal.id,
    name: parseNonEmptyString(
      "Identity owner principal display name",
      principal.values.displayName,
    ),
    ...(email === undefined ? {} : { email }),
    createdAt: principal.createdAt,
  };
}

function activeRoleRecord(
  records: readonly StoredRecord[],
  roleKey: IdentityControlPlaneRoleKey,
): StoredRecord {
  const role = records.find(
    (record) =>
      record.entity === "role" &&
      !record.deletedAt &&
      record.values.status === "active" &&
      record.values.key === roleKey,
  );

  if (!role) {
    throw new Error(`Identity owner role "${roleKey}" is missing.`);
  }

  return role;
}

function primaryPrincipalEmail(records: readonly StoredRecord[], principalId: string) {
  const record = records
    .filter(
      (candidate) =>
        candidate.entity === "principal-email" &&
        !candidate.deletedAt &&
        candidate.values.principal === principalId &&
        candidate.values.primary === true,
    )
    .sort(compareStoredRecords)[0];

  if (!record) {
    return undefined;
  }

  return parseNonEmptyString("Identity owner principal email", record.values.displayEmail);
}

function compareStoredRecords(left: StoredRecord, right: StoredRecord) {
  const created = left.createdAt.localeCompare(right.createdAt);

  return created === 0 ? left.id.localeCompare(right.id) : created;
}

function assertNewIdentityRecordIds(
  records: readonly StoredRecord[],
  newRecords: readonly StoredRecord[],
) {
  const existingIds = new Set(records.map((record) => record.id));

  for (const record of newRecords) {
    if (existingIds.has(record.id)) {
      throw new Error(`Identity owner record "${record.id}" already exists.`);
    }
  }
}

function parseEnsureIdentityOwnerRequest(value: unknown): EnsureIdentityOwnerInput {
  const object = parseRecord("Identity owner request", value);
  const allowedKeys = new Set(["now", "owner", "ownerId"]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Identity owner request has unsupported key "${key}".`);
    }
  }

  return {
    now: parseNonEmptyString("Identity owner now", object.now),
    owner: normalizeIdentityOwnerInput(object.owner),
    ...(object.ownerId === undefined
      ? {}
      : { ownerId: parseNonEmptyString("Identity owner principal id", object.ownerId) }),
  };
}

function normalizeIdentityOwnerInput(value: unknown): OwnerIdentityInput {
  const object = parseRecord("Identity owner", value);
  const allowedKeys = new Set(["email", "name"]);

  for (const key of Object.keys(object)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Identity owner has unsupported key "${key}".`);
    }
  }

  return {
    name: parseNonEmptyString("Identity owner name", object.name),
    ...(object.email === undefined
      ? {}
      : { email: parseNonEmptyString("Identity owner email", object.email) }),
  };
}

function normalizeIdentityEmail(value: string) {
  return parseNonEmptyString("Identity owner normalized email", value).toLowerCase();
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

function parseRecord(context: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestError(`${context} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(context: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`${context} must be a non-empty string.`);
  }

  return value.trim();
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
