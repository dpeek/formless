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
import { INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-instance-control-plane";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import type { EmailDeliveryRecord } from "../shared/email-runtime.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import { FORMLESS_CLIENT_SOURCE_SCHEMA_HASH_HEADER } from "../shared/protocol.ts";
import type { BootstrapResponse, OwnerIdentity, SchemaResponse } from "../shared/protocol.ts";
import { computeSourceSchemaHash } from "../shared/upgrade-migrations.ts";
import { recordOperationRequest } from "../test/authority-write.ts";
import { ensureTestIdentityOwner } from "../test/identity-owner.ts";
import {
  INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH,
  type ActiveIdentityAuthority,
} from "./identity-owner-internal.ts";
import { createWorkerHarness } from "./miniflare-test.ts";
import { createOwnerSessionCookie } from "./owner-session.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const identityApi = IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;
const controlPlaneApi = INSTANCE_CONTROL_PLANE_API_ROUTE_PREFIX;
const owner: OwnerIdentity = {
  id: "owner-1",
  name: "Ada Owner",
  email: "ada@example.com",
  createdAt: "2026-06-09T00:00:00.000Z",
};

type CollaboratorInvitationTestResponse = {
  delivery?:
    | {
        delivery: EmailDeliveryRecord;
        queued: boolean;
        replayed: boolean;
        status: "scheduled";
      }
    | {
        reason: string;
        status: "skipped";
      };
  error?: string;
  invitation: StoredRecord;
  records: StoredRecord[];
  status: "committed" | "replayed";
};

let harness: Harness;

beforeAll(async () => {
  harness = await createHarness();
});

beforeEach(async () => {
  await resetKnownState();
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
      queueProducers: {
        FORMLESS_EMAIL_DELIVERY_QUEUE: "formless-email-delivery",
      },
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

  it("creates owner-authorized collaborator invitation record sets and replays by idempotency", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const ownerHeaders = ownerSession.headers;
    const organization = await postRecordOperation({
      entity: "organization",
      idempotencyKey: "create-organization-acme",
      operationName: "create",
      input: {
        displayName: "Acme",
        status: "active",
      },
    });

    const input = {
      idempotencyKey: "invite-ada-collaborator",
      invitationId: "invitation:ada",
      targetEmail: "Ada.Collab@Example.COM",
      targetSurface: "organization",
      targetOrganization: organization.id,
      expiresAt: "2999-02-01T00:00:00.000Z",
      now: "2999-01-01T00:00:00.000Z",
      invitedPrincipal: {
        id: "principal:ada",
        displayName: "Ada Collaborator",
      },
      principalEmail: {
        id: "principal-email:ada",
        primary: true,
        recovery: false,
      },
      memberships: [
        {
          id: "membership:ada-acme",
          targetKind: "organization",
          targetOrganization: organization.id,
        },
      ],
      roleAssignments: [
        {
          id: "role-assignment:ada-app-editor",
          roleKey: "app.editor",
          scopeKind: "app-install",
          appInstallId: "site",
        },
      ],
      appRegistrations: [
        {
          id: "app-registration:site-ada",
          appInstallId: "site",
          selectedOrganization: organization.id,
        },
      ],
    };
    const created = await postCollaboratorInvitationResponse(input, ownerHeaders);
    const replay = await postCollaboratorInvitationResponse(
      {
        ...input,
        targetEmail: "changed@example.com",
      },
      ownerHeaders,
    );

    expect(created.response.status).toBe(200);
    expect(created.body.status).toBe("committed");
    expect(created.body.records.map((record) => record.entity)).toEqual([
      "principal",
      "principal-email",
      "membership",
      "role-assignment",
      "app-registration",
      "invitation",
    ]);
    expect(created.body.invitation).toMatchObject({
      id: "invitation:ada",
      entity: "invitation",
      values: {
        targetEmail: "Ada.Collab@example.com",
        targetSurface: "organization",
        targetOrganization: organization.id,
        invitedPrincipal: "principal:ada",
        inviterPrincipal: ownerSession.owner.id,
        status: "pending",
        expiresAt: "2999-02-01T00:00:00.000Z",
      },
      createdAt: "2999-01-01T00:00:00.000Z",
      updatedAt: "2999-01-01T00:00:00.000Z",
    });
    expect(recordById(created.body.records, "principal:ada")).toMatchObject({
      entity: "principal",
      values: {
        displayName: "Ada Collaborator",
        kind: "human",
        status: "invited",
      },
    });
    expect(recordById(created.body.records, "principal-email:ada")).toMatchObject({
      entity: "principal-email",
      values: {
        principal: "principal:ada",
        displayEmail: "Ada.Collab@example.com",
        normalizedEmail: "ada.collab@example.com",
        verificationStatus: "unverified",
        primary: true,
        recovery: false,
      },
    });
    expect(recordById(created.body.records, "membership:ada-acme")).toMatchObject({
      entity: "membership",
      values: {
        principal: "principal:ada",
        targetKind: "organization",
        targetOrganization: organization.id,
        status: "invited",
      },
    });
    expect(recordById(created.body.records, "role-assignment:ada-app-editor")).toMatchObject({
      entity: "role-assignment",
      values: {
        role: "role:app.editor",
        targetKind: "principal",
        targetPrincipal: "principal:ada",
        scopeKind: "app-install",
        appInstallId: "site",
        status: "active",
      },
    });
    expect(recordById(created.body.records, "app-registration:site-ada")).toMatchObject({
      entity: "app-registration",
      values: {
        appInstallId: "site",
        targetKind: "principal",
        targetPrincipal: "principal:ada",
        selectedOrganization: organization.id,
        status: "pending",
      },
    });
    expect(JSON.stringify(created.body)).not.toContain("token");
    expect(replay.response.status).toBe(200);
    expect(replay.body.status).toBe("replayed");
    expect(replay.body.invitation).toEqual(created.body.invitation);
  });

  it("schedules collaborator invitation auth email delivery idempotently without issuing sessions", async () => {
    const { authSender } = await configureAuthInvitationEmailDelivery();
    const ownerSession = await createOwnerSessionHeaders();
    const input = {
      idempotencyKey: "invite-delivery-ada",
      invitationId: "invitation:delivery-ada",
      targetEmail: "Ada.Delivery@Example.COM",
      targetSurface: "instance",
      expiresAt: "2999-02-01T00:00:00.000Z",
      now: "2999-01-01T00:00:00.000Z",
    };
    const created = await postCollaboratorInvitationResponse(input, ownerSession.headers);
    const replay = await postCollaboratorInvitationResponse(input, ownerSession.headers);

    expect(created.response.status).toBe(200);
    expect(created.response.headers.get("Set-Cookie")).toBeNull();
    expect(created.body.delivery).toMatchObject({
      status: "scheduled",
      queued: true,
      replayed: false,
      delivery: {
        canonicalOrigin: "https://auth.example.com",
        idempotencyKey: "invitation:delivery-ada:collaborator-invitation-delivery",
        messageKind: "identity.collaboratorInvitation",
        recipients: [{ address: "Ada.Delivery@example.com" }],
        sender: {
          address: "auth@mail.example.com",
          displayName: "Example Auth",
          id: authSender.id,
        },
        sourceRecordId: "invitation:delivery-ada",
        sourceStorageIdentity: IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
        status: "pending",
      },
    });
    expect(replay.response.status).toBe(200);
    expect(replay.response.headers.get("Set-Cookie")).toBeNull();
    expect(replay.body.delivery).toMatchObject({
      status: "scheduled",
      queued: false,
      replayed: true,
      delivery: {
        id:
          created.body.delivery?.status === "scheduled"
            ? created.body.delivery.delivery.id
            : undefined,
      },
    });
    expect(JSON.stringify([created.body, replay.body])).not.toContain("token");
    expect(JSON.stringify([created.body, replay.body])).not.toContain("session");
  });

  it("commits invitations but skips delivery when auth email configuration is missing", async () => {
    const ownerSession = await createOwnerSessionHeaders();
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-missing-auth-email",
        invitationId: "invitation:missing-auth-email",
        targetEmail: "missing-auth-email@example.com",
        targetSurface: "instance",
        expiresAt: "2999-02-01T00:00:00.000Z",
        now: "2999-01-01T00:00:00.000Z",
      },
      ownerSession.headers,
    );

    expect(created.response.status).toBe(200);
    expect(created.response.headers.get("Set-Cookie")).toBeNull();
    expect(created.body.status).toBe("committed");
    expect(created.body.invitation).toMatchObject({
      id: "invitation:missing-auth-email",
      entity: "invitation",
      values: {
        status: "pending",
        targetEmail: "missing-auth-email@example.com",
      },
    });
    expect(created.body.delivery).toEqual({
      reason: "missing-auth-email-configuration",
      status: "skipped",
    });
    expect(JSON.stringify(created.body)).not.toContain("token");
    expect(JSON.stringify(created.body)).not.toContain("session");
  });

  it("creates admin-authorized collaborator invitations without browser inviter facts", async () => {
    const created = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invite-admin-created",
        invitationId: "invitation:admin-created",
        targetEmail: "admin-created@example.com",
        targetSurface: "instance",
        expiresAt: "2999-02-01T00:00:00.000Z",
        now: "2999-01-01T00:00:00.000Z",
      },
      adminHeaders(),
    );

    expect(created.response.status).toBe(200);
    expect(created.body.invitation).toMatchObject({
      id: "invitation:admin-created",
      entity: "invitation",
      values: {
        targetEmail: "admin-created@example.com",
        targetSurface: "instance",
        status: "pending",
        expiresAt: "2999-02-01T00:00:00.000Z",
      },
    });
    expect(created.body.invitation.values).not.toHaveProperty("inviterPrincipal");
  });

  it("rejects invalid collaborator invitation targets without partial identity commits", async () => {
    const anonymous = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "anonymous-invite",
        targetEmail: "anonymous@example.com",
        targetSurface: "instance",
        expiresAt: "2999-02-01T00:00:00.000Z",
        now: "2999-01-01T00:00:00.000Z",
      },
      {},
    );
    const rejected = await postCollaboratorInvitationResponse(
      {
        idempotencyKey: "invalid-target-invite",
        targetEmail: "invalid@example.com",
        targetSurface: "instance",
        targetAppInstallId: "site",
        expiresAt: "2999-02-01T00:00:00.000Z",
        now: "2999-01-01T00:00:00.000Z",
      },
      adminHeaders(),
    );
    const bootstrap = await getJson<BootstrapResponse>(`${identityApi}/bootstrap`);

    expect(anonymous.response.status).toBe(401);
    expect(anonymous.body).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toEqual({
      error: "Collaborator invitation instance target cannot include target ids.",
    });
    expect(bootstrap.body.records.some((record) => record.entity === "invitation")).toBe(false);
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

  it("resolves current owner and instance-admin authority from identity records", async () => {
    const ownerAuthority = await createIdentityOwnerAuthority("Lookup Owner");
    const adminPrincipal = await createIdentityPrincipal("Lookup Admin");
    await assignIdentityInstanceRole(adminPrincipal.id, "instance.admin");
    const ordinaryPrincipal = await createIdentityPrincipal("Lookup Ordinary");
    const disabledAuthority = await createIdentityOwnerAuthority("Lookup Disabled");
    const removedAdminPrincipal = await createIdentityPrincipal("Lookup Removed Admin");
    const removedAdminAssignment = await assignIdentityInstanceRole(
      removedAdminPrincipal.id,
      "instance.admin",
    );

    await postRecordOperation({
      entity: "principal",
      idempotencyKey: "disable-lookup-principal",
      operationName: "update",
      recordId: disabledAuthority.principal.id,
      input: { status: "disabled" },
    });
    await postRecordOperation({
      entity: "role-assignment",
      idempotencyKey: "delete-lookup-admin-role",
      operationName: "delete",
      recordId: removedAdminAssignment.id,
    });

    expect(await readPrincipalAuthority(ownerAuthority.principal.id)).toEqual({
      id: ownerAuthority.principal.id,
      instanceAdmin: false,
      instanceOwner: true,
    });
    expect(await readPrincipalAuthority(adminPrincipal.id)).toEqual({
      id: adminPrincipal.id,
      instanceAdmin: true,
      instanceOwner: false,
    });
    expect(await readPrincipalAuthority(ordinaryPrincipal.id)).toEqual({
      id: ordinaryPrincipal.id,
      instanceAdmin: false,
      instanceOwner: false,
    });
    expect(await readPrincipalAuthority(disabledAuthority.principal.id)).toBeNull();
    expect(await readPrincipalAuthority(removedAdminPrincipal.id)).toEqual({
      id: removedAdminPrincipal.id,
      instanceAdmin: false,
      instanceOwner: false,
    });
  });
});

