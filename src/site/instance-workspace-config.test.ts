import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceManifest,
  parseFormlessInstanceWorkspaceManifestJson,
} from "./instance-workspace-config.ts";

describe("Formless instance workspace manifest", () => {
  it("creates a minimal reviewable workspace manifest from a target URL", () => {
    expect(
      defaultFormlessInstanceWorkspaceManifest({
        name: "personal-sites",
        targetUrl: "https://formless.example.workers.dev/setup?token=ignored",
      }),
    ).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      defaultTarget: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_TARGET_ALIAS,
      targets: [
        {
          alias: "remote",
          url: "https://formless.example.workers.dev",
        },
      ],
      archives: {
        instance: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
        apps: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
      },
      local: {
        stateRoot: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
      },
      defaultAppPolicy: "starter-site",
      apps: [],
    });
  });

  it("parses and formats package-generic installed app declarations", () => {
    const manifest = parseFormlessInstanceWorkspaceManifest({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      defaultTarget: "remote",
      targets: [
        { alias: "remote", url: "https://formless.example.workers.dev/?draft=1#top" },
        { alias: "local", url: "http://localhost:8787" },
      ],
      archives: {
        instance: "archives/instance",
        apps: "archives/apps",
      },
      local: {
        stateRoot: ".formless/local",
      },
      defaultAppPolicy: "declared-installs",
      apps: [
        {
          installId: "james",
          packageAppKey: "site",
          label: "James Peek",
          archivePath: "archives/apps/james",
          routes: {
            admin: "/apps/james",
            schema: "/apps/james/schema",
            public: "/sites/james",
          },
        },
        {
          installId: "david",
          packageAppKey: "site",
          label: "David Peek",
          archivePath: "archives/apps/david",
        },
      ],
      deploy: {
        workerName: "formless",
        accountId: "account-123",
        workersDevUrl: "https://formless.example.workers.dev",
        mediaBucket: "formless-media",
        migrationPolicy: "existing",
      },
      domains: [
        {
          enabled: true,
          host: "admin.example.com",
          profile: "instance",
        },
        {
          enabled: true,
          host: "tasks.example.com",
          profile: "app",
          targetInstallId: "tasks",
        },
        {
          enabled: true,
          host: "www.example.com",
          profile: "publicSite",
          targetInstallId: "david",
        },
      ],
    });

    expect(manifest.targets.map((target) => target.alias)).toEqual(["local", "remote"]);
    expect(manifest.apps.map((app) => app.installId)).toEqual(["david", "james"]);
    expect(formatFormlessInstanceWorkspaceManifest(manifest)).toBe(
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    expect(parseFormlessInstanceWorkspaceManifestJson(JSON.stringify(manifest))).toEqual(manifest);
  });

  it("parses legacy Site domain intent into profile mapping intent", () => {
    expect(
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        domains: [
          {
            host: "WWW.EXAMPLE.COM.",
            installId: "david",
            surface: "site",
          },
        ],
      }).domains,
    ).toEqual([
      {
        enabled: true,
        host: "www.example.com",
        profile: "publicSite",
        targetInstallId: "david",
      },
    ]);
  });

  it("rejects secrets and unsupported keys in reviewable workspace config", () => {
    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        targets: [],
        archives: {
          instance: "archives/instance",
          apps: "archives/apps",
        },
        local: {
          stateRoot: ".formless/local",
        },
        defaultAppPolicy: "none",
        apps: [],
        deploy: {
          adminToken: "secret",
        },
      }),
    ).toThrow(
      'formless.instance-workspace.json must not store secret field "formless.instance-workspace.json.deploy.adminToken".',
    );

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        deploy: {
          migrationPolicy: "existing",
          alchemyStateToken: "secret",
        },
      }),
    ).toThrow(
      'formless.instance-workspace.json must not store secret field "formless.instance-workspace.json.deploy.alchemyStateToken".',
    );

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        targets: [],
        archives: {
          instance: "archives/instance",
          apps: "archives/apps",
        },
        local: {
          stateRoot: ".formless/local",
        },
        defaultAppPolicy: "none",
        apps: [],
        extra: true,
      }),
    ).toThrow('formless.instance-workspace.json has unsupported key "extra".');
  });

  it("validates target aliases, relative paths, install ids, and deploy policy", () => {
    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        defaultTarget: "missing",
      }),
    ).toThrow("formless.instance-workspace.json defaultTarget must match a target alias.");

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        targets: [{ alias: "Remote", url: "https://formless.example.workers.dev" }],
      }),
    ).toThrow(
      "formless.instance-workspace.json targets[0] alias must start with a lowercase letter",
    );

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        archives: { instance: "../archive", apps: "archives/apps" },
      }),
    ).toThrow(
      "formless.instance-workspace.json archives.instance must be a relative workspace path.",
    );

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        apps: [
          {
            installId: "api",
            packageAppKey: "site",
            label: "Reserved",
            archivePath: "archives/apps/api",
          },
        ],
      }),
    ).toThrow(
      'formless.instance-workspace.json apps[0] installId is invalid: Install id "api" is reserved.',
    );

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...defaultFormlessInstanceWorkspaceManifest({ name: "personal-sites" }),
        deploy: {
          migrationPolicy: "auto",
        },
      }),
    ).toThrow(
      'formless.instance-workspace.json deploy.migrationPolicy must be "new" or "existing".',
    );
  });

  it("normalizes target URLs to origins", () => {
    expect(normalizeFormlessInstanceWorkspaceTargetUrl("https://example.com/path?x=1#top")).toBe(
      "https://example.com",
    );
    expect(() => normalizeFormlessInstanceWorkspaceTargetUrl("file:///tmp/archive")).toThrow(
      "Formless instance workspace target URL is invalid: file:///tmp/archive",
    );
  });
});
