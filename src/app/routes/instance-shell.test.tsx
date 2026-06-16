import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { Router } from "wouter";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { instanceControlPlaneClientTarget } from "../../client/app-target.ts";
import { applyBootstrapResponse, resetClientStore } from "../../client/store.ts";
import {
  listInstallableAppPackages,
  type AppInstall,
  type InstallableAppPackage,
} from "../../shared/app-installs.ts";
import type { InstanceDeploymentDesiredStateResponse } from "../../shared/deployment-runtime.ts";
import {
  instanceControlPlaneSchema,
  type InstanceControlPlaneDeploymentConfigValues,
} from "../../shared/instance-control-plane.ts";
import type { StoredRecord } from "../../shared/protocol.ts";
import { bundledSourceSchemaHashFixtures } from "../../shared/upgrade-migrations.ts";
import {
  InstallAppDialogForm,
  InstanceShellRouteView,
  WorkspaceOperationProgress,
  displaySafeEntries,
  instanceShellUninitializedWorkspaceInstallState,
  operationPollsAutomatically,
  selectWorkspaceGatewayOperationControls,
  workspaceGatewayStartInputFromDefinition,
  workspaceOperationRefreshesDeploymentRuntime,
  type InstanceShellRouteState,
  type WorkspaceGatewayRouteState,
} from "./instance-shell.tsx";
import type {
  WorkspaceGatewayAutoSaveState,
  WorkspaceGatewayOperation,
} from "@dpeek/formless-gateway/client";
import { workspaceOperationDefinitionForKind } from "@dpeek/formless-workspace";

beforeEach(() => {
  resetClientStore();
});

