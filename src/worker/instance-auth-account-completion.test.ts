import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { rm, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX } from "@dpeek/formless-identity-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";

import {
  parseAccountCompletionGateResolutionResult,
  type AccountCompletionGateResolutionResult,
  type AccountCompletionGateTarget,
} from "../shared/instance-auth.ts";
import { recordOperationRequest } from "../test/authority-write.ts";
import type { OperationInvocationResponse } from "../shared/operation-invocation.ts";
import {
  INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH,
  type AccountCompletionGateResolverInput,
} from "./instance-auth-account-completion.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";
const identityApi = IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX;

let harness: Harness;
let harnessDir: string;
let harnessPath: string;
let writeCounter = 0;

beforeAll(async () => {
  harnessPath = await writeAccountCompletionHarness();
});

beforeEach(async () => {
  writeCounter = 0;
  harness = await createWorkerHarness(
    harnessPath,
    {
      FORMLESS_AUTHORITY: { className: "AccountCompletionHarness", useSQLite: true },
    },
    {
      bindings: {
        FORMLESS_ADMIN_TOKEN: adminToken,
        FORMLESS_INSTANCE_AUTH_ORIGIN: "https://auth.example.com",
      },
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

afterAll(async () => {
  await rm(harnessDir, { force: true, recursive: true });
});

describe("instance auth account completion resolver", () => {
  it("returns the next blocking gate in deterministic first-pass order", async () => {
    const principal = await createPrincipal("Ordered Gates");

    await expectGate({ principalId: principal.id, target: appTarget() }, "email-verification");

    const email = await createPrimaryEmail(principal.id, "ordered@example.com", "verified");

    await expectGate({ principalId: principal.id, target: appTarget() }, "credential");

    await createCredential(principal.id, "ordered");
    const invitation = await createInvitation(principal.id, {
      targetAppInstallId: "crm",
      targetSurface: "app-install",
    });

    await expectGate({ principalId: principal.id, target: appTarget() }, "invitation");

    await updateIdentityRecord("invitation", invitation.id, {
      acceptedAt: "2026-07-06T00:00:00.000Z",
      status: "accepted",
    });

    await expectGate({ principalId: principal.id, target: appTarget() }, "app-registration");

    await createAppRegistration(principal.id, { appInstallId: "crm" });

    await expectGate(
      {
        principalId: principal.id,
        profileCompletion: { satisfied: false },
        target: appTarget(),
      },
      "profile-completion",
    );

    const policy = await createAccountPolicy({
      appInstallId: "crm",
      displayName: "CRM terms",
      policyKey: "crm-terms",
      scopeKind: "app-install",
    });

    await expectGate(
      {
        principalId: principal.id,
        profileCompletion: { satisfied: true },
        target: appTarget(),
      },
      "terms-acceptance",
    );

    await acceptPolicy(principal.id, policy.id);

    await expectGate(
      {
        principalId: principal.id,
        requiredRole: { roleKey: "app.user", scopeKind: "app-install" },
        target: appTarget(),
      },
      "role-review",
    );

    await assignRole(principal.id, "app.user", { appInstallId: "crm", scopeKind: "app-install" });

    const complete = await resolveGate({
      principalId: principal.id,
      requiredRole: { roleKey: "app.user", scopeKind: "app-install" },
      target: appTarget(),
    });

    expect(complete).toMatchObject({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });
    expect(email.values.verificationStatus).toBe("verified");
  });

  it("rereads identity and policy state instead of trusting stale signed session facts", async () => {
    const principal = await createReadyPrincipal("Stale Principal", {
      appInstallId: "crm",
      policyKey: "crm-policy",
    });
    const initial = await resolveGate({ principalId: principal.id, target: appTarget() });

    expect(initial.status).toBe("complete");

    await updateIdentityRecord("principal-email", principal.email.id, {
      verificationStatus: "unverified",
    });

    await expectGate({ principalId: principal.id, target: appTarget() }, "email-verification");

    await updateIdentityRecord("principal-email", principal.email.id, {
      verificationStatus: "verified",
      verifiedAt: "2026-07-06T01:00:00.000Z",
    });
    await updateIdentityRecord("principal-policy-acceptance", principal.acceptance.id, {
      status: "revoked",
    });

    const blocked = await expectGate(
      { principalId: principal.id, target: appTarget() },
      "terms-acceptance",
    );

    expect(JSON.stringify(blocked)).not.toContain("sessionId");
    expect(JSON.stringify(blocked)).not.toContain("credentialId");
  });

  it("keeps target gates isolated and bypasses public anonymous operations", async () => {
    const principal = await createPrincipal("Target Isolation");
    await createPrimaryEmail(principal.id, "target-isolation@example.com", "verified");
    await createCredential(principal.id, "target-isolation");
    const organizationA = await createOrganization("North");
    const organizationB = await createOrganization("South");
    const appPolicy = await createAccountPolicy({
      appInstallId: "crm",
      displayName: "CRM policy",
      policyKey: "crm-policy",
      scopeKind: "app-install",
    });
    const organizationPolicyA = await createAccountPolicy({
      displayName: "North terms",
      policyKey: "north-terms",
      scopeKind: "organization",
      scopeOrganization: organizationA.id,
    });

    await createAccountPolicy({
      displayName: "South terms",
      policyKey: "south-terms",
      scopeKind: "organization",
      scopeOrganization: organizationB.id,
    });
    await createAppRegistration(principal.id, {
      appInstallId: "crm",
      selectedOrganization: organizationA.id,
    });
    await acceptPolicy(principal.id, appPolicy.id);
    await acceptPolicy(principal.id, organizationPolicyA.id);

    const northTarget = appTarget({
      returnTo: "/north",
      routeId: "route:crm:north",
      selectedOrganization: organizationA.id,
      storageIdentity: "app:crm:north",
    });
    const southTarget = appTarget({
      returnTo: "/south",
      routeId: "route:crm:south",
      selectedOrganization: organizationB.id,
      storageIdentity: "app:crm:south",
    });
    const billingTarget = appTarget({
      appInstallId: "billing",
      returnTo: "/billing",
      routeId: "route:billing",
      storageIdentity: "app:billing",
    });

    await expect(resolveGate({ principalId: principal.id, target: northTarget })).resolves.toEqual({
      continueTo: "/north",
      status: "complete",
      target: northTarget,
    });

    await expectGate({ principalId: principal.id, target: southTarget }, "app-registration");

    const billing = await expectGate(
      { principalId: principal.id, target: billingTarget },
      "app-registration",
    );

    expect(billing).toMatchObject({
      gate: { appInstallId: "billing", kind: "app-registration" },
      target: billingTarget,
    });

    const anonymous = await resolveGate({
      actorKind: "anonymous",
      target: billingTarget,
    });

    expect(anonymous).toEqual({
      continueTo: "/billing",
      status: "complete",
      target: billingTarget,
    });
  });

  it("keeps app profile completion evidence explicit and app-owned", async () => {
    const principal = await createPrincipal("Profile Evidence");

    await createPrimaryEmail(principal.id, "profile-evidence@example.com", "verified");
    await createCredential(principal.id, "profile-evidence");
    await createAppRegistration(principal.id, { appInstallId: "crm" });

    const blocked = await expectGate(
      {
        principalId: principal.id,
        profileCompletion: {
          operation: {
            appInstallId: "crm",
            entityName: "profile",
            label: "Complete profile",
            operationKey: "complete-profile",
            operationName: "completeProfile",
          },
          profileRecordId: "profile:ada",
          satisfied: false,
        },
        target: appTarget(),
      },
      "profile-completion",
    );

    const complete = await resolveGate({
      principalId: principal.id,
      profileCompletion: {
        profileRecordId: "profile:ada",
        satisfied: true,
      },
      target: appTarget(),
    });

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "crm",
        kind: "profile-completion",
        operation: {
          appInstallId: "crm",
          operationKey: "complete-profile",
        },
        profileRecordId: "profile:ada",
      },
      status: "blocked",
    });
    expect(JSON.stringify(blocked)).not.toContain("profileValue");
    expect(complete).toEqual({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });
  });
});

async function createReadyPrincipal(
  displayName: string,
  options: {
    appInstallId: string;
    policyKey: string;
  },
) {
  const principal = await createPrincipal(displayName);
  const email = await createPrimaryEmail(
    principal.id,
    `${options.policyKey.replace(/\W+/g, "-")}@example.com`,
    "verified",
  );
  await createCredential(principal.id, options.policyKey);
  await createAppRegistration(principal.id, { appInstallId: options.appInstallId });
  const policy = await createAccountPolicy({
    appInstallId: options.appInstallId,
    displayName: `${options.policyKey} terms`,
    policyKey: options.policyKey,
    scopeKind: "app-install",
  });
  const acceptance = await acceptPolicy(principal.id, policy.id);

  return {
    acceptance,
    email,
    id: principal.id,
    principal,
  };
}

async function expectGate(input: AccountCompletionGateResolverInput, kind: string) {
  const result = await resolveGate(input);

  expect(result.status).toBe("blocked");

  if (result.status !== "blocked") {
    throw new Error("Expected blocked gate result.");
  }

  expect(result.gate.kind).toBe(kind);

  return result;
}

async function resolveGate(
  input: AccountCompletionGateResolverInput,
): Promise<AccountCompletionGateResolutionResult> {
  const response = await harness.fetch(INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = await response.json();

  expect(response.status).toBe(200);

  return parseAccountCompletionGateResolutionResult(body);
}

async function createPrincipal(displayName: string) {
  return postIdentityRecordOperation({
    entity: "principal",
    idempotencyKey: nextWriteKey("principal"),
    operationName: "create",
    input: {
      displayName,
      kind: "human",
      status: "active",
    },
  });
}

async function createPrimaryEmail(
  principalId: string,
  email: string,
  verificationStatus: "unverified" | "verified",
) {
  return postIdentityRecordOperation({
    entity: "principal-email",
    idempotencyKey: nextWriteKey("email"),
    operationName: "create",
    input: {
      displayEmail: email,
      normalizedEmail: email.toLowerCase(),
      primary: true,
      principal: principalId,
      recovery: false,
      verificationStatus,
      ...(verificationStatus === "verified" ? { verifiedAt: "2026-07-06T00:00:00.000Z" } : {}),
    },
  });
}

async function createCredential(principalId: string, label: string) {
  const response = await harness.fetch("/harness/auth/credential", {
    body: JSON.stringify({
      credentialId: Buffer.from(`credential:${principalId}:${label}`).toString("base64url"),
      principalId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  expect(response.status).toBe(200);
}

async function createInvitation(
  principalId: string,
  target: {
    targetAppInstallId?: string;
    targetOrganization?: string;
    targetSurface: "app-install" | "instance" | "organization";
  },
) {
  return postIdentityRecordOperation({
    entity: "invitation",
    idempotencyKey: nextWriteKey("invitation"),
    operationName: "create",
    input: {
      expiresAt: "2999-01-01T00:00:00.000Z",
      invitedPrincipal: principalId,
      status: "pending",
      targetEmail: `${nextWriteKey("invitee")}@example.com`,
      ...target,
    },
  });
}

async function createAppRegistration(
  principalId: string,
  input: {
    appInstallId: string;
    selectedOrganization?: string;
  },
) {
  return postIdentityRecordOperation({
    entity: "app-registration",
    idempotencyKey: nextWriteKey("app-registration"),
    operationName: "create",
    input: {
      appInstallId: input.appInstallId,
      selectedOrganization: input.selectedOrganization,
      status: "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    },
  });
}

async function createAccountPolicy(input: {
  appInstallId?: string;
  displayName: string;
  policyKey: string;
  scopeKind: "app-install" | "instance" | "organization";
  scopeOrganization?: string;
}) {
  return postIdentityRecordOperation({
    entity: "account-policy",
    idempotencyKey: nextWriteKey("policy"),
    operationName: "create",
    input: {
      displayName: input.displayName,
      policyKey: input.policyKey,
      version: "2026-07-06",
      scopeKind: input.scopeKind,
      status: "active",
      ...(input.appInstallId === undefined ? {} : { appInstallId: input.appInstallId }),
      ...(input.scopeOrganization === undefined
        ? {}
        : { scopeOrganization: input.scopeOrganization }),
    },
  });
}

async function acceptPolicy(principalId: string, accountPolicy: string) {
  return postIdentityRecordOperation({
    entity: "principal-policy-acceptance",
    idempotencyKey: nextWriteKey("acceptance"),
    operationName: "create",
    input: {
      acceptedAt: "2026-07-06T00:00:00.000Z",
      accountPolicy,
      principal: principalId,
      status: "accepted",
    },
  });
}

async function createOrganization(displayName: string) {
  return postIdentityRecordOperation({
    entity: "organization",
    idempotencyKey: nextWriteKey("organization"),
    operationName: "create",
    input: {
      displayName,
      status: "active",
    },
  });
}

async function assignRole(
  principalId: string,
  roleKey: "app.user" | "instance.admin" | "instance.owner",
  input: {
    appInstallId?: string;
    scopeKind: "app-install" | "instance" | "organization";
    scopeOrganization?: string;
  },
) {
  return postIdentityRecordOperation({
    entity: "role-assignment",
    idempotencyKey: nextWriteKey("role-assignment"),
    operationName: "create",
    input: {
      appInstallId: input.appInstallId,
      role: `role:${roleKey}`,
      scopeKind: input.scopeKind,
      scopeOrganization: input.scopeOrganization,
      status: "active",
      targetKind: "principal",
      targetPrincipal: principalId,
    },
  });
}

async function updateIdentityRecord(
  entity: string,
  recordId: string,
  input: Record<string, unknown>,
) {
  return postIdentityRecordOperation({
    entity,
    idempotencyKey: nextWriteKey(`${entity}-update`),
    input,
    operationName: "update",
    recordId,
  });
}

async function postIdentityRecordOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(`${identityApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as OperationInvocationResponse;

  expect(response.status).toBe(200);

  return request.response(body).record as StoredRecord;
}

function appTarget(
  overrides: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionGateTarget {
  return {
    appInstallId: "crm",
    returnTo: "/dashboard",
    routeId: "route:crm",
    storageIdentity: "app:crm",
    targetOrigin: "https://crm.example.com",
    targetProfile: "app",
    ...overrides,
  };
}

function nextWriteKey(prefix: string) {
  writeCounter += 1;

  return `${prefix}-${writeCounter}`;
}

function adminHeaders(headers: Record<string, string> = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${adminToken}`,
  };
}

async function writeAccountCompletionHarness() {
  harnessDir = await mkdtemp(join(tmpdir(), "formless-account-completion-harness-"));
  const path = join(harnessDir, "account-completion-harness.ts");

  await writeFile(
    path,
    `
      import { IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX, IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY } from "@dpeek/formless-identity-control-plane";
      import { FormlessAuthority } from "${process.cwd()}/src/worker/authority.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${process.cwd()}/src/worker/formless-instance.ts";
      import { createPasskeyCredential } from "${process.cwd()}/src/worker/instance-auth-state.ts";

      export class AccountCompletionHarness extends FormlessAuthority {
        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/auth/credential" && request.method === "POST") {
            const body = await request.json();

            return Response.json(createPasskeyCredential(this.ctx.storage, {
              credentialBackedUp: false,
              credentialDeviceType: "singleDevice",
              credentialId: body.credentialId,
              counter: 0,
              createdAt: "2026-07-06T00:00:00.000Z",
              principalId: body.principalId,
              publicKey: new Uint8Array([1, 2, 3, 4]),
              transports: [],
              updatedAt: "2026-07-06T00:00:00.000Z",
            }));
          }

          return super.fetch(request);
        }
      }

      export default {
        fetch(request, env) {
          const url = new URL(request.url);
          const authorityName = url.pathname.startsWith(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX)
            ? IDENTITY_CONTROL_PLANE_STORAGE_IDENTITY
            : FORMLESS_INSTANCE_AUTHORITY_NAME;
          const id = env.FORMLESS_AUTHORITY.idFromName(authorityName);

          return env.FORMLESS_AUTHORITY.get(id).fetch(request);
        },
      };
    `,
  );

  return path;
}