async function resetKnownState() {
  await Promise.all([resetIdentityStorage(), postReset(`${controlPlaneApi}/reset/seed`)]);
}

async function resetIdentityStorage() {
  const response = await harness.fetch(`${identityApi}/reset/seed`, {
    body: "{}",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function postReset(path: string) {
  const response = await harness.fetch(path, {
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

async function configureAuthInvitationEmailDelivery() {
  const emailDomain = await postControlPlaneOperation("email-domain", "auth-invite-domain", {
    enabled: true,
    providerFamily: "cloudflare",
    domain: "mail.example.com",
  });
  const authSender = operationRecord(
    await postControlPlaneOperation("email-sender", "auth-invite-sender", {
      enabled: true,
      address: "auth@mail.example.com",
      displayName: "Example Auth",
      purpose: "auth",
      emailDomain: operationRecord(emailDomain).id,
    }),
  );
  await postControlPlaneOperation("instance-settings", "auth-invite-settings", {
    settingsId: "instance",
    canonicalOrigin: "https://www.example.com",
    authOrigin: "https://auth.example.com",
    defaultEmailDomain: operationRecord(emailDomain).id,
    defaultAuthSender: authSender.id,
    productionIdentityStatus: "configured",
  });

  return { authSender };
}

async function postControlPlaneOperation(
  entity: string,
  idempotencyKey: string,
  input: Record<string, unknown>,
) {
  const response = await harness.fetch(`${controlPlaneApi}/operations/${entity}/create`, {
    body: JSON.stringify({ idempotencyKey, input }),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as OperationInvocationResponse;

  expect(response.status).toBe(200);

  return {
    body,
    response,
  };
}

function operationRecord(response: { body: OperationInvocationResponse }): StoredRecord {
  const output = response.body.output;

  if (output === undefined) {
    throw new Error(`Expected operation response, received ${JSON.stringify(response.body)}.`);
  }

  if (output.type !== "create" && output.type !== "update") {
    throw new Error(`Expected create or update operation output, received "${output.type}".`);
  }

  return output.record;
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

async function assignIdentityInstanceRole(
  principalId: string,
  roleKey: "instance.admin" | "instance.owner",
) {
  return await postRecordOperation({
    entity: "role-assignment",
    idempotencyKey: `assign-${principalId.replace(/\W+/g, "-")}-${roleKey.replace(/\./g, "-")}`,
    operationName: "create",
    input: {
      role: `role:${roleKey}`,
      targetKind: "principal",
      targetPrincipal: principalId,
      scopeKind: "instance",
      status: "active",
    },
  });
}

async function readPrincipalAuthority(
  principalId: string,
): Promise<ActiveIdentityAuthority | null> {
  const url = new URL(INTERNAL_IDENTITY_PRINCIPAL_AUTHORITY_PATH, "http://internal");

  url.searchParams.set("principalId", principalId);

  const response = await harness.durableObjectFetch(
    "FORMLESS_AUTHORITY",
    IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY,
    `${url.pathname}${url.search}`,
    { method: "GET" },
  );
  const body = (await response.json()) as {
    authority?: ActiveIdentityAuthority | null;
    error?: string;
  };

  expect(response.status).toBe(200);

  return body.authority ?? null;
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

async function postCollaboratorInvitationResponse(input: unknown, headers: Record<string, string>) {
  const response = await harness.fetch(`${identityApi}/collaborator-invitations`, {
    body: JSON.stringify(input),
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as CollaboratorInvitationTestResponse;

  return {
    body,
    response,
  };
}

function recordById(records: StoredRecord[], id: string): StoredRecord {
  const record = records.find((candidate) => candidate.id === id);

  if (!record) {
    throw new Error(`Expected record "${id}".`);
  }

  return record;
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
  return (await createOwnerSessionHeaders()).headers;
}

async function createOwnerSessionHeaders() {
  const identityOwner = await ensureTestIdentityOwner(harness, adminToken, owner);
  const created = await createOwnerSessionCookie({
    env: { FORMLESS_ADMIN_TOKEN: adminToken },
    maxAgeSeconds: 60,
    now: "2999-01-01T00:00:00.000Z",
    owner: identityOwner,
    request: new Request("http://example.com/"),
  });

  return {
    headers: {
      Cookie: cookiePair(created.cookie),
    },
    owner: identityOwner,
  };
}

function cookiePair(cookie: string) {
  return cookie.split(";")[0] ?? cookie;
}
