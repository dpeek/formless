import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { resetClientStore } from "../../client/store.ts";
import {
  listInstallableAppPackages,
  type AppInstall,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../../shared/app-packages.ts";
import { bundledSourceSchemaHashFixtures } from "../../shared/upgrade-migrations.ts";
import {
  AccessInvitationRevokeFeedback,
  InstanceShellRouteView,
  instanceShellUninitializedWorkspaceInstallState,
  operationPollsAutomatically,
  selectWorkspaceGatewayOperationControls,
  type AccessManagementRouteState,
  type InstanceShellRouteState,
} from "./instance-shell.tsx";
import type {
  IdentityAccessInvitationSummary,
  IdentityAccessManagementSummary,
  IdentityInvitationStatus,
} from "@dpeek/formless-identity-control-plane";
import type { WorkspaceGatewayOperation } from "@dpeek/formless-gateway/client";
import {
  workspaceBrowserOperationControlMetadata,
  workspaceOperationDefinitionForKind,
} from "@dpeek/formless-workspace";

beforeEach(() => {
  resetClientStore();
});

function renderWithRouter(children: ReactNode, ssrPath = "/") {
  return renderToStaticMarkup(<Router ssrPath={ssrPath}>{children}</Router>);
}

describe("instance shell route view", () => {
  it("renders access route loading, unauthorized, failed, and empty states outside generated editors", () => {
    const states: Array<[AccessManagementRouteState, string]> = [
      [{ status: "loading" }, "Loading access management..."],
      [
        { status: "unauthorized", message: "Administrator authority is required." },
        "Administrator authority is required.",
      ],
      [{ status: "failed", message: "Access summary failed." }, "Access summary failed."],
      [{ status: "ready", summary: emptyAccessSummary() }, "No people or invitations."],
    ];

    for (const [accessState, expectedText] of states) {
      const html = renderWithRouter(
        <InstanceShellRouteView
          accessState={accessState}
          currentPath="/access"
          state={readyState({
            installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
          })}
        />,
        "/access",
      );

      expect(html).toContain('data-formless-access-management="true"');
      expect(html).toContain("Access");
      expect(html).toContain(expectedText);
      expect(html).not.toContain('aria-label="Instance navigation"');
      expect(html).not.toContain('data-formless-control-plane-screen="apps"');
      expect(html).not.toContain('data-formless-control-plane-screen="routes"');
      expect(html).not.toContain("identity-control-plane");
    }
  });

  it("renders access people and invitation summaries without destructive controls", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        accessState={{ status: "ready", summary: accessSummary() }}
        currentPath="/access"
        state={readyState({
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
      "/access",
    );

    expect(html).toContain('data-formless-access-people-summary="true"');
    expect(html).toContain('data-formless-access-person="principal:ada"');
    expect(html).toContain("Ada Admin");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("Instance Admin");
    expect(html).toContain('data-formless-access-invitation-summary="true"');
    expect(html).toContain('data-formless-access-invitation="invitation:grace"');
    expect(html).toContain("grace@example.com");
    expect(html).toContain("App install personal");
    expect(html).toContain("2026-07-15");
    expect(html).not.toContain("Disable principal");
    expect(html).not.toContain("Revoke invitation");
    expect(html).not.toContain("Remove role");
    expect(html).not.toContain("Transfer owner");
    expect(html).not.toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain('data-formless-control-plane-screen="routes"');
  });

  it("renders owner access invitation form grant choices", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        accessState={{ status: "ready", summary: accessSummary() }}
        currentPath="/access"
        state={readyState({
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
      "/access",
    );

    expect(html).toContain('data-formless-access-invitation-form="true"');
    expect(html).toContain("Invite collaborator");
    expect(html).toContain('name="targetEmail"');
    expect(html).toContain('name="displayName"');
    expect(html).toContain('name="expiresAt"');
    expect(html).toContain('name="targetSurface"');
    expect(html).toContain('name="targetAppInstallId"');
    expect(html).toContain('name="targetOrganization"');
    expect(html).toContain("Personal Site");
    expect(html).toContain("Access Org");
    expect(html).toContain('data-formless-access-invitation-role-option="instance:instance.owner"');
    expect(html).toContain('data-formless-access-invitation-role-option="instance:instance.admin"');
    expect(html).toContain('data-formless-access-invitation-role-option="app-install:app.editor"');
    expect(html).toContain('data-formless-access-invitation-role-option="organization:app.editor"');
    expect(html).toContain(
      'data-formless-access-invitation-membership-option="group:group:access"',
    );
    expect(html).toContain(
      'data-formless-access-invitation-membership-option="organization:organization:access"',
    );
    expect(html).toContain("Send invite");
  });

  it("hides owner-only access invitation grants for instance admins", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        accessState={{ status: "ready", summary: accessSummary({ authority: "admin" }) }}
        currentPath="/access"
        state={readyState({
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
      "/access",
    );

    expect(html).toContain("Admin grants");
    expect(html).toContain('data-formless-access-invitation-role-option="instance:instance.admin"');
    expect(html).toContain('data-formless-access-invitation-role-option="app-install:app.editor"');
    expect(html).not.toContain("Owner grants");
    expect(html).not.toContain("instance.owner");
    expect(html).not.toContain('data-formless-access-invitation-role-scope="organization"');
    expect(html).not.toContain('data-formless-access-invitation-membership-option="');
  });

  it("renders revoke controls for pending invitations with access authority", () => {
    const summary = accessSummary();

    Object.assign(summary.invitations[0] as object, {
      rawInviteToken: "invite-raw-secret",
      sessionId: "session-secret",
      tokenHash: "token-hash-secret",
    });

    const html = renderWithRouter(
      <InstanceShellRouteView
        accessState={{ status: "ready", summary }}
        currentPath="/access"
        onRevokeAccessInvitation={async () => undefined}
        state={readyState({
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
      "/access",
    );

    expect(html).toContain('data-formless-access-invitation-revoke="invitation:grace"');
    expect(html).toContain('aria-label="Revoke invitation for grace@example.com"');
    expect(html).toContain("Revoke");
    expect(html).not.toContain("rawInviteToken");
    expect(html).not.toContain("invite-raw-secret");
    expect(html).not.toContain("session-secret");
    expect(html).not.toContain("token-hash-secret");
  });

  it("hides revoke controls for non-pending and missing-authority invitations", () => {
    const nonPendingStatuses: IdentityInvitationStatus[] = ["accepted", "expired", "revoked"];
    const nonPendingInvitations = nonPendingStatuses.map((status) =>
      accessInvitation({
        invitationId: `invitation:${status}`,
        status,
        targetEmail: `${status}@example.com`,
        ...(status === "accepted" ? { acceptedAt: "2026-07-01T00:00:00.000Z" } : {}),
      }),
    );
    const nonPendingHtml = renderWithRouter(
      <InstanceShellRouteView
        accessState={{
          status: "ready",
          summary: accessSummary({ invitations: nonPendingInvitations }),
        }}
        currentPath="/access"
        onRevokeAccessInvitation={async () => undefined}
        state={readyState({
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
      "/access",
    );
    const missingAuthorityHtml = renderWithRouter(
      <InstanceShellRouteView
        accessState={{ status: "ready", summary: accessSummary({ authority: "none" }) }}
        currentPath="/access"
        onRevokeAccessInvitation={async () => undefined}
        state={readyState({
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
      "/access",
    );

    expect(nonPendingHtml).not.toContain('data-formless-access-invitation-revoke="');
    expect(nonPendingHtml).toContain("Accepted");
    expect(nonPendingHtml).toContain("Expired");
    expect(nonPendingHtml).toContain("Revoked");
    expect(missingAuthorityHtml).toContain('data-formless-access-invitation="invitation:grace"');
    expect(missingAuthorityHtml).not.toContain('data-formless-access-invitation-revoke="');
  });

  it("renders revoke failures as invitation-scoped display-safe alerts", () => {
    const html = renderToStaticMarkup(
      <AccessInvitationRevokeFeedback
        invitationId="invitation:grace"
        submission={{
          status: "failed",
          invitationId: "invitation:grace",
          message: "Collaborator invitation is not pending.",
        }}
      />,
    );
    const otherInvitationHtml = renderToStaticMarkup(
      <AccessInvitationRevokeFeedback
        invitationId="invitation:other"
        submission={{
          status: "failed",
          invitationId: "invitation:grace",
          message: "Collaborator invitation is not pending.",
        }}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-formless-access-invitation-revoke-error="invitation:grace"');
    expect(html).toContain("Collaborator invitation is not pending.");
    expect(html).not.toContain("token");
    expect(html).not.toContain("secret");
    expect(otherInvitationHtml).toBe("");
  });

  it("uses fetched active registry packages for uninitialized workspace install state", () => {
    const privateSite = privateSitePackage();
    const { state } = instanceShellUninitializedWorkspaceInstallState({
      installs: [],
      packages: [privateSite],
    });
    expect(state.installs).toEqual([]);
    expect(state.packages).toEqual([privateSite]);
    expect(state.packages[0]).toMatchObject({
      packageAppKey: "private-site",
      publicRouteBase: "/sites",
      sourceOrigin: "workspace",
    });
  });

  it("selects browser operation controls from gateway bindings and runtime capabilities", () => {
    expect(selectWorkspaceGatewayOperationControls().map((control) => control.kind)).toEqual([
      "check",
      "credentialSetup",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(
      selectWorkspaceGatewayOperationControls().map(
        ({
          bootstrapAllowed,
          executionRequirements,
          inputFields,
          kind,
          label,
          mode,
          requiredCapability,
        }) => ({
          bootstrapAllowed,
          executionRequirements,
          inputFields,
          kind,
          label,
          mode,
          requiredCapability,
        }),
      ),
    ).toEqual(workspaceBrowserOperationControlMetadata());
    expect(
      selectWorkspaceGatewayOperationControls({ operationGroup: "workspace" }).map(
        (control) => control.kind,
      ),
    ).toEqual(["push"]);
    expect(
      selectWorkspaceGatewayOperationControls({
        runtime: { actor: "browser", capabilities: ["deployment-plan"] },
      }).map((control) => control.kind),
    ).toEqual([]);
  });

  it("builds browser operation requests from definition-declared gateway fields", () => {
    const controls = selectWorkspaceGatewayOperationControls();

    expect(Object.fromEntries(controls.map((control) => [control.kind, control.input]))).toEqual({
      check: { kind: "check" },
      credentialSetup: { kind: "credentialSetup", provider: "cloudflare" },
      pull: { dryRun: false, kind: "pull" },
      push: {
        dryRun: false,
        kind: "push",
      },
      save: { check: false, kind: "save" },
      status: { includeDeploymentStatus: false, kind: "status" },
    });

    for (const control of controls) {
      const definition = workspaceOperationDefinitionForKind(control.kind);

      if (!("gateway" in definition.bindings)) {
        throw new Error(`Expected gateway binding for ${control.kind}.`);
      }

      const allowedFields = new Set(["kind", ...definition.bindings.gateway.inputFields]);

      expect(control.bootstrapAllowed).toBe(definition.bindings.gateway.bootstrap);
      expect(Object.keys(control.input).every((key) => allowedFields.has(key))).toBe(true);
      expect(control.inputFields).toEqual(definition.bindings.gateway.inputFields);
      expect(control.label).toBe(definition.label);
      expect(control.mode).toBe(definition.mode);
      expect(control.requiredCapability).toBe(definition.requiredCapability);
      expect(Object.keys(control.input)).not.toContain("workspacePath");
      expect(Object.keys(control.input)).not.toContain("source");
    }

    expect(controls.map((control) => control.kind)).not.toContain("deploymentRefresh");
  });

  it("polls only queued or running workspace operations automatically", () => {
    expect(operationPollsAutomatically(workspaceOperation({ status: "queued" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "running" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "succeeded" }))).toBe(false);
    expect(operationPollsAutomatically(workspaceOperation({ status: "failed" }))).toBe(false);
  });
});

function readyState(
  overrides: Partial<Extract<InstanceShellRouteState, { status: "ready" }>> = {},
): Extract<InstanceShellRouteState, { status: "ready" }> {
  return {
    installing: false,
    installs: [siteInstall({ installId: "site", label: "Site" })],
    packages: listInstallableAppPackages(bundledAppPackageResolver),
    status: "ready",
    ...overrides,
  };
}

function emptyAccessSummary(): IdentityAccessManagementSummary {
  return {
    appRegistrations: [],
    groups: [],
    invitationGrantOptions: invitationGrantOptions(),
    invitations: [],
    memberships: [],
    organizations: [],
    people: [],
    roles: [],
  };
}

function accessSummary({
  authority = "owner",
  invitations,
}: {
  authority?: "admin" | "none" | "owner";
  invitations?: IdentityAccessInvitationSummary[];
} = {}): IdentityAccessManagementSummary {
  const now = "2026-06-30T00:00:00.000Z";

  return {
    ...emptyAccessSummary(),
    groups: [
      {
        createdAt: now,
        displayName: "Access Group",
        groupId: "group:access",
        status: "active",
        updatedAt: now,
      },
    ],
    invitationGrantOptions: invitationGrantOptions({ authority }),
    invitations: invitations ?? [accessInvitation()],
    organizations: [
      {
        createdAt: now,
        displayName: "Access Org",
        organizationId: "organization:access",
        status: "active",
        updatedAt: now,
      },
    ],
    people: [
      {
        createdAt: now,
        displayName: "Ada Admin",
        kind: "human",
        primaryEmail: {
          displayEmail: "ada@example.com",
          normalizedEmail: "ada@example.com",
          principalEmailId: "principal-email:ada",
          verificationStatus: "verified",
          verifiedAt: now,
        },
        principalId: "principal:ada",
        status: "active",
        updatedAt: now,
      },
    ],
    roles: [
      {
        createdAt: now,
        displayLabel: "Instance Admin",
        roleAssignmentId: "role-assignment:ada-admin",
        roleId: "role:instance.admin",
        roleKey: "instance.admin",
        scopeKind: "instance",
        status: "active",
        targetKind: "principal",
        targetPrincipalId: "principal:ada",
        updatedAt: now,
      },
    ],
  };
}

function accessInvitation(
  overrides: Partial<IdentityAccessInvitationSummary> = {},
): IdentityAccessInvitationSummary {
  const now = "2026-06-30T00:00:00.000Z";

  return {
    createdAt: now,
    expiresAt: "2026-07-15T00:00:00.000Z",
    invitationId: "invitation:grace",
    inviterPrincipalId: "principal:ada",
    status: "pending",
    targetAppInstallId: "personal",
    targetEmail: "grace@example.com",
    targetSurface: "app-install",
    updatedAt: now,
    ...overrides,
  };
}

function invitationGrantOptions({
  authority = "owner",
}: {
  authority?: "admin" | "none" | "owner";
} = {}): IdentityAccessManagementSummary["invitationGrantOptions"] {
  const owner = authority === "owner";
  const admin = authority === "admin";

  return {
    authority: {
      instanceAdmin: admin,
      instanceOwner: owner,
    },
    memberships: owner
      ? [
          {
            displayLabel: "Access Group",
            targetGroupId: "group:access",
            targetKind: "group",
          },
          {
            displayLabel: "Access Org",
            targetKind: "organization",
            targetOrganizationId: "organization:access",
          },
        ]
      : [],
    roles:
      authority === "none"
        ? []
        : [
            ...(owner
              ? [
                  {
                    displayLabel: "Instance owner (Instance)",
                    roleKey: "instance.owner" as const,
                    scopeKind: "instance" as const,
                  },
                ]
              : []),
            {
              displayLabel: "Instance admin (Instance)",
              roleKey: "instance.admin" as const,
              scopeKind: "instance" as const,
            },
            {
              displayLabel: "App editor (App install)",
              roleKey: "app.editor" as const,
              scopeKind: "app-install" as const,
            },
            ...(owner
              ? [
                  {
                    displayLabel: "App editor (Organization)",
                    roleKey: "app.editor" as const,
                    scopeKind: "organization" as const,
                  },
                ]
              : []),
          ],
  };
}

function workspaceOperation(
  overrides: Partial<WorkspaceGatewayOperation> = {},
): WorkspaceGatewayOperation {
  return {
    actor: "browser",
    createdAt: "2026-06-02T00:00:00.000Z",
    errors: [],
    events: [],
    id: "op_status_00000001",
    input: {},
    kind: "formless.workspaceOperation",
    logs: [],
    operation: "status",
    result: {
      summary: {
        fields: { initialized: true },
        title: "Workspace status",
      },
    },
    status: "succeeded",
    summary: {
      fields: { initialized: true },
      title: "Workspace status",
    },
    updatedAt: "2026-06-02T00:00:01.000Z",
    version: 1,
    workspace: { label: "personal-sites" },
    ...overrides,
  };
}

function siteInstall(input: { installId: string; label: string }): AppInstall {
  return appInstall({ ...input, packageAppKey: "site" });
}

function privateSitePackage(): InstallableAppPackage {
  return {
    adminRouteBase: "/apps",
    defaultInstallId: "private-site",
    description: "Workspace-linked public Site package.",
    label: "Private Site",
    packageAppKey: "private-site",
    packageRevision: 7,
    publicRouteBase: "/sites",
    seedRecordsKey: "private-site",
    seedRecordsLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/seed-records.json",
    },
    sourceOrigin: "workspace",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    sourceSchemaKey: "private-site",
    sourceSchemaLocation: {
      kind: "workspace",
      key: "private-site",
      path: "source/schema.json",
    },
    supportsMultipleInstalls: false,
  };
}

function appInstall(input: {
  installId: string;
  label: string;
  packageAppKey: "site" | "tasks";
}): AppInstall {
  return {
    adminRoute: `/apps/${input.installId}`,
    createdAt: "2026-05-22T08:00:00.000Z",
    installId: input.installId,
    label: input.label,
    packageAppKey: input.packageAppKey,
    packageRevision: 1,
    registrationPolicy: "closed",
    sourceSchemaHash: bundledSourceSchemaHashFixtures[input.packageAppKey],
    ...(input.packageAppKey === "site"
      ? {
          publicRoute: `/sites/${input.installId}` as `/sites/${string}`,
          publicRoutePrefix: `/sites/${input.installId}/` as `/sites/${string}/`,
        }
      : {}),
    status: "installed",
    updatedAt: "2026-05-22T08:00:00.000Z",
  };
}
