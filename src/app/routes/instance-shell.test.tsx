import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { listBundledAppPackages, type AppInstall } from "../../shared/app-installs.ts";
import { InstallAppDialogForm, InstanceShellRouteView } from "./instance-shell.tsx";

describe("instance shell route view", () => {
  it("lists installed apps and renders one install button", () => {
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

    expect(html).toContain("Installed apps");
    expect(html).toContain("Personal Site");
    expect(html).toContain("<code>personal</code>");
    expect(html).toContain('href="/apps/personal"');
    expect(html).toContain('href="/sites/personal"');
    expect(html).toContain("Custom domains");
    expect(html).toContain("No custom domains.");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Install");
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
        domainDraft={{ host: "www.example.com", installId: "personal" }}
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
        }}
        state={{
          domainAppliedStates: [
            {
              accountId: "account-123",
              action: "created",
              appliedAt: "2026-05-26T00:00:00.000Z",
              host: "dpeek.com",
              installId: "personal",
              provider: "cloudflare-worker-custom-domain",
              surface: "site",
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
              surface: "site",
              updatedAt: "2026-05-26T00:00:00.000Z",
            },
          ],
          installing: false,
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("Custom domains");
    expect(html).toContain("dpeek.com");
    expect(html).toContain("Applied: personal");
    expect(html).toContain('value="www.example.com"');
    expect(html).toContain("<option");
    expect(html).toContain("Personal Site");
    expect(html).toContain("Add");
  });
});

function siteInstall(input: { installId: string; label: string }): AppInstall {
  return {
    adminRoute: `/apps/${input.installId}`,
    createdAt: "2026-05-22T08:00:00.000Z",
    installId: input.installId,
    label: input.label,
    packageAppKey: "site",
    publicRoute: `/sites/${input.installId}`,
    publicRoutePrefix: `/sites/${input.installId}/`,
    schemaRoute: `/apps/${input.installId}/schema`,
    status: "installed",
    updatedAt: "2026-05-22T08:00:00.000Z",
  };
}
