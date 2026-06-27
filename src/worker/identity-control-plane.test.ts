import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX,
  IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH,
  IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
  identityControlPlaneRoleKeys,
  identityControlPlaneSchema,
  identityControlPlaneSchemaProvenance,
  identityControlPlaneSourceSchema,
} from "@dpeek/formless-identity-control-plane";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import type { BootstrapResponse, OwnerIdentity, SchemaResponse } from "../shared/protocol.ts";
import { computeSourceSchemaHash } from "../shared/upgrade-migrations.ts";
import { recordOperationRequest } from "../test/authority-write.ts";
import { ensureTestIdentityOwner } from "../test/identity-owner.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const identityApi = IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-06-09T00:00:00.000Z",
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await resetIdentityStorage();
});

afterAll(async () => {
  await harness.dispose();
});

function createHarness() {
  return createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
    },
  );
}

describe("identity control-plane API routes", () => {
  it("requires owner or admin authorization and bootstraps built-in role records", async () => {
    const anonymous = await harness.fetch(`${identityApi}/bootstrap`);
    const admin = await getJson<BootstrapResponse>(`${identityApi}/bootstrap`);
    const ownerRead = await getOwnerJson<BootstrapResponse>(`${identityApi}/bootstrap`);
    const ownerSchema = await getJson<SchemaResponse>(`${identityApi}/schema`);
    const sourceSchemaHash = await computeSourceSchemaHash(identityControlPlaneSourceSchema);

    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
    expect(await anonymous.json()).toEqual({
      error: "Owner session or admin authorization is required for this read endpoint.",
    });
    expect(IDENTITY_CONTROL_PLANE_SOURCE_SCHEMA_HASH).toBe(sourceSchemaHash);
    expect(admin.body.schema).toEqual(identityControlPlaneSchema);
    expect(admin.body.schemaProvenance).toEqual(identityControlPlaneSchemaProvenance);
    expect(admin.body.records).toEqual(builtInRoleRecords());
    expect(admin.body.cursor).toBe(identityControlPlaneRoleKeys.length);
    expect(admin.response.headers.get(FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER)).toBe(
      identityControlPlaneSchemaProvenance.sourceSchemaHash,
    );
    expect(ownerRead.body.records).toEqual(expect.arrayContaining(admin.body.records));
    expect(ownerRead.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "principal",
          values: expect.objectContaining({
            displayName: owner.name,
            status: "active",
          }),
        }),
        expect.objectContaining({
          entity: "role-assignment",
          values: expect.objectContaining({
            role: "role:instance.owner",
            status: "active",
          }),
        }),
      ]),
    );
    expect(ownerSchema.body.schema).toEqual(identityControlPlaneSchema);
    expect(ownerSchema.body.schemaProvenance).toEqual(identityControlPlaneSchemaProvenance);
    expect(ownerSchema.response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("exports identity control-plane storage snapshots with the identity storage boundary", async () => {
    const bootstrap = await getJson<BootstrapResponse>(`${identityApi}/bootstrap`);
    const snapshot = await getJson<StorageSnapshot>(`${identityApi}/snapshot`);

    expect(snapshot.body).toMatchObject({
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
      schemaKey: "identity-control-plane",
      exportedAt: expect.any(String),
      schemaUpdatedAt: bootstrap.body.schemaUpdatedAt,
      sourceCursor: bootstrap.body.cursor,
      schema: identityControlPlaneSchema,
    });
    expect(snapshot.body.records).toEqual(bootstrap.body.records);
  });

  it("rejects duplicate selected-target role assignments through runtime writes", async () => {
    const principal = await postRecordOperation({
      entity: "principal",
      idempotencyKey: "create-principal-ada",
      operationName: "create",
      input: {
        displayName: "Ada Owner",
        kind: "human",
        status: "active",
      },
    });
    const input = {
      role: "role:instance.owner",
      targetKind: "principal",
      targetPrincipal: principal.id,
      scopeKind: "instance",
      status: "active",
    };
    const first = await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "assign-ada-owner",
      operationName: "create",
      input,
    });
    const duplicate = await postRecordOperationResponse({
      entity: "role-assignment",
      idempotencyKey: "assign-ada-owner-duplicate",
      operationName: "create",
      input,
    });

    expect(first.values).toEqual(input);
    expect(duplicate.response.status).toBe(400);
    expect(duplicate.body).toEqual({
      error: expect.stringContaining(
        'violates identity uniqueness "auth:role-assignment.uniqueActiveAssignment"',
      ),
    });
  });

  it("rejects owner sessions without current active owner authority", async () => {
    const missingPrincipal = await ownerReadResponse("missing-principal");
    const principalOnly = await createIdentityPrincipal("Principal Only");
    const missingRole = await ownerReadResponse(principalOnly.id);
    const disabledPrincipal = await createIdentityOwnerAuthority("Disabled Principal");
    const disabledAssignment = await createIdentityOwnerAuthority("Disabled Role");

    await postRecordOperation({
      entity: "principal",
      idempotencyKey: "disable-owner-principal",
      operationName: "update",
      recordId: disabledPrincipal.principal.id,
      input: { status: "disabled" },
    });
    await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "disable-owner-role",
      operationName: "update",
      recordId: disabledAssignment.assignment.id,
      input: { status: "disabled" },
    });

    const disabledPrincipalRead = await ownerReadResponse(disabledPrincipal.principal.id);
    const disabledAssignmentRead = await ownerReadResponse(disabledAssignment.principal.id);

    for (const response of [
      missingPrincipal,
      missingRole,
      disabledPrincipalRead,
      disabledAssignmentRead,
    ]) {
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe('Bearer realm="formless-admin"');
      expect(await response.json()).toEqual({
        error: "Owner session or admin authorization is required for this read endpoint.",
      });
    }
  });
});

