import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { listBundledAppPackages, type AppInstall } from "../../shared/app-installs.ts";
import { InstallAppDialogForm, InstanceShellRouteView } from "./instance-shell.tsx";

describe("instance shell route view", () => {
  it("renders generated control-plane app management without a duplicate install heading", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
          estii: { installId: "rates", label: "Rates" },
        }}
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [],
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [
            siteInstall({
              installId: "personal",
              label: "Personal Site",
            }),
          ],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain('data-formless-control-plane-screen="apps"');
    expect(html).toContain("Loading Instance control plane");
    expect(html).toContain("Personal Site");
    expect(html).toContain("Custom domains");
    expect(html).toContain("No custom domains.");
    expect(html).toContain("Deployments");
    expect(html).toContain('data-formless-control-plane-screen="deployments"');
    expect(html).toContain("Control-plane deployment records");
    expect(html).not.toContain("Installed apps");
    expect(html).not.toContain("Bundled apps");
    expect(html).not.toContain("Public website app backed by the bundled Site schema");
    expect(html).not.toContain("Task tracking app backed by the bundled Tasks schema");
    expect(html).not.toContain("Rate-card app backed by the bundled Estii schema");
  });

  it("renders the install dialog with a bundled app type switcher", () => {
    const html = renderToStaticMarkup(
      <InstallAppDialogForm
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
          estii: { installId: "rates", label: "Rates" },
        }}
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [],
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("Install app");
    expect(html).toContain('aria-label="Install app type"');
    expect(html).toContain('role="tab"');
    expect(html).toContain("Site");
    expect(html).toContain("Tasks");
    expect(html).toContain("Estii");
    expect(html).toContain("Public website app backed by the bundled Site schema");
    expect(html).toContain("Install Site");
    expect(html).toContain('value="Docs Site"');
    expect(html).toContain('value="docs"');
    expect(html).not.toContain('value="Task Space"');
    expect(html).not.toContain('value="Rates"');
  });

  it("renders install errors in the dialog without hiding existing installs", () => {
    const viewHtml = renderToStaticMarkup(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "personal", label: "Other Site" },
        }}
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [],
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installError: 'Install id "personal" is already installed.',
          installErrorPackageAppKey: "site",
          installing: false,
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );
    const dialogHtml = renderToStaticMarkup(
      <InstallAppDialogForm
        installDrafts={{
          site: { installId: "personal", label: "Other Site" },
        }}
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [],
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installError: 'Install id "personal" is already installed.',
          installErrorPackageAppKey: "site",
          installing: false,
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(viewHtml).toContain("Personal Site");
    expect(dialogHtml).toContain('role="alert"');
    expect(dialogHtml).toContain("already installed");
  });

  it("renders desired custom domains and the add form", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        domainDraft={{
          host: "www.example.com",
          profile: "publicSite",
          targetInstallId: "personal",
        }}
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
        }}
        state={{
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
          domainMappingSubmitting: false,
          domainMappings: [
            {
              createdAt: "2026-05-26T00:00:00.000Z",
              enabled: true,
              host: "dpeek.com",
              installId: "personal",
              profile: "publicSite",
              surface: "site",
              targetInstallId: "personal",
              updatedAt: "2026-05-26T00:00:00.000Z",
            },
          ],
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [
            siteInstall({ installId: "personal", label: "Personal Site" }),
            appInstall({ installId: "tasks", label: "Tasks", packageAppKey: "tasks" }),
          ],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("Custom domains");
    expect(html).toContain("dpeek.com");
    expect(html).toContain("publicSite:personal");
    expect(html).toContain("Applied: personal");
    expect(html).toContain('value="www.example.com"');
    expect(html).toContain("<option");
    expect(html).toContain("Personal Site");
    expect(html).toContain("Public Site");
    expect(html).toContain("Remove");
    expect(html).toContain("Delete provider");
    expect(html).toContain("Add");
  });

  it("renders app and instance domain profile options plus orphan applied state", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        domainDraft={{ host: "admin.example.com", profile: "instance", targetInstallId: "" }}
        state={{
          domainAppliedStates: [
            {
              accountId: "account-123",
              action: "created",
              alchemyResourceId: "primary-custom-domain-admin-example-com-instance",
              appliedAt: "2026-05-26T00:00:00.000Z",
              host: "admin.example.com",
              profile: "instance",
              provider: "cloudflare-worker-custom-domain",
              updatedAt: "2026-05-26T00:00:00.000Z",
              workerDomainId: "domain-1",
              workerName: "personal",
              zoneId: "zone-1",
              zoneName: "example.com",
            },
          ],
          domainMappingSubmitting: false,
          domainMappings: [],
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
          domainRedirectIntents: [
            {
              createdAt: "2026-05-27T00:00:00.000Z",
              enabled: true,
              fromHost: "www.example.com",
              preservePath: true,
              preserveQueryString: true,
              statusCode: 301,
              toHost: "example.com",
              updatedAt: "2026-05-27T00:00:00.000Z",
            },
          ],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [
            siteInstall({ installId: "personal", label: "Personal Site" }),
            appInstall({ installId: "tasks", label: "Tasks", packageAppKey: "tasks" }),
          ],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("Instance");
    expect(html).toContain("App");
    expect(html).toContain("Public Site");
    expect(html).toContain("admin.example.com");
    expect(html).toContain("Route: removed");
    expect(html).toContain("www.example.com");
    expect(html).toContain("example.com");
    expect(html).toContain("Add redirect");
    expect(html).toContain("Delete provider");
    expect(html).toContain("Mark manually removed");
  });

  it("renders forget actions for disabled desired routes with no provider evidence", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [
            {
              createdAt: "2026-05-26T00:00:00.000Z",
              enabled: false,
              host: "draft.example.com",
              profile: "publicSite",
              surface: "site",
              targetInstallId: "site",
              updatedAt: "2026-05-26T00:00:00.000Z",
            },
          ],
          domainRedirectIntents: [
            {
              createdAt: "2026-05-27T00:00:00.000Z",
              enabled: false,
              fromHost: "old.example.com",
              preservePath: true,
              preserveQueryString: true,
              statusCode: 301,
              toHost: "example.com",
              updatedAt: "2026-05-27T00:00:00.000Z",
            },
          ],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [siteInstall({ installId: "site", label: "Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("draft.example.com");
    expect(html).toContain("old.example.com");
    expect(html).toContain("Route: disabled");
    expect(html.match(/Forget route/g)?.length).toBe(2);
    expect(html).not.toContain("Delete provider");
  });

  it("renders provider config, plan, blockers, and job status", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [],
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
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [siteInstall({ installId: "site", label: "Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
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
        state={{
          domainAppliedStates: [],
          domainMappingSubmitting: false,
          domainMappings: [],
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
          domainRedirectIntents: [],
          domainRedirectSubmitting: false,
          installing: false,
          installs: [siteInstall({ installId: "site", label: "Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
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
