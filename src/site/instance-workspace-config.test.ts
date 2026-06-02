import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH,
  DEFAULT_FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultFormlessInstanceWorkspaceManifest,
  formatFormlessInstanceWorkspaceManifest,
  normalizeFormlessInstanceWorkspaceTargetUrl,
  parseFormlessInstanceWorkspaceManifest,
  parseFormlessInstanceWorkspaceManifestJson,
} from "./instance-workspace-config.ts";

describe("Formless instance workspace manifest", () => {
  it("creates a layout-only reviewable workspace manifest", () => {
    expect(FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE).toBe("formless.json");
    expect(
      defaultFormlessInstanceWorkspaceManifest({
        name: "personal-sites",
        targetUrl: "https://formless.example.workers.dev/setup?token=ignored",
      }),
    ).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      source: {
        records: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH,
      },
      targets: [],
      archives: {
        instance: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
        apps: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
      },
      media: {
        root: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_MEDIA_ROOT,
      },
      local: {
        stateRoot: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
        secretStateRoot: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
      },
      defaultAppPolicy: "none",
      apps: [],
    });
  });

  it("parses and formats valid layout paths", () => {
    const manifest = parseFormlessInstanceWorkspaceManifest({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      source: {
        records: "source/control-plane",
      },
      archives: {
        apps: "archives/apps",
      },
      media: {
        root: "media",
      },
      local: {
        stateRoot: ".formless/local",
        secretStateRoot: ".formless",
      },
    });
    const formatted = formatFormlessInstanceWorkspaceManifest(manifest);

    expect(manifest).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      source: {
        records: "source/control-plane",
      },
      targets: [],
      archives: {
        instance: DEFAULT_FORMLESS_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
        apps: "archives/apps",
      },
      media: {
        root: "media",
      },
      local: {
        stateRoot: ".formless/local",
        secretStateRoot: ".formless",
      },
      defaultAppPolicy: "none",
      apps: [],
    });
    expect(formatted).toBe(`${JSON.stringify(JSON.parse(formatted), null, 2)}\n`);
    expect(JSON.parse(formatted)).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      source: {
        records: "source/control-plane",
      },
      archives: {
        apps: "archives/apps",
      },
      media: {
        root: "media",
      },
      local: {
        stateRoot: ".formless/local",
        secretStateRoot: ".formless",
      },
    });
    expect(parseFormlessInstanceWorkspaceManifestJson(formatted)).toEqual(manifest);
  });

  it("rejects secrets and unsupported keys in reviewable workspace manifests", () => {
    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        source: {
          records: "source/control-plane",
        },
        archives: {
          apps: "archives/apps",
        },
        media: {
          root: "media",
        },
        local: {
          stateRoot: ".formless/local",
          secretStateRoot: ".formless",
        },
        deploy: {
          adminToken: "secret",
        },
      }),
    ).toThrow('formless.json must not store secret field "formless.json.deploy.adminToken".');

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        local: {
          stateRoot: ".formless/local",
          secretStateRoot: ".formless",
          apiToken: "secret",
        },
      }),
    ).toThrow('formless.json must not store secret field "formless.json.local.apiToken".');

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        source: {
          records: "source/control-plane",
        },
        archives: {
          apps: "archives/apps",
        },
        media: {
          root: "media",
        },
        local: {
          stateRoot: ".formless/local",
          secretStateRoot: ".formless",
        },
        extra: true,
      }),
    ).toThrow('formless.json has unsupported key "extra".');
  });

  it("validates layout paths", () => {
    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        source: { records: "../records" },
      }),
    ).toThrow("formless.json source.records must be a relative workspace path.");

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        archives: { apps: "/archives/apps" },
      }),
    ).toThrow("formless.json archives.apps must be a relative workspace path.");

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        media: { root: "media//files" },
      }),
    ).toThrow("formless.json media.root must be a relative workspace path.");

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        local: { stateRoot: ".formless/local", secretStateRoot: ".." },
      }),
    ).toThrow("formless.json local.secretStateRoot must be a relative workspace path.");
  });

  it("rejects removed v1 source keys without a compatibility parser", () => {
    for (const key of [
      "apps",
      "defaultAppPolicy",
      "defaultTarget",
      "deploy",
      "domains",
      "targets",
    ]) {
      expect(() =>
        parseFormlessInstanceWorkspaceManifest({
          ...layoutManifestSource(),
          [key]: key === "defaultTarget" ? "remote" : [],
        }),
      ).toThrow(
        `formless.json key "${key}" was removed from manifest version 1; store instance intent in workspace record source instead.`,
      );
    }

    expect(() =>
      parseFormlessInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        archives: {
          instance: "archives/instance",
          apps: "archives/apps",
        },
      }),
    ).toThrow('formless.json archives has unsupported key "instance".');
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

function layoutManifestSource(): Record<string, unknown> {
  return {
    version: 1,
    kind: "formless-instance-workspace",
    name: "personal-sites",
    source: {
      records: "source/control-plane",
    },
    archives: {
      apps: "archives/apps",
    },
    media: {
      root: "media",
    },
    local: {
      stateRoot: ".formless/local",
      secretStateRoot: ".formless",
    },
  };
}