function renderWithRouter(children: ReactNode, ssrPath = "/") {
  return renderToStaticMarkup(<Router ssrPath={ssrPath}>{children}</Router>);
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

    expect(html).toContain('data-formless-control-plane-screen="apps"');
    expect(html).toContain('data-formless-control-plane-screen="routes"');
    expect(html).toContain("Loading Instance control plane");
    expect(html).toContain("Route provider state");
    expect(html).toContain("No provider evidence.");
    expect(html).toContain("Deployments");
    expect(html).not.toContain('data-formless-control-plane-screen="deployments"');
    expect(html).not.toContain('data-formless-deployment-setup-progress="true"');
    expect(html).not.toContain("Deployment setup and progress");
    expect(html).not.toContain("Refresh deploy");
    expect(html).not.toContain("Plan deploy");
    expect(html).not.toContain("Apply deploy");
    expect(html).not.toContain("Control-plane deployment records");
    expect(html).not.toContain("Custom domains");
    expect(html).not.toContain("No custom domains.");
    expect(html).not.toContain("Add redirect");
    expect(html).not.toContain("Installed apps");
    expect(html).not.toContain("Bundled apps");
    expect(html).not.toContain("Public website app backed by the bundled Site schema");
    expect(html).not.toContain("Task tracking app backed by the bundled Tasks schema");
  });

  it("renders deployments from config observations, desired state, and gateway status", () => {
    applyBootstrapResponse(
      {
        cursor: 1,
        records: [
          deploymentConfigRecord({
            accountId: "account-123",
            credentialRef: "cloudflare:local",
            label: "Primary Cloudflare",
            observedAt: "2026-06-10T00:02:00.000Z",
            observedDesiredStateHash:
              "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            observedRunnerId: "local-gateway",
            observedStatus: "deployed",
            observedSummary: "Deployed revision 3",
            targetUrl: "https://personal.dpeek.workers.dev",
            workerName: "personal-worker",
          }),
        ],
        schema: instanceControlPlaneSchema,
        schemaUpdatedAt: "2026-06-10T00:00:00.000Z",
      },
      instanceControlPlaneClientTarget(),
    );

    const html = renderWithRouter(
      <InstanceShellRouteView
        currentPath="/deployments"
        state={readyState({
          deploymentDesiredState: deploymentDesiredStateResponse(),
          deploymentStatus: {
            status: {
              attemptId: "attempt.11111111-1111-4111-8111-111111111111",
              checkedAt: "2026-06-10T00:00:00.000Z",
              desiredState: {
                hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                revision: 3,
                targetId: "instance.primary",
                versionId: "desired-state.instance.primary.3",
              },
              mode: "plan",
              startedAt: "2026-06-10T00:00:00.000Z",
              state: "in-progress",
              targetId: "instance.primary",
              actor: { actorId: "browser", kind: "runner", displayName: "Owner" },
            },
            target: {
              kind: "instance",
              label: "Primary instance target",
              targetId: "instance.primary",
            },
          },
          installs: [siteInstall({ installId: "site", label: "Site" })],
        })}
        workspaceGatewayState={workspaceGatewayState({
          currentOperation: workspaceOperation({
            operation: "deployPlan",
            status: "running",
            summary: {
              fields: { desiredStateVersion: "desired-state.instance.primary.3" },
              title: "Deploy planning",
            },
          }),
        })}
      />,
      "/deployments",
    );

    expect(html).toContain('data-formless-deployment-setup-progress="true"');
    expect(html).toContain('data-formless-deployment-config-summary="true"');
    expect(html).toContain('data-formless-deployment-operation-status="true"');
    expect(html).toContain('data-formless-deployment-desired-state="true"');
    expect(html).toContain('data-formless-deployment-gateway="local"');
    expect(html).toContain('data-formless-deployment-config-management="secondary"');
    expect(html).toContain("Enabled 1/1");
    expect(html).toContain("Primary Cloudflare");
    expect(html).toContain("https://personal.dpeek.workers.dev");
    expect(html).toContain("Cloudflare · Account account-123");
    expect(html).toContain("personal-worker");
    expect(html).toContain("cloudflare:local");
    expect(html).toContain("Status deployed");
    expect(html).toContain("Deployed revision 3");
    expect(html).toContain("local-gateway");
    expect(html).toContain("In progress · Plan revision 3 by Owner");
    expect(html).toContain("Revision 3");
    expect(html).toContain("desired-state.instance.primary.3");
    expect(html).toContain("Desired-state hash");
    expect(html).toContain("Cloudflare worker custom domain 1");
    expect(html).toContain("Gateway");
    expect(html).toContain("Deployment plan · Running");
    expect(html).not.toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain('data-formless-control-plane-screen="routes"');
    expect(html).not.toContain("deploy-target");
    expect(html).not.toContain("provider-config-ref");
    expect(html).not.toContain("deploy-desired-resource");
  });

  it("renders local workspace gateway controls and browser onboarding state", () => {
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
    expect(html).toContain('data-formless-workspace-operation-control="save"');
    expect(html).toContain('data-formless-workspace-operation-control="check"');
    expect(html).toContain('data-formless-workspace-operation-control="pull"');
    expect(html).toContain('data-formless-workspace-operation-control="push"');
    expect(html).toContain('data-formless-workspace-operation-input-fields="check"');
    expect(html).toContain(
      'data-formless-workspace-operation-input-fields="allowStale apply replace replaceInstallSet targetAlias"',
    );
    expect(html).not.toContain('data-formless-workspace-operation-control="credentialSetup"');
    expect(html).not.toContain('data-formless-workspace-operation-control="deploymentRefresh"');
    expect(html).not.toContain('data-formless-workspace-operation-control="deployPlan"');
    expect(html).not.toContain('data-formless-workspace-operation-control="deployApply"');
    expect(html).toContain('data-formless-workspace-onboarding="local"');
    expect(html).toContain('data-formless-onboarding-generated-record-controls="routes"');
    expect(html).toContain("No package apps are installed.");
    expect(html).toContain("Install first app");
    expect(html).not.toContain("Workspace source has not been created.");
    expect(html).not.toContain("Initialize workspace");
    expect(html).toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain("workspacePath");
    expect(html).not.toContain("/Users/");
  });

  it("renders local workspace auto-save states with manual save and retry controls", () => {
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

      expect(html).toContain('data-formless-workspace-auto-save-status="true"');
      expect(html).toContain(`data-formless-workspace-auto-save-state="${displayState}"`);
      expect(html).toContain(detail);
    }

    const dirtyHtml = renderWithRouter(
      <InstanceShellRouteView
        onStartWorkspaceOperation={() => undefined}
        state={readyState({ installs: [] })}
        workspaceGatewayState={workspaceGatewayState({
          autoSave: autoSaveState({
            dirtyGeneration: 1,
            displayState: "dirty",
            writeSources: ["schema-save"],
          }),
          csrfToken: "csrf-token",
        })}
      />,
    );
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

    expect(dirtyHtml).toContain('data-formless-workspace-auto-save-control="manual-save"');
    expect(dirtyHtml).toContain("Save now");
    expect(dirtyHtml).toContain("Sources: Schema save");
    expect(failedHtml).toContain('data-formless-workspace-auto-save-control="retry"');
    expect(failedHtml).toContain("Retry save");
    expect(failedHtml).toContain("&lt;path&gt;");
    expect(failedHtml).toContain("[redacted]");
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
      "deploymentRefresh",
      "deployApply",
      "deployPlan",
      "pull",
      "push",
      "save",
    ]);
    expect(
      selectWorkspaceGatewayOperationControls({ operationGroup: "workspace" }).map(
        (control) => control.kind,
      ),
    ).toEqual(["check", "pull", "push", "save"]);
    expect(
      selectWorkspaceGatewayOperationControls({ operationGroup: "deployment" }).map(
        (control) => control.kind,
      ),
    ).toEqual(["credentialSetup", "deploymentRefresh", "deployApply", "deployPlan"]);
    expect(
      selectWorkspaceGatewayOperationControls({
        runtime: { actor: "browser", capabilities: ["deployment-plan"] },
      }).map((control) => control.kind),
    ).toEqual(["deployPlan"]);
  });

  it("builds browser operation requests from definition-declared gateway fields", () => {
    const controls = selectWorkspaceGatewayOperationControls();

    expect(Object.fromEntries(controls.map((control) => [control.kind, control.input]))).toEqual({
      check: { kind: "check" },
      credentialSetup: { kind: "credentialSetup", provider: "cloudflare" },
      deploymentRefresh: { kind: "deploymentRefresh" },
      deployApply: { kind: "deployApply" },
      deployPlan: { kind: "deployPlan" },
      pull: { kind: "pull" },
      push: {
        allowStale: false,
        apply: false,
        kind: "push",
        replace: false,
        replaceInstallSet: false,
      },
      save: { check: false, kind: "save" },
    });

    for (const control of controls) {
      const definition = workspaceOperationDefinitionForKind(control.kind);

      if (!("gateway" in definition.bindings)) {
        throw new Error(`Expected gateway binding for ${control.kind}.`);
      }

      const allowedFields = new Set(["kind", ...definition.bindings.gateway.inputFields]);

      expect(Object.keys(control.input).every((key) => allowedFields.has(key))).toBe(true);
      expect(control.inputFields).toEqual(definition.bindings.gateway.inputFields);
      expect(Object.keys(control.input)).not.toContain("workspacePath");
      expect(Object.keys(control.input)).not.toContain("source");
    }

    expect(
      workspaceGatewayStartInputFromDefinition(workspaceOperationDefinitionForKind("save")),
    ).toEqual({ check: false, kind: "save" });
  });

  it("keeps workspace gateway controls unavailable without proxy status", () => {
    const html = renderWithRouter(<InstanceShellRouteView state={readyState({ installs: [] })} />);

    expect(html).not.toContain('data-formless-workspace-gateway="local"');
    expect(html).not.toContain('data-formless-workspace-operation-controls="true"');
    expect(html).not.toContain("Initialize workspace");
    expect(html).not.toContain("Refresh deploy");
    expect(html).not.toContain("Plan deploy");
    expect(html).not.toContain("Apply deploy");
  });

  it("renders gateway proxy status and pollable operation progress without sidecar internals", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        currentPath="/deployments"
        state={readyState({ installs: [siteInstall({ installId: "site", label: "Site" })] })}
        workspaceGatewayState={workspaceGatewayState({
          activeOperationId: "op_deploy_plan_00000001",
          csrfToken: "csrf-token",
          currentOperation: workspaceOperation({
            id: "op_deploy_plan_00000001",
            operation: "deployPlan",
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
                title: "Deploy planning",
              },
            },
            status: "running",
            summary: {
              fields: {
                provider: "cloudflare",
                proxyToken: "sidecar-proxy-token",
                status: "running",
              },
              title: "Deploy planning",
            },
          }),
        })}
      />,
      "/deployments",
    );

    expect(html).toContain('data-formless-deployment-gateway="local"');
    expect(html).toContain('data-formless-deployment-operation-controls="true"');
    expect(html).toContain('data-formless-workspace-operation-progress="true"');
    expect(html).toContain("Deploy planning");
    expect(html).toContain("Deployment plan");
    expect(html).toContain("Running");
    expect(html).toContain("desired.instance.primary.3");
    expect(html).toContain("https://personal.dpeek.workers.dev");
    expect(html).toContain("[redacted]");
    expect(html).not.toContain("secret-provider-token");
    expect(html).not.toContain("sidecar-proxy-token");
    expect(html).not.toContain("http://127.0.0.1:7777");
  });

  it("keeps deployment entry points available without installed apps", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        currentPath="/deployments"
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
      "/deployments",
    );

    expect(html).toContain('data-formless-deployment-gateway="local"');
    expect(html).toContain('data-formless-workspace-operation-control="credentialSetup"');
    expect(html).toContain('data-formless-workspace-operation-control="deploymentRefresh"');
    expect(html).toContain('data-formless-workspace-operation-control="deployPlan"');
    expect(html).toContain('data-formless-workspace-operation-control="deployApply"');
    expect(html).toContain(
      'data-formless-workspace-operation-required-capability="deployment-apply"',
    );
    expect(html).toContain("Credential setup");
    expect(html).toContain("Deployment refresh");
    expect(html).toContain("Deployment plan");
    expect(html).toContain("Deployment apply");
    expect(html).toContain('data-formless-control-plane-screen="deployments"');
    expect(html).not.toContain("Install first app");
    expect(html).not.toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain('data-formless-control-plane-screen="routes"');
  });

  it("polls only queued or running workspace operations automatically", () => {
    expect(operationPollsAutomatically(workspaceOperation({ status: "queued" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "running" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "succeeded" }))).toBe(false);
    expect(operationPollsAutomatically(workspaceOperation({ status: "failed" }))).toBe(false);
  });

  it("refreshes deployment runtime display only after mutating observation operations", () => {
    expect(
      workspaceOperationRefreshesDeploymentRuntime(
        workspaceOperation({ operation: "deployApply", status: "succeeded" }),
      ),
    ).toBe(true);
    expect(
      workspaceOperationRefreshesDeploymentRuntime(
        workspaceOperation({ operation: "deploymentRefresh", status: "succeeded" }),
      ),
    ).toBe(true);
    expect(
      workspaceOperationRefreshesDeploymentRuntime(
        workspaceOperation({ operation: "check", status: "succeeded" }),
      ),
    ).toBe(false);
    expect(
      workspaceOperationRefreshesDeploymentRuntime(
        workspaceOperation({ operation: "deployApply", status: "running" }),
      ),
    ).toBe(false);
  });

  it("renders first app onboarding while keeping generated record editors mounted", () => {
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

    expect(html).toContain("Install first app");
    expect(html).toContain('data-formless-control-plane-screen="routes"');
    expect(html).not.toContain('data-formless-control-plane-screen="deployments"');
    expect(html).toContain('data-formless-onboarding-generated-record-controls="routes"');
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

  it("renders ordered deployment steps and health check failure diagnostics", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperationProgress
        operation={workspaceOperation({
          errors: [
            {
              at: "2026-06-02T00:00:02.000Z",
              message: "Health check failed for https://personal.dpeek.workers.dev.",
            },
          ],
          operation: "deployApply",
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
                retryGuidance: "Retry deploy apply after provider propagation.",
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
              retryGuidance: "Retry deploy apply after provider propagation.",
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
    expect(html).toContain("Retry deploy apply after provider propagation.");
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
    const packages = listInstallableAppPackages();
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

  it("renders provider evidence separately from route intent", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
        }}
        state={readyState({
          domainAppliedStates: [
            {
              accountId: "account-123",
              action: "created",
              alchemyResourceId: "primary-custom-domain-dpeek-com-publicsite-personal",
              appliedAt: "2026-05-26T00:00:00.000Z",
              host: "dpeek.com",
              installId: "personal",
              profile: "publicSite",
              provider: "cloudflare-worker-custom-domain",
              surface: "site",
              targetInstallId: "personal",
              updatedAt: "2026-05-26T00:00:00.000Z",
              workerDomainId: "domain-1",
              workerName: "personal",
              zoneId: "zone-1",
              zoneName: "dpeek.com",
            },
          ],
          domainProviderAppliedResources: [
            {
              accountId: "account-123",
              action: "created",
              alchemyResourceId: "primary-redirect-dns-www-example-com",
              appliedAt: "2026-05-27T00:00:00.000Z",
              host: "www.example.com",
              kind: "cloudflare-dns-records",
              logicalId: "primary-redirect-dns-www-example-com",
              resourceId: "dns-1",
              resourceJson: "{}",
              updatedAt: "2026-05-27T00:00:00.000Z",
              zoneId: "zone-1",
              zoneName: "example.com",
            },
          ],
          installs: [
            siteInstall({ installId: "personal", label: "Personal Site" }),
            appInstall({ installId: "tasks", label: "Tasks", packageAppKey: "tasks" }),
          ],
        })}
      />,
    );

    expect(html).toContain('data-formless-control-plane-screen="routes"');
    expect(html).toContain("Route provider state");
    expect(html).toContain("dpeek.com");
    expect(html).toContain("publicSite:personal");
    expect(html).toContain("Applied: personal");
    expect(html).toContain("www.example.com");
    expect(html).toContain("DNS records");
    expect(html).toContain("Personal Site");
    expect(html).toContain("Delete provider");
    expect(html).toContain("Mark manually removed");
    expect(html).not.toContain("Custom domains");
    expect(html).not.toContain("Add redirect");
    expect(html).not.toContain("Forget route");
    expect(html).not.toContain("Route: removed");
  });

  it("renders provider config, plan, blockers, and delete job status", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({
          domainProviderDeleteJob: {
            createdAt: "2026-05-27T00:00:00.000Z",
            jobId: "delete-job-1",
            plan: {
              blockers: [],
              instanceId: "primary",
              policy: "create-only",
              resources: [],
              workerName: "personal",
            },
            result: { evidenceCount: 1 },
            status: "succeeded",
            targets: [],
            updatedAt: "2026-05-27T00:01:00.000Z",
          },
          domainProviderPlan: {
            config: {
              accountId: "account-123",
              alchemyPassword: { configured: true, envNames: ["ALCHEMY_PASSWORD"] },
              cloudflareApiToken: {
                configured: true,
                envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
              },
              deleteReady: true,
              instanceId: "primary",
              issues: [],
              planReady: true,
              runnerMutation: {
                checkedBy: "node-runner",
                requiredEnvNames: [
                  "CLOUDFLARE_API_TOKEN",
                  "CF_API_TOKEN",
                  "ALCHEMY_PASSWORD",
                  "ALCHEMY_STATE_TOKEN",
                ],
              },
              workerName: "personal",
              zones: [{ id: "zone-1", name: "example.com" }],
            },
            plan: {
              blockers: [],
              instanceId: "primary",
              policy: "create-only",
              resources: [
                {
                  host: "www.example.com",
                  kind: "cloudflare-worker-custom-domain",
                  logicalId: "primary-custom-domain-www-example-com-publicsite-site",
                  profile: "publicSite",
                  props: {
                    adopt: false,
                    name: "www.example.com",
                    overrideExistingOrigin: false,
                    workerName: "personal",
                    zoneId: "zone-1",
                  },
                  targetInstallId: "site",
                  zone: { id: "zone-1", name: "example.com" },
                },
                {
                  fromHost: "example.com",
                  kind: "cloudflare-redirect-rule",
                  logicalId: "primary-redirect-rule-example-com",
                  props: {
                    description: "Formless redirect example.com to www.example.com",
                    preserveQueryString: true,
                    requestUrl: "https://example.com/*",
                    statusCode: 301,
                    targetUrl: "https://www.example.com/${1}",
                    zone: "zone-1",
                  },
                  targetUrl: "https://www.example.com/${1}",
                  zone: { id: "zone-1", name: "example.com" },
                },
              ],
              workerName: "personal",
            },
            redirectIntents: [],
          },
          deploymentStatus: {
            status: {
              attemptId: "attempt.11111111-1111-4111-8111-111111111111",
              checkedAt: "2026-05-28T00:00:00.000Z",
              deployedAt: "2026-05-28T00:00:00.000Z",
              latestDesiredState: {
                hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                revision: 2,
                targetId: "instance.primary",
                versionId: "desired-state.instance.primary.2",
              },
              state: "deployed",
              targetId: "instance.primary",
            },
            target: {
              kind: "instance",
              label: "Primary instance target",
              targetId: "instance.primary",
            },
          },
          installs: [siteInstall({ installId: "site", label: "Site" })],
        })}
      />,
    );

    expect(html).toContain("Provider");
    expect(html).toContain("cleanup ready");
    expect(html).toContain("Account account-123");
    expect(html).toContain("Resources 2");
    expect(html).toContain("Blockers none");
    expect(html).toContain("Zones example.com");
    expect(html).toContain("Runner mutation checked by node-runner");
    expect(html).not.toContain("Deployment Deployed");
    expect(html).not.toContain("Revision 2 deployed");
    expect(html).toContain("Delete job: succeeded");
    expect(html).toContain("Refresh plan");
  });

  it("keeps runner secret gaps out of provider config blocker copy", () => {
    const html = renderWithRouter(
      <InstanceShellRouteView
        state={readyState({
          domainProviderPlan: {
            config: {
              alchemyPassword: { configured: false, envNames: ["ALCHEMY_PASSWORD"] },
              cloudflareApiToken: {
                configured: false,
                envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
              },
              deleteReady: true,
              issues: [
                {
                  code: "missing-cloudflare-api-token",
                  envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
                  message: "Cloudflare API token is not configured.",
                },
                {
                  code: "missing-alchemy-password",
                  envNames: ["ALCHEMY_PASSWORD"],
                  message: "Alchemy password is not configured.",
                },
              ],
              planReady: true,
              runnerMutation: {
                checkedBy: "node-runner",
                requiredEnvNames: [
                  "CLOUDFLARE_API_TOKEN",
                  "CF_API_TOKEN",
                  "ALCHEMY_PASSWORD",
                  "ALCHEMY_STATE_TOKEN",
                ],
              },
              zones: [{ id: "zone-1", name: "example.com" }],
            },
            plan: {
              blockers: [],
              instanceId: "primary",
              policy: "create-only",
              resources: [],
              workerName: "personal",
            },
            redirectIntents: [],
          },
          installs: [siteInstall({ installId: "site", label: "Site" })],
        })}
      />,
    );

    expect(html).toContain("cleanup ready");
    expect(html).toContain("Zones example.com");
    expect(html).toContain("Runner mutation checked by node-runner");
    expect(html).not.toContain("Config missing-cloudflare-api-token");
    expect(html).not.toContain("Config blockers missing-cloudflare-api-token");
    expect(html).not.toContain("Config blockers missing-alchemy-password");
  });
});

