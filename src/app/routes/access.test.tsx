import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";
import type {
  FormlessUiAccessManifestContract,
  FormlessUiAccessReadyContract,
} from "@dpeek/formless-astryx/contract";
import type { IdentityAccessManagementSummary } from "@dpeek/formless-identity-control-plane";
import type { AppInstall } from "@dpeek/formless-installed-apps";
import {
  createApplicationRuntimePublicationCoordinator,
  ApplicationRuntimeContractHostProvider,
} from "../generated/application-runtime-contract-host.tsx";
import { IdentityAccessManagementApiError } from "../../client/identity-access-management.ts";
import {
  instanceAccessInvitationAuthoringReference,
  instanceAccessReference,
} from "./access-contract.ts";
import { AccessRoute, type AccessRouteDependencies } from "./access.tsx";

vi.mock("../generated/legacy-access-renderer.tsx", () => ({
  LegacySubscribedAccessRenderer: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = "2026-07-17T00:00:00.000Z";

describe("access route runtime", () => {
  it("loads only the identity summary and installed-app labels and projects authorization states", async () => {
    const ready = await mountAccessRoute({
      fetchInstalls: async () => ({ installs: [siteInstall()], packages: [] }),
      fetchSummary: async () => populatedSummary(),
    });

    expect(ready.manifest().state).toBe("ready");
    expect(ready.readyManifest().invitations[0]?.scope?.value).toBe("Personal Site");
    expect(JSON.stringify(ready.readyManifest())).not.toContain("Instance Settings");
    expect(JSON.stringify(ready.readyManifest())).not.toContain("Workspace Push");
    await ready.unmount();

    const unauthorized = await mountAccessRoute({
      fetchInstalls: async () => ({ installs: [], packages: [] }),
      fetchSummary: async () => {
        throw new IdentityAccessManagementApiError("Administrator authority is required.", {
          body: { error: "Administrator authority is required." },
          status: 403,
        });
      },
    });
    expect(unauthorized.manifest()).toMatchObject({
      state: "unauthorized",
      feedback: { detail: "Administrator authority is required." },
    });
    await unauthorized.unmount();

    const source = readFileSync(new URL("./access.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("formless-gateway");
    expect(source).not.toContain("InstanceManagementRuntime");
    expect(source).not.toContain("HomeRoute");
  });

  it("keeps the draft controlled, deduplicates pending submit, refreshes, and publishes safe outcomes", async () => {
    const createCalls: unknown[] = [];
    let fetchCount = 0;
    let createAttempt = 0;
    const retry = deferred<void>();
    const runtime = await mountAccessRoute({
      createIdempotencyKey: () => "access-invitation:test",
      createInvitation: async (input) => {
        createCalls.push(input);
        createAttempt += 1;
        if (createAttempt === 1) {
          throw new Error("Failed at /Users/ada/formless with TOKEN=owner-secret.");
        }
        await retry.promise;
      },
      fetchInstalls: async () => ({ installs: [siteInstall()], packages: [] }),
      fetchSummary: async () => {
        fetchCount += 1;
        return populatedSummary();
      },
    });

    await runtime.dispatch(runtime.readyManifest().invite.intent);
    await changeField(runtime, "targetEmail", "lin.new@example.com");
    await changeField(runtime, "displayName", "Lin New");
    expect(runtime.authoring()).toMatchObject({
      open: true,
      fields: {
        displayName: { value: "Lin New" },
        targetEmail: { value: "lin.new@example.com" },
      },
    });

    await runtime.dispatch(runtime.authoring().submit.intent);
    expect(runtime.authoring().feedback).toMatchObject({
      detail: "Failed at <path> with TOKEN=[redacted]",
      title: "Invitation could not be created",
    });
    expect(JSON.stringify(runtime.authoring())).not.toContain("/Users/ada/formless");
    expect(JSON.stringify(runtime.authoring())).not.toContain("owner-secret");

    let pendingSubmit: Promise<void> | undefined;
    await act(async () => {
      pendingSubmit = Promise.resolve(runtime.host.dispatch(runtime.authoring().submit.intent));
      await Promise.resolve();
    });
    expect(runtime.authoring().pending).toMatchObject({ isPending: true });
    await runtime.dispatch(runtime.authoring().submit.intent);
    expect(createCalls).toHaveLength(2);

    retry.resolve();
    await act(async () => {
      await pendingSubmit;
    });

    expect(fetchCount).toBe(2);
    expect(createCalls[1]).toMatchObject({
      idempotencyKey: "access-invitation:test",
      invitedPrincipal: { displayName: "Lin New" },
      targetEmail: "lin.new@example.com",
      targetSurface: "instance",
    });
    expect(runtime.readyManifest().feedback).toMatchObject({
      detail: "Invitation created.",
      title: "Invitation created",
    });
    expect(runtime.authoring()).toMatchObject({
      open: false,
      fields: { displayName: { value: "" }, targetEmail: { value: "" } },
    });
    expect(JSON.stringify(runtime.readyManifest())).not.toContain("access-invitation:test");
    await runtime.unmount();
  });

  it("requires confirmation before the only destructive action, refreshes, and redacts failure", async () => {
    let fetchCount = 0;
    let revokeAttempt = 0;
    const revokeCalls: unknown[] = [];
    const runtime = await mountAccessRoute({
      fetchInstalls: async () => ({ installs: [siteInstall()], packages: [] }),
      fetchSummary: async () => {
        fetchCount += 1;
        return revokeAttempt > 1 ? revokedSummary() : populatedSummary();
      },
      revokeInvitation: async (input) => {
        revokeCalls.push(input);
        revokeAttempt += 1;
        if (revokeAttempt === 1) {
          throw new Error("Revoke failed at /Users/ada with TOKEN=private-revoke.");
        }
      },
    });

    const invitation = required(runtime.readyManifest().invitations[0]);
    if (invitation.revocation.availability !== "available") {
      throw new Error("Expected revocation action.");
    }
    await runtime.dispatch(invitation.revocation.action.intent);
    expect(revokeCalls).toHaveLength(0);
    expect(runtime.readyManifest().confirmation).toMatchObject({
      invitationId: invitation.id,
      open: true,
    });

    await runtime.dispatch(required(runtime.readyManifest().confirmation).action.intent);
    expect(revokeCalls).toEqual([{ invitationId: "invitation:lin" }]);
    expect(runtime.readyManifest().feedback).toMatchObject({
      detail: "Revoke failed at <path> with TOKEN=[redacted]",
      title: "Invitation could not be revoked",
    });
    expect(runtime.readyManifest().confirmation).toMatchObject({ open: true });
    expect(JSON.stringify(runtime.readyManifest())).not.toContain("private-revoke");

    await runtime.dispatch(required(runtime.readyManifest().confirmation).action.intent);
    expect(revokeCalls).toHaveLength(2);
    expect(fetchCount).toBe(2);
    expect(runtime.readyManifest().confirmation).toBeUndefined();
    expect(runtime.readyManifest().feedback).toMatchObject({
      detail: "Invitation revoked.",
      title: "Invitation revoked",
    });
    expect(runtime.readyManifest().invitations[0]?.revocation.availability).toBe("unavailable");
    expect(JSON.stringify(runtime.readyManifest())).not.toContain("Disable principal");
    expect(JSON.stringify(runtime.readyManifest())).not.toContain("Remove role");
    expect(JSON.stringify(runtime.readyManifest())).not.toContain("Transfer owner");
    await runtime.unmount();
  });
});

async function mountAccessRoute(dependencies: AccessRouteDependencies) {
  const coordinator = createApplicationRuntimePublicationCoordinator();
  let renderer: ReactTestRenderer | undefined;

  await act(async () => {
    renderer = create(
      <ApplicationRuntimeContractHostProvider coordinator={coordinator}>
        <AccessRoute dependencies={dependencies} />
      </ApplicationRuntimeContractHostProvider>,
    );
  });

  return {
    authoring: () => required(coordinator.host.read(instanceAccessInvitationAuthoringReference)),
    dispatch: async (intent: Parameters<typeof coordinator.host.dispatch>[0]) => {
      await act(async () => {
        await coordinator.host.dispatch(intent);
      });
    },
    host: coordinator.host,
    manifest: () => required(coordinator.host.read(instanceAccessReference)),
    readyManifest: () => readyManifest(required(coordinator.host.read(instanceAccessReference))),
    unmount: async () => {
      await act(async () => required(renderer).unmount());
    },
  };
}

async function changeField(
  runtime: Awaited<ReturnType<typeof mountAccessRoute>>,
  field: "displayName" | "targetEmail",
  value: string,
) {
  const contract = runtime.authoring().fields[field];
  await runtime.dispatch({ ...contract.changeIntent, value });
}

function emptySummary(): IdentityAccessManagementSummary {
  return {
    appRegistrations: [],
    groups: [],
    invitationGrantOptions: {
      authority: { instanceAdmin: false, instanceOwner: true },
      memberships: [],
      roles: [],
    },
    invitations: [],
    memberships: [],
    organizations: [],
    people: [],
    roles: [],
  };
}

function populatedSummary(): IdentityAccessManagementSummary {
  return {
    ...emptySummary(),
    invitationGrantOptions: {
      authority: { instanceAdmin: false, instanceOwner: true },
      memberships: [],
      roles: [{ displayLabel: "Owner", roleKey: "instance.owner", scopeKind: "instance" }],
    },
    invitations: [
      {
        createdAt: NOW,
        expiresAt: "2026-07-24T00:00:00.000Z",
        invitationId: "invitation:lin",
        inviterPrincipalId: "principal:ada",
        status: "pending",
        targetAppInstallId: "install:site",
        targetEmail: "lin@example.com",
        targetSurface: "app-install",
        updatedAt: NOW,
      },
    ],
    people: [
      {
        createdAt: NOW,
        displayName: "Ada Owner",
        kind: "human",
        primaryEmail: {
          displayEmail: "ada@example.com",
          normalizedEmail: "ada@example.com",
          principalEmailId: "email:ada",
          verificationStatus: "verified",
          verifiedAt: NOW,
        },
        principalId: "principal:ada",
        status: "active",
        updatedAt: NOW,
      },
    ],
    roles: [
      {
        createdAt: NOW,
        displayLabel: "Owner",
        roleAssignmentId: "role-assignment:ada-owner",
        roleId: "role:owner",
        roleKey: "instance.owner",
        scopeKind: "instance",
        status: "active",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: NOW,
      },
    ],
  };
}

function revokedSummary(): IdentityAccessManagementSummary {
  const summary = populatedSummary();
  return {
    ...summary,
    invitations: summary.invitations.map((invitation) => ({
      ...invitation,
      status: "revoked" as const,
    })),
  };
}

function siteInstall(): AppInstall {
  return {
    adminRoute: "/apps/install:site",
    createdAt: NOW,
    installId: "install:site",
    label: "Personal Site",
    packageAppKey: "site",
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: `sha256:${"a".repeat(64)}`,
    status: "installed",
    updatedAt: NOW,
  };
}

function readyManifest(manifest: FormlessUiAccessManifestContract): FormlessUiAccessReadyContract {
  if (manifest.state !== "ready") {
    throw new Error("Expected ready access manifest.");
  }
  return manifest;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error("Expected value.");
  }
  return value;
}
