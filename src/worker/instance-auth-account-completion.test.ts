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
  INSTANCE_AUTH_APP_REGISTRATION_GATE_COMPLETE_PATH,
  INSTANCE_AUTH_ACCOUNT_COMPLETION_RESOLVE_PATH,
  INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH,
  type AccountCompletionGateResolverInput,
} from "./instance-auth-account-completion.ts";
import { CENTRAL_AUTH_SESSION_COOKIE_NAME } from "./central-auth-session.ts";
import type { CreateAppInstallResponse } from "../shared/protocol.ts";
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
        FORMLESS_OWNER_SESSION_SECRET: "test-owner-session-secret",
      },
    },
  );
  await createAppInstall({ installId: "crm", label: "CRM", packageAppKey: "crm" });
  await createAppInstall({ installId: "billing", label: "Billing", packageAppKey: "tasks" });
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

  it("resolves closed app registration policy and continues after active registration", async () => {
    const principal = await createPrincipal("Closed Registration");

    await createPrimaryEmail(principal.id, "closed-registration@example.com", "verified");
    await createCredential(principal.id, "closed-registration");

    const blocked = await expectGate(
      { principalId: principal.id, target: appTarget() },
      "app-registration",
    );

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "crm",
        kind: "app-registration",
        registrationPolicy: "closed",
      },
      status: "blocked",
      target: appTarget(),
    });
    expect(JSON.stringify(blocked)).not.toContain("session");
    expect(JSON.stringify(blocked)).not.toContain("grantSecret");
    expect(JSON.stringify(blocked)).not.toContain("credential");
    expect(JSON.stringify(blocked)).not.toContain("tokenHash");

    await createAppRegistration(principal.id, { appInstallId: "crm" });

    await expect(resolveGate({ principalId: principal.id, target: appTarget() })).resolves.toEqual({
      continueTo: "/dashboard",
      status: "complete",
      target: appTarget(),
    });
  });

  it("returns a self-service email-verified app registration gate", async () => {
    await createAppInstall({
      installId: "portal",
      label: "Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Email Verified Registration");
    const target = appTarget({
      appInstallId: "portal",
      returnTo: "/portal",
      routeId: "route:portal",
      storageIdentity: "app:portal",
      targetOrigin: "https://portal.example.com",
    });

    await createPrimaryEmail(principal.id, "email-verified-registration@example.com", "verified");
    await createCredential(principal.id, "email-verified-registration");

    const blocked = await expectGate({ principalId: principal.id, target }, "app-registration");

    expect(blocked).toMatchObject({
      gate: {
        appInstallId: "portal",
        kind: "app-registration",
        operation: {
          appInstallId: "portal",
          entityName: "app-registration",
          label: "Register for app",
          operationKey: "auth.app-registration.complete",
          operationName: "completeEmailVerifiedAppRegistration",
        },
        registrationPolicy: "email-verified",
      },
      status: "blocked",
      target,
    });
    expect(JSON.stringify(blocked)).not.toContain("session");
    expect(JSON.stringify(blocked)).not.toContain("grantSecret");
    expect(JSON.stringify(blocked)).not.toContain("credential");
    expect(JSON.stringify(blocked)).not.toContain("tokenHash");
  });

  it("completes an email-verified app registration gate and returns a safe continuation", async () => {
    const install = await createAppInstall({
      installId: "portal",
      label: "Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Complete Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "complete-registration@example.com", "verified");
    await createCredential(principal.id, "complete-registration");

    const completed = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();
    const privateCounts = await authPrivateCounts();

    expect(completed.status).toBe(200);
    expect(completed.setCookie).toBeNull();
    expect(completed.body).toMatchObject({
      accountCompletion: {
        continueTo: "/apps/portal",
        status: "complete",
        target,
      },
      appRegistration: {
        appInstallId: "portal",
        status: "active",
        targetKind: "principal",
        targetPrincipal: principal.id,
      },
      completed: true,
      continueTo: "/apps/portal",
    });
    expect(completed.body).not.toHaveProperty("handoff");
    expect(records.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "app-registration",
          values: expect.objectContaining({
            appInstallId: "portal",
            status: "active",
            targetKind: "principal",
            targetPrincipal: principal.id,
          }),
        }),
      ]),
    );
    expect(privateCounts.handoffGrants).toBe(0);
  });

  it("re-evaluates account completion after app registration before returning continuation", async () => {
    const install = await createAppInstall({
      installId: "portal",
      label: "Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Blocked After Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "blocked-after-registration@example.com", "verified");
    await createCredential(principal.id, "blocked-after-registration");
    await createAccountPolicy({
      appInstallId: "portal",
      displayName: "Portal terms",
      policyKey: "portal-terms",
      scopeKind: "app-install",
    });

    const completed = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const privateCounts = await authPrivateCounts();

    expect(completed.status).toBe(409);
    expect(completed.body).toMatchObject({
      accountCompletion: {
        gate: {
          kind: "terms-acceptance",
          policies: [expect.objectContaining({ policyKey: "portal-terms" })],
        },
        status: "blocked",
        target,
      },
      completed: true,
    });
    expect(completed.body).not.toHaveProperty("handoff");
    expect(privateCounts.handoffGrants).toBe(0);
  });

  it("rejects app registration completion when the current gate is not email-verified", async () => {
    const install = await createAppInstall({
      installId: "closed-portal",
      label: "Closed Portal",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Reject Closed Registration");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reject-closed-registration@example.com", "verified");
    await createCredential(principal.id, "reject-closed-registration");

    const rejected = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();

    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      accountCompletion: {
        gate: {
          appInstallId: "closed-portal",
          kind: "app-registration",
          registrationPolicy: "closed",
        },
        status: "blocked",
      },
      error: "Email-verified app-registration gate is not current.",
    });
    expect(
      records.records.some(
        (record) =>
          record.entity === "app-registration" &&
          record.values.appInstallId === "closed-portal" &&
          record.values.targetPrincipal === principal.id,
      ),
    ).toBe(false);
  });

  it("rejects app registration completion while an earlier credential gate is current", async () => {
    const install = await createAppInstall({
      installId: "credential-portal",
      label: "Credential Portal",
      packageAppKey: "tasks",
      registrationPolicy: "email-verified",
    });
    const principal = await createPrincipal("Reject Missing Credential");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reject-missing-credential@example.com", "verified");

    const rejected = await completeAppRegistrationGate({
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = await identityRecords();

    expect(rejected.status).toBe(409);
    expect(rejected.body).toMatchObject({
      accountCompletion: {
        gate: {
          credentialMethod: "passkey",
          kind: "credential",
        },
        status: "blocked",
      },
      error: "Email-verified app-registration gate is not current.",
    });
    expect(
      records.records.some(
        (record) =>
          record.entity === "app-registration" &&
          record.values.appInstallId === "credential-portal" &&
          record.values.targetPrincipal === principal.id,
      ),
    ).toBe(false);
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

  it("completes terms acceptance and reuses already accepted policy records", async () => {
    const install = await createAppInstall({
      installId: "terms-portal",
      label: "Terms Portal",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Terms Acceptance");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "terms-acceptance@example.com", "verified");
    await createCredential(principal.id, "terms-acceptance");
    await createAppRegistration(principal.id, { appInstallId: "terms-portal" });
    const privacyPolicy = await createAccountPolicy({
      appInstallId: "terms-portal",
      displayName: "Portal privacy",
      policyKey: "terms-portal-privacy",
      scopeKind: "app-install",
    });
    const termsPolicy = await createAccountPolicy({
      appInstallId: "terms-portal",
      displayName: "Portal terms",
      policyKey: "terms-portal-terms",
      scopeKind: "app-install",
    });
    const existingAcceptance = await acceptPolicy(principal.id, privacyPolicy.id);
    const blocked = await expectGate({ principalId: principal.id, target }, "terms-acceptance");

    expect(blocked).toMatchObject({
      gate: {
        kind: "terms-acceptance",
        operation: {
          entityName: "principal-policy-acceptance",
          operationKey: "auth.terms-acceptance.complete",
          operationName: "completeTermsAcceptance",
        },
        policies: [expect.objectContaining({ accountPolicyId: termsPolicy.id })],
      },
      status: "blocked",
      target,
    });

    const cookie = await createCentralSessionCookie(principal.id);
    const beforeRecords = await identityRecords();
    const beforeCounts = identityRecordCounts(beforeRecords.records);
    const beforePrivateCounts = await authPrivateCounts();
    const completed = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [privacyPolicy.id, termsPolicy.id],
      cookie,
      target,
    });
    const afterRecords = await identityRecords();
    const afterCounts = identityRecordCounts(afterRecords.records);
    const afterPrivateCounts = await authPrivateCounts();

    expect(completed.status).toBe(200);
    expect(completed.setCookie).toBeNull();
    expect(completed.body).toMatchObject({
      acceptedPolicies: expect.arrayContaining([
        expect.objectContaining({
          accountPolicyId: privacyPolicy.id,
          principalPolicyAcceptanceId: existingAcceptance.id,
          status: "accepted",
        }),
        expect.objectContaining({
          accountPolicyId: termsPolicy.id,
          status: "accepted",
        }),
      ]),
      accountCompletion: {
        continueTo: "/apps/terms-portal",
        status: "complete",
        target,
      },
      completed: true,
      continueTo: "/apps/terms-portal",
    });
    expect(afterCounts).toMatchObject({
      appRegistrations: beforeCounts.appRegistrations,
      roleAssignments: beforeCounts.roleAssignments,
    });
    expect(afterCounts.acceptedPolicies).toBe(beforeCounts.acceptedPolicies + 1);
    expect(afterPrivateCounts).toEqual(beforePrivateCounts);
  });

  it("rejects wrong-scope, retired, and tombstoned terms policies without acceptance writes", async () => {
    const install = await createAppInstall({
      installId: "reject-terms",
      label: "Reject Terms",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Reject Terms");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "reject-terms@example.com", "verified");
    await createCredential(principal.id, "reject-terms");
    await createAppRegistration(principal.id, { appInstallId: "reject-terms" });
    const requiredPolicy = await createAccountPolicy({
      appInstallId: "reject-terms",
      displayName: "Required terms",
      policyKey: "reject-terms-required",
      scopeKind: "app-install",
    });
    const wrongScopePolicy = await createAccountPolicy({
      appInstallId: "billing",
      displayName: "Wrong app terms",
      policyKey: "wrong-app-terms",
      scopeKind: "app-install",
    });
    const retiredPolicy = await createAccountPolicy({
      appInstallId: "reject-terms",
      displayName: "Retired terms",
      policyKey: "retired-terms",
      scopeKind: "app-install",
    });
    const tombstonedPolicy = await createAccountPolicy({
      appInstallId: "reject-terms",
      displayName: "Tombstoned terms",
      policyKey: "tombstoned-terms",
      scopeKind: "app-install",
    });

    await updateIdentityRecord("account-policy", retiredPolicy.id, { status: "retired" });
    await deleteIdentityRecord("account-policy", tombstonedPolicy.id);

    const cookie = await createCentralSessionCookie(principal.id);

    for (const invalidPolicy of [wrongScopePolicy, retiredPolicy, tombstonedPolicy]) {
      const beforeRecords = await identityRecords();
      const rejected = await completeTermsAcceptanceGate({
        acceptedPolicyIds: [requiredPolicy.id, invalidPolicy.id],
        cookie,
        target,
      });
      const afterRecords = await identityRecords();

      expect(rejected.status).toBe(409);
      expect(rejected.body).toEqual({
        error: "Terms acceptance policies must be active and target-scoped.",
      });
      expect(identityRecordCounts(afterRecords.records)).toEqual(
        identityRecordCounts(beforeRecords.records),
      );
    }
  });

  it("rejects duplicate and partial terms acceptance submissions without writes", async () => {
    const install = await createAppInstall({
      installId: "partial-terms",
      label: "Partial Terms",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Partial Terms");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "partial-terms@example.com", "verified");
    await createCredential(principal.id, "partial-terms");
    await createAppRegistration(principal.id, { appInstallId: "partial-terms" });
    const firstPolicy = await createAccountPolicy({
      appInstallId: "partial-terms",
      displayName: "First terms",
      policyKey: "partial-terms-first",
      scopeKind: "app-install",
    });
    const secondPolicy = await createAccountPolicy({
      appInstallId: "partial-terms",
      displayName: "Second terms",
      policyKey: "partial-terms-second",
      scopeKind: "app-install",
    });
    const cookie = await createCentralSessionCookie(principal.id);
    const beforeRecords = await identityRecords();
    const duplicate = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [firstPolicy.id, firstPolicy.id],
      cookie,
      target,
    });
    const partial = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [firstPolicy.id],
      cookie,
      target,
    });
    const afterRecords = await identityRecords();

    expect(duplicate.status).toBe(400);
    expect(duplicate.body).toEqual({
      error: "Account completion terms acceptance acceptedPolicyIds must not contain duplicates.",
    });
    expect(partial.status).toBe(409);
    expect(partial.body).toMatchObject({
      accountCompletion: {
        gate: {
          kind: "terms-acceptance",
          policies: expect.arrayContaining([
            expect.objectContaining({ accountPolicyId: firstPolicy.id }),
            expect.objectContaining({ accountPolicyId: secondPolicy.id }),
          ]),
        },
        status: "blocked",
      },
      error: "Terms acceptance request does not include every current policy.",
    });
    expect(identityRecordCounts(afterRecords.records)).toEqual(
      identityRecordCounts(beforeRecords.records),
    );
  });

  it("treats revoked and tombstoned policy acceptances as unsatisfied before creating new accepted records", async () => {
    const install = await createAppInstall({
      installId: "stale-acceptances",
      label: "Stale Acceptances",
      packageAppKey: "tasks",
    });
    const principal = await createPrincipal("Stale Acceptances");
    const target = appTargetForInstall(install);

    await createPrimaryEmail(principal.id, "stale-acceptances@example.com", "verified");
    await createCredential(principal.id, "stale-acceptances");
    await createAppRegistration(principal.id, { appInstallId: "stale-acceptances" });
    const revokedPolicy = await createAccountPolicy({
      appInstallId: "stale-acceptances",
      displayName: "Revoked terms",
      policyKey: "revoked-terms",
      scopeKind: "app-install",
    });
    const tombstonedPolicy = await createAccountPolicy({
      appInstallId: "stale-acceptances",
      displayName: "Deleted acceptance terms",
      policyKey: "deleted-acceptance-terms",
      scopeKind: "app-install",
    });
    const revokedAcceptance = await acceptPolicy(principal.id, revokedPolicy.id);
    const tombstonedAcceptance = await acceptPolicy(principal.id, tombstonedPolicy.id);

    await updateIdentityRecord("principal-policy-acceptance", revokedAcceptance.id, {
      status: "revoked",
    });
    await deleteIdentityRecord("principal-policy-acceptance", tombstonedAcceptance.id);

    const blocked = await expectGate({ principalId: principal.id, target }, "terms-acceptance");

    expect(blocked).toMatchObject({
      gate: {
        policies: expect.arrayContaining([
          expect.objectContaining({ accountPolicyId: revokedPolicy.id }),
          expect.objectContaining({ accountPolicyId: tombstonedPolicy.id }),
        ]),
      },
    });

    const completed = await completeTermsAcceptanceGate({
      acceptedPolicyIds: [revokedPolicy.id, tombstonedPolicy.id],
      cookie: await createCentralSessionCookie(principal.id),
      target,
    });
    const records = (await identityRecords()).records;

    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({
      accountCompletion: { status: "complete" },
      completed: true,
      continueTo: "/apps/stale-acceptances",
    });
    expect(
      records.filter(
        (record) =>
          record.entity === "principal-policy-acceptance" &&
          record.values.principal === principal.id &&
          record.values.accountPolicy === revokedPolicy.id &&
          record.values.status === "accepted" &&
          !record.deletedAt,
      ),
    ).toHaveLength(1);
    expect(
      records.filter(
        (record) =>
          record.entity === "principal-policy-acceptance" &&
          record.values.principal === principal.id &&
          record.values.accountPolicy === tombstonedPolicy.id &&
          record.values.status === "accepted" &&
          !record.deletedAt,
      ),
    ).toHaveLength(1);
    expect(records.find((record) => record.id === revokedAcceptance.id)?.values.status).toBe(
      "revoked",
    );
    expect(records.find((record) => record.id === tombstonedAcceptance.id)?.deletedAt).toEqual(
      expect.any(String),
    );
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

async function completeAppRegistrationGate(input: {
  cookie: string;
  target: AccountCompletionGateTarget;
}) {
  const response = await fetchAuthOrigin(INSTANCE_AUTH_APP_REGISTRATION_GATE_COMPLETE_PATH, {
    body: JSON.stringify({ target: input.target }),
    headers: {
      "Content-Type": "application/json",
      Cookie: input.cookie,
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as Record<string, unknown>,
    setCookie: response.headers.get("Set-Cookie"),
    status: response.status,
  };
}

async function completeTermsAcceptanceGate(input: {
  acceptedPolicyIds: string[];
  cookie: string;
  target: AccountCompletionGateTarget;
}) {
  const response = await fetchAuthOrigin(INSTANCE_AUTH_TERMS_ACCEPTANCE_GATE_COMPLETE_PATH, {
    body: JSON.stringify({
      acceptedPolicyIds: input.acceptedPolicyIds,
      target: input.target,
    }),
    headers: {
      "Content-Type": "application/json",
      Cookie: input.cookie,
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as Record<string, unknown>,
    setCookie: response.headers.get("Set-Cookie"),
    status: response.status,
  };
}

async function createCentralSessionCookie(principalId: string) {
  const response = await fetchAuthOrigin("/harness/auth/session", {
    body: JSON.stringify({ principalId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const cookie = response.headers.get("Set-Cookie") ?? "";

  expect(response.status).toBe(200);
  expect(cookie).toContain(`${CENTRAL_AUTH_SESSION_COOKIE_NAME}=`);

  return cookie.split(";")[0] ?? cookie;
}

async function identityRecords() {
  const response = await fetchAuthOrigin("/harness/identity-records");

  expect(response.status).toBe(200);

  return (await response.json()) as { records: StoredRecord[] };
}

async function authPrivateCounts() {
  const response = await fetchAuthOrigin("/harness/auth/private-counts");

  expect(response.status).toBe(200);

  return (await response.json()) as {
    centralSessions: number;
    handoffGrants: number;
    passkeyCredentials: number;
  };
}

function fetchAuthOrigin(path: string, init?: Parameters<Harness["mf"]["dispatchFetch"]>[1]) {
  return harness.mf.dispatchFetch(`https://auth.example.com${path}`, init);
}

async function createAppInstall(input: {
  installId: string;
  label: string;
  packageAppKey: string;
  registrationPolicy?: "closed" | "email-verified";
}) {
  const response = await harness.fetch("/api/formless/app-installs", {
    body: JSON.stringify(input),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as CreateAppInstallResponse;

  expect(response.status).toBe(201);

  return body.install;
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

async function deleteIdentityRecord(entity: string, recordId: string) {
  const response = await fetchAuthOrigin("/harness/identity/tombstone", {
    body: JSON.stringify({
      entity,
      idempotencyKey: nextWriteKey(`${entity}-tombstone`),
      recordId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as { record: StoredRecord };

  expect(response.status).toBe(200);

  return body.record;
}

async function postIdentityRecordOperation(input: Parameters<typeof recordOperationRequest>[0]) {
  const request = recordOperationRequest(input);
  const response = await harness.fetch(`${identityApi}${request.path.slice("/api".length)}`, {
    body: JSON.stringify(request.body),
    headers: adminHeaders({ "Content-Type": "application/json" }),
    method: "POST",
  });
  const body = (await response.json()) as OperationInvocationResponse;

  expect(response.status, JSON.stringify(body)).toBe(200);

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

function appTargetForInstall(
  install: CreateAppInstallResponse["install"],
  overrides: Partial<AccountCompletionGateTarget> = {},
): AccountCompletionGateTarget {
  const route = install.routes?.find((candidate) => candidate.routeKind === "admin");

  if (!route) {
    throw new Error(`Install "${install.installId}" did not expose an admin route.`);
  }

  return appTarget({
    appInstallId: install.installId,
    returnTo: route.path,
    routeId: route.id,
    storageIdentity: `app:${install.installId}`,
    targetOrigin: "https://auth.example.com",
    ...overrides,
  });
}

function identityRecordCounts(records: StoredRecord[]) {
  return {
    acceptedPolicies: records.filter(
      (record) =>
        record.entity === "principal-policy-acceptance" &&
        !record.deletedAt &&
        record.values.status === "accepted",
    ).length,
    appRegistrations: records.filter(
      (record) => record.entity === "app-registration" && !record.deletedAt,
    ).length,
    roleAssignments: records.filter(
      (record) => record.entity === "role-assignment" && !record.deletedAt,
    ).length,
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
      import { createCentralAuthSessionCookie } from "${process.cwd()}/src/worker/central-auth-session.ts";
      import { FORMLESS_INSTANCE_AUTHORITY_NAME } from "${process.cwd()}/src/worker/formless-instance.ts";
      import { createPasskeyCredential } from "${process.cwd()}/src/worker/instance-auth-state.ts";
      import { getBootstrapRecords, writeRecordSetForCommandOperationOutcome } from "${process.cwd()}/src/worker/storage.ts";

      export class AccountCompletionHarness extends FormlessAuthority {
        constructor(ctx, env) {
          super(ctx, env);
          this.env = env;
        }

        async fetch(request) {
          const url = new URL(request.url);

          if (url.pathname === "/harness/identity-records") {
            return Response.json({ records: getBootstrapRecords(this.ctx.storage) });
          }

          if (url.pathname === "/harness/identity/tombstone" && request.method === "POST") {
            const body = await request.json();
            const record = getBootstrapRecords(this.ctx.storage).find(
              (candidate) => candidate.entity === body.entity && candidate.id === body.recordId,
            );

            if (!record) {
              return Response.json({ error: "Missing identity record." }, { status: 404 });
            }

            const outcome = writeRecordSetForCommandOperationOutcome(
              this.ctx.storage,
              \`harness-tombstone:\${body.entity}:\${body.recordId}:\${body.idempotencyKey}\`,
              [{ kind: "delete", record }],
              undefined,
              { now: "2026-07-06T00:00:00.000Z" },
            );

            return Response.json({
              record: outcome.response.changes.at(-1)?.payload,
            });
          }

          if (url.pathname === "/harness/auth/private-counts") {
            return Response.json({
              centralSessions: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_central_sessions").one().count,
              handoffGrants: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_handoff_grants").one().count,
              passkeyCredentials: this.ctx.storage.sql.exec("SELECT COUNT(*) AS count FROM instance_auth_passkey_credentials").one().count,
            });
          }

          if (url.pathname === "/harness/auth/session" && request.method === "POST") {
            const body = await request.json();
            const session = await createCentralAuthSessionCookie(this.ctx.storage, {
              env: this.env,
              now: "2026-07-06T00:00:00.000Z",
              principalId: body.principalId,
              request,
            });

            return Response.json(
              { session: session.session },
              { headers: { "Set-Cookie": session.cookie } },
            );
          }

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
          const authorityName =
            url.pathname.startsWith(IDENTITY_CONTROL_PLANE_API_ROUTE_PREFIX) ||
            url.pathname === "/harness/identity-records" ||
            url.pathname === "/harness/identity/tombstone"
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