function readyState(
  overrides: Partial<Extract<InstanceShellRouteState, { status: "ready" }>> = {},
): Extract<InstanceShellRouteState, { status: "ready" }> {
  return {
    domainAppliedStates: [],
    installing: false,
    installs: [siteInstall({ installId: "site", label: "Site" })],
    packages: listInstallableAppPackages(),
    status: "ready",
    ...overrides,
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

function deploymentDesiredStateResponse(): InstanceDeploymentDesiredStateResponse {
  return {
    desiredState: {
      createdAt: "2026-06-10T00:00:00.000Z",
      display: {
        resourceCount: 1,
        resourcesByKind: {
          "cloudflare-dns-records": 0,
          "cloudflare-redirect-rule": 0,
          "cloudflare-worker-custom-domain": 1,
        },
        title: "Instance deployment desired state",
      },
      hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      resourceGraph: {
        resources: [
          {
            dependencies: [],
            inputs: {
              host: "personal.dpeek.workers.dev",
              workerName: "personal-worker",
            },
            kind: "cloudflare-worker-custom-domain",
            logicalId: "primary-custom-domain-personal-dpeek-workers-dev",
            providerFamily: "cloudflare",
            targetId: "instance.primary",
          },
        ],
        targetId: "instance.primary",
      },
      revision: 3,
      schemaVersion: 1,
      source: {
        fingerprint: "control-plane:test",
        intentRevision: 3,
      },
      targetId: "instance.primary",
      versionId: "desired-state.instance.primary.3",
    },
    target: {
      kind: "instance",
      label: "Primary instance target",
      targetId: "instance.primary",
    },
  };
}

function deploymentConfigRecord(
  overrides: Partial<InstanceControlPlaneDeploymentConfigValues> = {},
): StoredRecord {
  const values = {
    accountId: "account-123",
    createdAt: "2026-06-10T00:00:00.000Z",
    enabled: true,
    label: "Primary deployment",
    providerFamily: "cloudflare",
    targetId: "instance.primary",
    targetKind: "instance",
    targetUrl: "https://example.formless.dev",
    updatedAt: "2026-06-10T00:00:00.000Z",
    workerName: "formless-primary",
    ...overrides,
  } satisfies InstanceControlPlaneDeploymentConfigValues;

  return {
    createdAt: values.createdAt,
    entity: "deployment-config",
    id: values.targetId,
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
    schemaRoute: `/apps/${input.installId}/schema`,
    status: "installed",
    updatedAt: "2026-05-22T08:00:00.000Z",
  };
}