async function resetIdentityStorage() {
  const response = await harness.fetch(`${identityApi}/reset/seed`, {
    body: "{}",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path, { headers: adminHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function getOwnerJson<T>(path: string) {
  const response = await harness.fetch(path, { headers: await ownerSessionHeaders() });

  expect(response.status).toBe(200);

  return {
    body: (await response.json()) as T,
    response,
  };
}

async function postRecordOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const result = await postRecordOperationResponse(input);

  expect(result.response.status).toBe(200);

  return (result.body as { record: StoredRecord }).record;
}

async function createIdentityPrincipal(displayName: string) {
  return await postRecordOperation({
    entity: "principal",
    idempotencyKey: `create-${displayName.toLowerCase().replace(/\s+/g, "-")}`,
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function createIdentityOwnerAuthority(displayName: string) {
  const principal = await createIdentityPrincipal(displayName);
  const assignment = await postRecordOperation({
    entity: "role-assignment",
    idempotencyKey: `assign-${displayName.toLowerCase().replace(/\s+/g, "-")}-owner`,
    operationName: "create",
    input: {
      role: "role:instance.owner",
      targetKind: "principal",
      targetPrincipal: principal.id,
      scopeKind: "instance",
      status: "active",
    },
  });

  return { assignment, principal };
}

async function ownerReadResponse(principalId: string) {
  return await harness.fetch(`${identityApi}/bootstrap`, {
    headers: { Cookie: await ownerCookieForPrincipal(principalId) },
  });
}

async function ownerCookieForPrincipal(principalId: string) {
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: {
      id: principalId,
      name: "Session Principal",
      createdAt: "2999-01-01T00:00:00.000Z",
    },
    request: new Request("http://example.com/"),
  });

  return cookiePair(created.cookie);
}

async function postRecordOperationResponse(input: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(`${identityApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = await response.json();

  return {
    body: response.ok ? request.response(body) : body,
    response,
  };
}

function builtInRoleRecords(): StoredRecord[] {
  return identityControlPlaneRoleKeys.map((roleKey) => ({
    id: `role:${roleKey}`,
    entity: "role",
    values: {
      key: roleKey,
      displayLabel: roleKey,
      status: "active",
    },
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  }));
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

async function ownerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(harness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/"),
  });

  return {
    Cookie: cookiePair(created.cookie),
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}
