import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { listBundledAppPackages, type AppInstall } from "../../shared/app-installs.ts";
import { bundledSourceSchemaHashFixtures } from "../../shared/upgrade-migrations.ts";
import {
  InstallAppDialogForm,
  InstanceShellRouteView,
  WorkspaceOperationProgress,
  displaySafeEntries,
  operationPollsAutomatically,
  type InstanceShellRouteState,
  type WorkspaceGatewayRouteState,
} from "./instance-shell.tsx";
import type { LocalWorkspaceGatewayOperation } from "../../client/workspace-gateway.ts";

describe("instance shell route view", () => {
  it("renders generated control-plane app, route, and deployment surfaces", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
          estii: { installId: "rates", label: "Rates" },
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
    expect(html).toContain('data-formless-control-plane-screen="deployments"');
    expect(html).toContain("Control-plane deployment records");
    expect(html).not.toContain("Custom domains");
    expect(html).not.toContain("No custom domains.");
    expect(html).not.toContain("Add redirect");
    expect(html).not.toContain("Installed apps");
    expect(html).not.toContain("Bundled apps");
    expect(html).not.toContain("Public website app backed by the bundled Site schema");
    expect(html).not.toContain("Task tracking app backed by the bundled Tasks schema");
    expect(html).not.toContain("Rate-card app backed by the bundled Estii schema");
  });

  it("renders local workspace gateway controls and browser onboarding state", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        state={readyState({ installs: [] })}
        workspaceGatewayState={workspaceGatewayState({
          currentOperation: workspaceOperation({
            operation: "status",
            result: {
              summary: {
                fields: { initialized: false },
                title: "Workspace not initialized",
              },
            },
            summary: {
              fields: { initialized: false },
              title: "Workspace not initialized",
            },
          }),
        })}
      />,
    );

    expect(html).toContain('data-formless-workspace-gateway="local"');
    expect(html).toContain('data-formless-workspace-operation-controls="true"');
    expect(html).toContain("Initialize");
    expect(html).toContain("Save");
    expect(html).toContain("Check");
    expect(html).toContain("Pull");
    expect(html).toContain("Push");
    expect(html).toContain("Credentials");
    expect(html).toContain("Plan deploy");
    expect(html).toContain("Apply deploy");
    expect(html).toContain('data-formless-workspace-onboarding="local"');
    expect(html).toContain(
      'data-formless-onboarding-generated-record-controls="routes deployments"',
    );
    expect(html).toContain("Workspace source has not been created.");
    expect(html).toContain('data-formless-control-plane-screen="apps"');
    expect(html).not.toContain("workspacePath");
    expect(html).not.toContain("/Users/");
  });

  it("keeps workspace gateway controls unavailable without proxy status", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView state={readyState({ installs: [] })} />,
    );

    expect(html).not.toContain('data-formless-workspace-gateway="local"');
    expect(html).not.toContain('data-formless-workspace-operation-controls="true"');
    expect(html).not.toContain("Initialize workspace");
    expect(html).not.toContain("Plan deploy");
    expect(html).not.toContain("Apply deploy");
  });

  it("renders gateway proxy status and pollable operation progress without sidecar internals", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
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
    );

    expect(html).toContain('data-formless-workspace-gateway="local"');
    expect(html).toContain('data-formless-workspace-operation-progress="true"');
    expect(html).toContain("Initialized");
    expect(html).toContain("Deploy planning");
    expect(html).toContain("Deploy plan");
    expect(html).toContain("Running");
    expect(html).toContain("desired.instance.primary.3");
    expect(html).toContain("https://personal.dpeek.workers.dev");
    expect(html).toContain("[redacted]");
    expect(html).not.toContain("secret-provider-token");
    expect(html).not.toContain("sidecar-proxy-token");
    expect(html).not.toContain("http://127.0.0.1:7777");
  });

  it("polls only queued or running workspace operations automatically", () => {
    expect(operationPollsAutomatically(workspaceOperation({ status: "queued" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "running" }))).toBe(true);
    expect(operationPollsAutomatically(workspaceOperation({ status: "succeeded" }))).toBe(false);
    expect(operationPollsAutomatically(workspaceOperation({ status: "failed" }))).toBe(false);
  });

  it("renders first app onboarding while keeping generated record editors mounted", () => {
    const html = renderToStaticMarkup(
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
    expect(html).toContain('data-formless-control-plane-screen="deployments"');
    expect(html).toContain(
      'data-formless-onboarding-generated-record-controls="routes deployments"',
    );
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

  it("renders the install dialog with a bundled app type switcher", () => {
    const html = renderToStaticMarkup(
      <InstallAppDialogForm
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
          estii: { installId: "rates", label: "Rates" },
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
    expect(html).toContain("Estii");
    expect(html).toContain("CRM");
    expect(html).toContain("Public website app backed by the bundled Site schema");
    expect(html).toContain("Install Site");
    expect(html).toContain('value="Docs Site"');
    expect(html).toContain('value="docs"');
    expect(html).not.toContain('value="Task Space"');
    expect(html).not.toContain('value="Rates"');
    expect(html).not.toContain('value="CRM"');
    expect(html).not.toContain('value="crm"');
  });

  it("renders CRM package defaults in the install dialog when CRM is selected", () => {
    const packages = listBundledAppPackages();
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
    expect(html).toContain("Estii");
    expect(html).toContain("CRM");
    expect(html).toContain("CRM app backed by the bundled CRM schema and demo records.");
    expect(html).toContain("Install CRM");
    expect(html).toContain('value="CRM"');
    expect(html).toContain('value="crm"');
  });

  it("renders install errors in the dialog with generated app management mounted", () => {
    const viewHtml = renderToStaticMarkup(
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
    const html = renderToStaticMarkup(
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

  it("renders provider config, plan, blockers, and job status", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        state={readyState({
          domainProviderApplyJob: {
            createdAt: "2026-05-27T00:00:00.000Z",
            jobId: "apply-job-1",
            plan: {
              blockers: [],
              instanceId: "primary",
              policy: "create-only",
              resources: [],
              workerName: "personal",
            },
            result: { evidenceCount: 2 },
            status: "succeeded",
            updatedAt: "2026-05-27T00:01:00.000Z",
          },
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
              applyReady: true,
              cloudflareApiToken: {
                configured: true,
                envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
              },
              instanceId: "primary",
              issues: [],
              jobReady: true,
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
    expect(html).toContain("jobs ready");
    expect(html).toContain("Account account-123");
    expect(html).toContain("Resources 2");
    expect(html).toContain("Blockers none");
    expect(html).toContain("Zones example.com");
    expect(html).toContain("Runner mutation checked by node-runner");
    expect(html).toContain("Deployment Deployed");
    expect(html).toContain("Revision 2 deployed");
    expect(html).toContain("Apply job: succeeded");
    expect(html).toContain("Delete job: succeeded");
    expect(html).toContain("Refresh plan");
    expect(html).toContain("Apply provider");
  });

  it("keeps runner secret gaps out of provider config blocker copy", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        state={readyState({
          domainProviderPlan: {
            config: {
              alchemyPassword: { configured: false, envNames: ["ALCHEMY_PASSWORD"] },
              applyReady: true,
              cloudflareApiToken: {
                configured: false,
                envNames: ["CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"],
              },
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
              jobReady: true,
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

    expect(html).toContain("jobs ready");
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
    packages: listBundledAppPackages(),
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
  overrides: Partial<LocalWorkspaceGatewayOperation> = {},
): LocalWorkspaceGatewayOperation {
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
