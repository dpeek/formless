import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { instanceControlPlaneClientTarget } from "../../client/app-target.ts";
import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import {
  listInstallableAppPackages,
  type AppInstall,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import { bundledAppPackageResolver } from "../../shared/app-packages.ts";
import {
  instanceControlPlaneSchema,
  type InstanceControlPlaneRouteValues,
} from "@dpeek/formless-instance-control-plane";
import type { StoredRecord } from "@dpeek/formless-storage";
import { bundledSourceSchemaHashFixtures } from "../../shared/upgrade-migrations.ts";
import {
  AccessInvitationRevokeFeedback,
  InstallAppDialogForm,
  InstanceShellRouteView as BaseInstanceShellRouteView,
  WorkspaceOperationProgress,
  displaySafeEntries,
  instanceShellUninitializedWorkspaceInstallState,
  operationPollsAutomatically,
  selectWorkspaceGatewayOperationControls,
  type AccessManagementRouteState,
  type InstanceShellRouteState,
  type WorkspaceGatewayRouteState,
} from "./instance-shell.tsx";
import type {
  IdentityAccessInvitationSummary,
  IdentityAccessManagementSummary,
  IdentityInvitationStatus,
} from "@dpeek/formless-identity-control-plane";
import type {
  WorkspaceGatewayAutoSaveState,
  WorkspaceGatewayOperation,
} from "@dpeek/formless-gateway/client";
import {
  workspaceBrowserOperationControlMetadata,
  workspaceOperationDefinitionForKind,
} from "@dpeek/formless-workspace";
import { HomeRoute } from "./home.tsx";

beforeEach(() => {
  resetClientStore();
});

function renderWithRouter(children: ReactNode, ssrPath = "/") {
  return renderToStaticMarkup(<Router ssrPath={ssrPath}>{children}</Router>);
}

function InstanceShellRouteView(
  props: Omit<ComponentProps<typeof BaseInstanceShellRouteView>, "homeRouteComponent">,
) {
  return <BaseInstanceShellRouteView homeRouteComponent={HomeRoute} {...props} />;
}

describe("instance shell route view", () => {
  it("renders overview app and route management without deployment workflow controls", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
          crm: { installId: "crm", label: "CRM" },
        }}
        state={readyState({
          installs: [
            siteInstall({
              installId: "personal",
              label: "Personal Site",
            }),
          ],
        })}
      />,
    );

    expect(html).toContain("Instance Settings");
    expect(html).toContain('aria-label="Instance navigation"');
    expect(html).toContain('aria-label="Open Instance Settings"');
    expect(html).toContain('aria-label="Open Access"');
    expect(html).toContain('href="/access"');
    expect(html).toContain('aria-label="Open Personal Site admin"');
    expect(html).toContain('aria-label="Open Personal Site public Site"');
    expect(html).toContain('data-formless-control-plane-screen="apps"');
    expect(html).toContain('data-formless-control-plane-screen="routes"');
    expect(html).toContain("Loading Instance control plane");
    expect(html).not.toContain("Overview");
    expect(html).not.toContain("Deployments");
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain('data-formless-control-plane-screen="deployments"');
    expect(html).not.toContain('data-formless-deployment-setup-progress="true"');
    expect(html).not.toContain('data-formless-deployment-config-summary="true"');
    expect(html).not.toContain('data-formless-deployment-operation-status="true"');
    expect(html).not.toContain('data-formless-deployment-desired-state="true"');
    expect(html).not.toContain("Deployment setup and progress");
    expect(html).not.toContain("Desired state");
    expect(html).not.toContain("desired-state.instance.primary.3");
    expect(html).not.toContain("Status deployed");
    expect(html).not.toContain("Refresh deploy");
    expect(html).not.toContain("Plan deploy");
    expect(html).not.toContain("Apply deploy");
    expect(html).not.toContain("Control-plane deployment records");
    expect(html).not.toContain("Route provider state");
    expect(html).not.toContain("No provider evidence.");
    expect(html).not.toContain("Delete provider");
    expect(html).not.toContain("Mark manually removed");
    expect(html).not.toContain("Refresh plan");
    expect(html).not.toContain("Custom domains");
    expect(html).not.toContain("No custom domains.");
    expect(html).not.toContain("Add redirect");
    expect(html).not.toContain('data-formless-access-management="true"');
    expect(html).not.toContain("Installed apps");
    expect(html).not.toContain("Bundled apps");
    expect(html).not.toContain("Public website app backed by the bundled Site schema");
    expect(html).not.toContain("Task tracking app backed by the bundled Tasks schema");
  });

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
      expect(html).toContain('aria-label="Open Access"');
      expect(html).toContain('data-current="true"');
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

  it("renders overview route management without deployment target grouping", () => {
    applyBootstrapResponse(
      {
        cursor: 1,
        records: [routeRecord({ deploymentConfig: "instance.primary" })],
        schema: instanceControlPlaneSchema,
        schemaUpdatedAt: "2026-06-10T00:00:00.000Z",
      },
      instanceControlPlaneClientTarget(),
    );

    const html = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({ installs: [siteInstall({ installId: "site", label: "Site" })] })}
      />,
    );

    expect(html).toContain('data-formless-control-plane-screen="routes"');
    expect(html).toContain("Routes");
    expect(html).toContain("Create Route");
    expect(html).toContain('data-formless-table-operation-labels="Edit route"');
    expect(html).not.toContain("Routes by deployment config");
    expect(html).not.toContain("Deployment config");
    expect(html).not.toContain("Primary deployment target");
  });

  it("renders only the local workspace push control without onboarding state", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({ installs: [] })}
        workspaceGatewayState={workspaceGatewayState({
          currentOperation: workspaceOperation({
            operation: "status",
            result: {
              summary: {
                fields: { initialized: true },
                title: "Workspace status",
              },
            },
            summary: {
              fields: { initialized: true },
              title: "Workspace status",
            },
          }),
        })}
      />,
    );

    expect(html).toContain('data-formless-workspace-gateway="local"');
    expect(html).toContain('data-formless-workspace-operation-controls="true"');
    expect(html).toContain('data-formless-workspace-operation-control="push"');
    expect(html).toContain('data-formless-workspace-operation-bootstrap-allowed="false"');
    expect(html).toContain('data-formless-workspace-operation-mode="write"');
    expect(html).toContain(
      'data-formless-workspace-operation-required-capability="workspace-source-sync"',
    );
    expect(html).toContain('data-formless-workspace-operation-input-fields="dryRun targetAlias"');
    expect(html).not.toContain('data-formless-workspace-operation-control="check"');
    expect(html).not.toContain('data-formless-workspace-operation-control="credentialSetup"');
    expect(html).not.toContain('data-formless-workspace-operation-control="pull"');
    expect(html).not.toContain('data-formless-workspace-operation-control="deploymentRefresh"');
    expect(html).not.toContain('data-formless-workspace-operation-control="deployPlan"');
    expect(html).not.toContain('data-formless-workspace-operation-control="deployApply"');
    expect(html).not.toContain('data-formless-workspace-operation-control="save"');
    expect(html).not.toContain('data-formless-workspace-onboarding="local"');
    expect(html).not.toContain('data-formless-onboarding-generated-record-controls="routes"');
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain("No package apps are installed.");
    expect(html).not.toContain("Install first app");
    expect(html).not.toContain("Workspace status");
    expect(html).not.toContain("Workspace source has not been created.");
    expect(html).not.toContain("Initialize workspace");
    expect(html).toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain("workspacePath");
    expect(html).not.toContain("/Users/");
  });

  it("does not render local workspace auto-save states on the overview", () => {
    const states: Array<[WorkspaceGatewayAutoSaveState["displayState"], string]> = [
      ["clean", "Workspace source has no pending local writes."],
      ["dirty", "Local writes are waiting for workspace save."],
      ["queued", "Workspace save is queued."],
      ["saving", "Workspace save is running."],
      ["saved", "Workspace source is saved."],
      ["failed", "Workspace save failed after 2 attempts."],
    ];

    for (const [displayState, detail] of states) {
      const html = renderWithRouter(
        <InstanceShellRouteView
          onStartWorkspaceOperation={() => undefined}
          state={readyState({ installs: [] })}
          workspaceGatewayState={workspaceGatewayState({
            autoSave: autoSaveState(
              displayState === "failed"
                ? {
                    dirtyGeneration: 2,
                    displayState,
                    error: {
                      at: "2026-06-16T03:45:01.000Z",
                      message:
                        'Failed at /Users/dpeek/workspace with CLOUDFLARE_API_TOKEN="secret-token" and owner setup token owner-token.',
                    },
                    retryCount: 2,
                    writeSources: ["schema-save"],
                  }
                : {
                    dirtyGeneration: displayState === "clean" ? 0 : 1,
                    displayState,
                    ...(displayState === "saved"
                      ? { lastSavedAt: "2026-06-16T03:45:00.000Z" }
                      : {}),
                    writeSources:
                      displayState === "dirty" || displayState === "queued" ? ["schema-save"] : [],
                  },
            ),
            csrfToken: "csrf-token",
          })}
        />,
      );

      expect(html).not.toContain('data-formless-workspace-auto-save-status="true"');
      expect(html).not.toContain(`data-formless-workspace-auto-save-state="${displayState}"`);
      expect(html).not.toContain(detail);
    }

    const failedHtml = renderWithRouter(
      <InstanceShellRouteView
        onStartWorkspaceOperation={() => undefined}
        state={readyState({ installs: [] })}
        workspaceGatewayState={workspaceGatewayState({
          autoSave: autoSaveState({
            dirtyGeneration: 2,
            displayState: "failed",
            error: {
              at: "2026-06-16T03:45:01.000Z",
              message:
                'Failed at /Users/dpeek/workspace with CLOUDFLARE_API_TOKEN="secret-token" and owner setup token owner-token.',
            },
            retryCount: 2,
            writeSources: ["schema-save"],
          }),
          csrfToken: "csrf-token",
        })}
      />,
    );

    expect(failedHtml).not.toContain("Sources: Schema save");
    expect(failedHtml).not.toContain('data-formless-workspace-auto-save-control="manual-save"');
    expect(failedHtml).not.toContain("Save now");
    expect(failedHtml).not.toContain('data-formless-workspace-auto-save-control="retry"');
    expect(failedHtml).not.toContain("Retry save");
    expect(failedHtml).not.toContain("&lt;path&gt;");
    expect(failedHtml).not.toContain("[redacted]");
    expect(failedHtml).not.toContain("/Users/dpeek");
    expect(failedHtml).not.toContain("secret-token");
    expect(failedHtml).not.toContain("owner-token");
  });

  it("uses fetched active registry packages for uninitialized workspace install state", () => {
    const privateSite = privateSitePackage();
    const { state } = instanceShellUninitializedWorkspaceInstallState({
      installs: [],
      packages: [privateSite],
    });
    const html = renderToStaticMarkup(
      <InstallAppDialogForm
        state={state}
        installDrafts={{ "private-site": { installId: "private-site", label: "Private Site" } }}
      />,
    );

    expect(state.installs).toEqual([]);
    expect(state.packages).toEqual([privateSite]);
    expect(state.packages[0]).toMatchObject({
      packageAppKey: "private-site",
      publicRouteBase: "/sites",
      sourceOrigin: "workspace",
    });
    expect(html).toContain("Private Site");
    expect(html).toContain("Workspace-linked public Site package.");
    expect(html).toContain("Install Private Site");
    expect(html).not.toContain("Public website app backed by the bundled Site schema");
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

  it("keeps workspace gateway controls unavailable without proxy status", () => {
    const html = renderWithRouter(<InstanceShellRouteView state={readyState({ installs: [] })} />);

    expect(html).not.toContain('data-formless-workspace-gateway="local"');
    expect(html).not.toContain('href="/deployments"');
    expect(html).not.toContain('data-formless-workspace-operation-controls="true"');
    expect(html).not.toContain("Initialize workspace");
    expect(html).not.toContain("Refresh deploy");
    expect(html).not.toContain("Plan deploy");
    expect(html).not.toContain("Apply deploy");
  });

  it("renders compact push completion and failure feedback without sidecar internals", () => {
    const succeededHtml = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({ installs: [siteInstall({ installId: "site", label: "Site" })] })}
        workspaceGatewayState={workspaceGatewayState({
          activeOperationId: "op_push_00000001",
          csrfToken: "csrf-token",
          currentOperation: workspaceOperation({
            id: "op_push_00000001",
            operation: "push",
            result: {
              deployment: {
                desiredStateVersion: "desired.instance.primary.3",
                expectedUrl: "https://personal.dpeek.workers.dev",
                providerToken: "secret-provider-token",
              },
              summary: {
                fields: {
                  provider: "cloudflare",
                  proxyToken: "sidecar-proxy-token",
                  status: "running",
                },
                title: "Workspace push planned",
              },
            },
            status: "succeeded",
            summary: {
              fields: {
                provider: "cloudflare",
                proxyToken: "sidecar-proxy-token",
                status: "running",
              },
              title: "Workspace push planned",
            },
          }),
        })}
      />,
    );
    const failedHtml = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({ installs: [siteInstall({ installId: "site", label: "Site" })] })}
        workspaceGatewayState={workspaceGatewayState({
          activeOperationId: "op_push_00000002",
          currentOperation: workspaceOperation({
            errors: [
              {
                at: "2026-06-02T00:00:02.000Z",
                message:
                  'Failed at /Users/dpeek/workspace with CLOUDFLARE_API_TOKEN="secret-token".',
              },
            ],
            id: "op_push_00000002",
            operation: "push",
            status: "failed",
            summary: {
              fields: {
                workspace: "/Users/dpeek/workspace",
              },
              title: "Workspace push failed",
            },
          }),
          error:
            'Failed at /Users/dpeek/workspace with CLOUDFLARE_API_TOKEN="secret-token" and owner setup token owner-token.',
        })}
      />,
    );

    expect(succeededHtml).toContain('data-formless-workspace-gateway="local"');
    expect(succeededHtml).toContain('data-formless-workspace-operation-controls="true"');
    expect(succeededHtml).toContain('data-formless-workspace-operation-feedback="true"');
    expect(succeededHtml).toContain("Workspace source push succeeded");
    expect(succeededHtml).not.toContain('data-formless-workspace-operation-progress="true"');
    expect(succeededHtml).not.toContain("Workspace push planned");
    expect(succeededHtml).not.toContain("Provider details");
    expect(succeededHtml).not.toContain("desired.instance.primary.3");
    expect(succeededHtml).not.toContain("https://personal.dpeek.workers.dev");
    expect(succeededHtml).not.toContain('data-formless-deployment-gateway="local"');
    expect(succeededHtml).not.toContain('data-formless-deployment-operation-controls="true"');
    expect(succeededHtml).not.toContain('href="/deployments"');
    expect(succeededHtml).not.toContain("secret-provider-token");
    expect(succeededHtml).not.toContain("sidecar-proxy-token");
    expect(succeededHtml).not.toContain("http://127.0.0.1:7777");

    expect(failedHtml).toContain('data-formless-workspace-operation-feedback="true"');
    expect(failedHtml).toContain("&lt;path&gt;");
    expect(failedHtml).toContain("[redacted]");
    expect(failedHtml).not.toContain('data-formless-workspace-operation-progress="true"');
    expect(failedHtml).not.toContain("secret-token");
    expect(failedHtml).not.toContain("owner-token");
  });

  it("polls only queued or running workspace operations automatically", () => {
    expect(operationPollsAutomatically(workspaceOperation({ status: "queued" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "running" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "succeeded" }))).toBe(false);
    expect(operationPollsAutomatically(workspaceOperation({ status: "failed" }))).toBe(false);
  });

  it("keeps generated record editors mounted without first app onboarding", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({ installs: [] })}
        workspaceGatewayState={workspaceGatewayState({
          csrfToken: "csrf-token",
          currentOperation: workspaceOperation({
            operation: "status",
            result: {
              summary: {
                fields: { initialized: true },
                title: "Workspace status",
              },
            },
            summary: {
              fields: { initialized: true },
              title: "Workspace status",
            },
          }),
        })}
      />,
    );

    expect(html).toContain('data-formless-control-plane-screen="routes"');
    expect(html).not.toContain('data-formless-control-plane-screen="deployments"');
    expect(html).not.toContain("Install first app");
    expect(html).not.toContain('data-formless-onboarding-generated-record-controls="routes"');
    expect(html).not.toContain("Owner setup");
    expect(html).not.toContain("passkey");
    expect(html).not.toContain("Initialize workspace");
  });

  it("renders display-safe operation progress without raw paths or credentials", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperationProgress
        operation={workspaceOperation({
          errors: [
            {
              at: "2026-06-02T00:00:02.000Z",
              message:
                'Failed at /Users/dpeek/workspace with CLOUDFLARE_API_TOKEN="secret" and Bearer abc123',
            },
          ],
          logs: [
            {
              at: "2026-06-02T00:00:01.000Z",
              id: "log-1",
              level: "info",
              message: "Read /Users/dpeek/workspace/records safely.",
            },
          ],
          operation: "save",
          result: {
            details: {
              rawAdapterOutput: "token leaked",
              source: "/Users/dpeek/workspace/archives/instance",
            },
            summary: {
              fields: {
                token: "secret-token",
                workspace: "/Users/dpeek/workspace",
              },
              title: "Workspace saved",
            },
          },
          summary: {
            fields: {
              token: "secret-token",
              workspace: "/Users/dpeek/workspace",
            },
            title: "Workspace saved",
          },
        })}
      />,
    );

    expect(html).toContain("Workspace saved");
    expect(html).toContain("&lt;path&gt;");
    expect(html).toContain("[redacted]");
    expect(html).not.toContain("/Users/dpeek");
    expect(html).not.toContain("secret-token");
    expect(html).not.toContain("token leaked");
    expect(html).not.toContain("Bearer abc123");
  });

  it("keeps instance shell redaction as rendered fallback around display-safe operation state", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperationProgress
        error="Refresh failed at /Users/dpeek/workspace with owner setup token owner-token and Bearer browser-token."
        operation={workspaceOperation({
          logs: [
            {
              at: "2026-06-02T00:00:01.000Z",
              id: "log-1",
              level: "info",
              message: "Saved TOKEN=[redacted] from <workspace>/records.",
            },
          ],
          operation: "push",
          result: {
            deployment: {
              providerStatePayload: "[redacted]",
            },
            summary: {
              fields: {
                providerStatePayload: "[redacted]",
                workspace: "<workspace>",
              },
              title: "Workspace push applied",
            },
          },
          status: "failed",
          summary: {
            fields: {
              providerStatePayload: "[redacted]",
              workspace: "<workspace>",
            },
            title: "Workspace push failed",
          },
        })}
      />,
    );

    expect(html).toContain("Workspace push failed");
    expect(html).toContain("Provider State Payload");
    expect(html).toContain("[redacted]");
    expect(html).toContain("&lt;workspace&gt;");
    expect(html).toContain("&lt;path&gt;");
    expect(html).not.toContain("/Users/dpeek");
    expect(html).not.toContain("owner-token");
    expect(html).not.toContain("browser-token");
  });

  it("renders ordered push steps and health check failure diagnostics", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperationProgress
        operation={workspaceOperation({
          errors: [
            {
              at: "2026-06-02T00:00:02.000Z",
              message: "Health check failed for https://personal.dpeek.workers.dev.",
            },
          ],
          operation: "push",
          status: "failed",
          steps: [
            {
              fields: { source: "local" },
              id: "credentials",
              label: "Credentials",
              status: "succeeded",
            },
            {
              fields: { cloudflareAccountId: "account-123" },
              id: "account-selection",
              label: "Account selection",
              status: "succeeded",
            },
            {
              fields: {
                expectedUrl: "https://personal.dpeek.workers.dev",
                providerToken: "secret-provider-token",
                retryGuidance: "Retry push after provider propagation.",
              },
              id: "health-check",
              label: "Health check",
              status: "failed",
            },
          ],
          summary: {
            fields: {
              currentStep: "Health check",
              expectedUrl: "https://personal.dpeek.workers.dev",
              retryGuidance: "Retry push after provider propagation.",
            },
            title: "Operation failed",
          },
        })}
      />,
    );

    expect(html).toContain('data-formless-workspace-operation-steps="true"');
    expect(html).toContain('data-formless-workspace-operation-step="credentials"');
    expect(html).toContain('data-formless-workspace-operation-step="health-check"');
    expect(html).toContain("Credentials");
    expect(html).toContain("Account selection");
    expect(html).toContain("Health check");
    expect(html).toContain("Failed");
    expect(html).toContain("Expected Url");
    expect(html).toContain("https://personal.dpeek.workers.dev");
    expect(html).toContain("Retry push after provider propagation.");
    expect(html).toContain("[redacted]");
    expect(html).not.toContain("secret-provider-token");
  });

  it("renders external authorization URL prompts from gateway events", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperationProgress
        operation={workspaceOperation({
          events: [
            {
              at: "2026-06-02T00:00:02.000Z",
              id: "event-1",
              profileLabel: "Local Cloudflare",
              provider: "cloudflare",
              status: "waiting",
              type: "externalAuthorizationUrl",
              url: "https://dash.cloudflare.com/oauth/authorize?client_id=formless",
            },
          ],
          operation: "credentialSetup",
          status: "running",
          summary: {
            fields: { provider: "cloudflare" },
            title: "Credential setup started",
          },
        })}
      />,
    );

    expect(html).toContain('data-formless-workspace-auth-url-events="true"');
    expect(html).toContain("Cloudflare authorization");
    expect(html).toContain("Local Cloudflare");
    expect(html).toContain("Open authorization");
    expect(html).not.toContain("token=");
    expect(html).not.toContain("secret=");
  });

  it("keeps display-safe field rendering reusable for operation summaries", () => {
    expect(
      displaySafeEntries({
        providerStatePayload: { token: "secret" },
        recordCount: 3,
        source: "/Users/dpeek/workspace/records",
      }),
    ).toEqual([
      { key: "providerStatePayload", label: "Provider State Payload", value: "[redacted]" },
      { key: "recordCount", label: "Record Count", value: "3" },
      { key: "source", label: "Source", value: "<path>" },
    ]);
  });

  it("renders the install dialog with an app type switcher", () => {
    const html = renderToStaticMarkup(
      <InstallAppDialogForm
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
          crm: { installId: "crm", label: "CRM" },
        }}
        state={readyState({
          installs: [],
        })}
      />,
    );

    expect(html).toContain("Install app");
    expect(html).toContain('aria-label="Install app type"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("Site");
    expect(html).toContain("Tasks");
    expect(html).toContain("CRM");
    expect(html).toContain("Public website app backed by the bundled Site schema");
    expect(html).toContain("Install Site");
    expect(html).toContain('value="Docs Site"');
    expect(html).toContain('value="docs"');
    expect(html).not.toContain('value="Task Space"');
    expect(html).not.toContain('value="CRM"');
    expect(html).not.toContain('value="crm"');
  });

  it("renders CRM package defaults in the install dialog when CRM is selected", () => {
    const packages = listInstallableAppPackages(bundledAppPackageResolver);
    const crmPackage = packages.find((appPackage) => appPackage.packageAppKey === "crm");

    if (!crmPackage) {
      throw new Error("Missing bundled CRM package.");
    }

    const html = renderToStaticMarkup(
      <InstallAppDialogForm
        state={readyState({
          installs: [],
          packages: [crmPackage, ...packages.filter((appPackage) => appPackage !== crmPackage)],
        })}
      />,
    );

    expect(html).toContain("Site");
    expect(html).toContain("Tasks");
    expect(html).toContain("CRM");
    expect(html).toContain("CRM app backed by the bundled CRM schema and demo records.");
    expect(html).toContain("Install CRM");
    expect(html).toContain('value="CRM"');
    expect(html).toContain('value="crm"');
  });

  it("renders install errors in the dialog with generated app management mounted", () => {
    const viewHtml = renderWithRouter(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "personal", label: "Other Site" },
        }}
        state={readyState({
          installError: 'Install id "personal" is already installed.',
          installErrorPackageAppKey: "site",
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
    );
    const dialogHtml = renderToStaticMarkup(
      <InstallAppDialogForm
        installDrafts={{
          site: { installId: "personal", label: "Other Site" },
        }}
        state={readyState({
          installError: 'Install id "personal" is already installed.',
          installErrorPackageAppKey: "site",
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
        })}
      />,
    );

    expect(viewHtml).toContain('data-formless-control-plane-screen="apps"');
    expect(dialogHtml).toContain('role="alert"');
    expect(dialogHtml).toContain("already installed");
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

function workspaceGatewayState(
  overrides: Partial<Extract<WorkspaceGatewayRouteState, { status: "ready" }>> = {},
): Extract<WorkspaceGatewayRouteState, { status: "ready" }> {
  const fallbackStatusOperation = workspaceOperation({ operation: "status" });
  const currentOperation =
    overrides.currentOperation ?? overrides.statusOperation ?? fallbackStatusOperation;
  const statusOperation =
    overrides.statusOperation ??
    (currentOperation.operation === "status" ? currentOperation : fallbackStatusOperation);

  return {
    currentOperation,
    status: "ready",
    statusOperation,
    ...overrides,
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

function autoSaveState(
  overrides: Partial<WorkspaceGatewayAutoSaveState> = {},
): WorkspaceGatewayAutoSaveState {
  return {
    dirtyGeneration: 0,
    displayState: "clean",
    kind: "formless.workspaceAutoSaveState",
    retryCount: 0,
    savedGeneration: 0,
    storageIdentities: [],
    updatedAt: "2026-06-16T03:45:00.000Z",
    version: 1,
    writeSources: [],
    ...overrides,
  };
}

function routeRecord(overrides: Partial<InstanceControlPlaneRouteValues> = {}): StoredRecord {
  const now = "2026-06-10T00:00:00.000Z";
  const values = {
    access: "anonymous",
    appInstall: "site",
    enabled: true,
    kind: "mount",
    matchPath: "/sites/site",
    surface: "public-site",
    targetProfile: "public-site",
    ...overrides,
  } satisfies InstanceControlPlaneRouteValues;

  return {
    createdAt: now,
    updatedAt: now,
    entity: "route",
    id: "route:site:public",
    values,
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
