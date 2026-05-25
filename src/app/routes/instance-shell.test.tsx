import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { listBundledAppPackages, type AppInstall } from "../../shared/app-installs.ts";
import { InstanceShellRouteView } from "./instance-shell.tsx";

describe("instance shell route view", () => {
  it("lists installed apps and renders bundled package install forms", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "docs", label: "Docs Site" },
          tasks: { installId: "tasks", label: "Task Space" },
        }}
        state={{
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
    expect(html).toContain("Bundled apps");
    expect(html).toContain("Public website app backed by the bundled Site schema");
    expect(html).toContain("Task tracking app backed by the bundled Tasks schema");
    expect(html).toContain("Install Site");
    expect(html).toContain("Install Tasks");
    expect(html).toContain('value="Docs Site"');
    expect(html).toContain('value="docs"');
    expect(html).toContain('value="Task Space"');
    expect(html).toContain('value="tasks"');
  });

  it("renders install errors without hiding existing installs", () => {
    const html = renderToStaticMarkup(
      <InstanceShellRouteView
        installDrafts={{
          site: { installId: "personal", label: "Other Site" },
        }}
        state={{
          installError: 'Install id "personal" is already installed.',
          installErrorPackageAppKey: "site",
          installing: false,
          installs: [siteInstall({ installId: "personal", label: "Personal Site" })],
          packages: listBundledAppPackages(),
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("Personal Site");
    expect(html).toContain('role="alert"');
    expect(html).toContain("already installed");
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
