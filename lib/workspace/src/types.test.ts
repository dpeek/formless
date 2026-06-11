import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
  INSTANCE_WORKSPACE_MANIFEST_FILE,
  WORKSPACE_BROWSER_OPERATION_KINDS,
  WORKSPACE_OPERATION_KINDS,
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
  defaultInstanceWorkspaceManifest,
  formatWorkspaceOperationState,
  formatInstanceWorkspaceManifest,
  initialWorkspaceOperationState,
  isWorkspaceBrowserOperationKind,
  isWorkspaceOperationKind,
  nextWorkspaceOperationState,
  normalizeInstanceWorkspaceTargetUrl,
  parseInstanceWorkspaceManifest,
  parseInstanceWorkspaceManifestJson,
  parseInstanceWorkspaceRelativePath,
  parseInstanceWorkspaceResourceSlug,
  parseWorkspaceOperationId,
  parseWorkspaceOperationStateJson,
  workspaceOperationInputDisplay,
} from "./index.ts";

describe("instance workspace manifest", () => {
  it("creates a layout-only reviewable workspace manifest", () => {
    expect(INSTANCE_WORKSPACE_MANIFEST_FILE).toBe("formless.json");
    expect(
      defaultInstanceWorkspaceManifest({
        name: "personal-sites",
        targetUrl: "https://formless.example.workers.dev/setup?token=ignored",
      }),
    ).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      source: {
        records: DEFAULT_INSTANCE_WORKSPACE_RECORD_SOURCE_PATH,
      },
      targets: [],
      archives: {
        instance: DEFAULT_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
        apps: DEFAULT_INSTANCE_WORKSPACE_APP_ARCHIVE_ROOT,
      },
      media: {
        root: DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
      },
      local: {
        stateRoot: DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
        secretStateRoot: DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
      },
      defaultAppPolicy: "none",
      apps: [],
    });
  });

  it("parses and formats valid layout paths", () => {
    const manifest = parseInstanceWorkspaceManifest({
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
    const formatted = formatInstanceWorkspaceManifest(manifest);

    expect(manifest).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      source: {
        records: "source/control-plane",
      },
      targets: [],
      archives: {
        instance: DEFAULT_INSTANCE_WORKSPACE_INSTANCE_ARCHIVE_PATH,
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
    expect(parseInstanceWorkspaceManifestJson(formatted)).toEqual(manifest);
  });

  it("rejects secrets and unsupported keys in reviewable workspace manifests", () => {
    expect(() =>
      parseInstanceWorkspaceManifest({
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
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        deploy: {
          workerName: "personal",
        },
      }),
    ).toThrow(
      'formless.json key "deploy" was removed from manifest version 1; store instance intent in workspace record source instead.',
    );

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        local: {
          stateRoot: ".formless/local",
          secretStateRoot: ".formless",
          apiToken: "secret",
        },
      }),
    ).toThrow('formless.json must not store secret field "formless.json.local.apiToken".');

    expect(() =>
      parseInstanceWorkspaceManifest({
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

  it("validates resource slugs and layout paths", () => {
    expect(parseInstanceWorkspaceResourceSlug("workspace name", "personal-sites")).toBe(
      "personal-sites",
    );
    expect(parseInstanceWorkspaceRelativePath("workspace path", "records/source")).toBe(
      "records/source",
    );

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        source: { records: "../records" },
      }),
    ).toThrow("formless.json source.records must be a relative workspace path.");

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        archives: { apps: "/archives/apps" },
      }),
    ).toThrow("formless.json archives.apps must be a relative workspace path.");

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        media: { root: "media//files" },
      }),
    ).toThrow("formless.json media.root must be a relative workspace path.");

    expect(() =>
      parseInstanceWorkspaceManifest({
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
        parseInstanceWorkspaceManifest({
          ...layoutManifestSource(),
          [key]: key === "defaultTarget" ? "remote" : [],
        }),
      ).toThrow(
        `formless.json key "${key}" was removed from manifest version 1; store instance intent in workspace record source instead.`,
      );
    }

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        archives: {
          instance: "archives/instance",
          apps: "archives/apps",
        },
      }),
    ).toThrow('formless.json archives has unsupported key "instance".');
  });

  it("normalizes target URLs to origins", () => {
    expect(normalizeInstanceWorkspaceTargetUrl("https://example.com/path?x=1#top")).toBe(
      "https://example.com",
    );
    expect(() => normalizeInstanceWorkspaceTargetUrl("file:///tmp/archive")).toThrow(
      "Formless instance workspace target URL is invalid: file:///tmp/archive",
    );
  });
});

describe("workspace operation contracts", () => {
  it("defines semantic operation kind sets and display inputs", () => {
    expect(WORKSPACE_OPERATION_KINDS).toEqual([
      "check",
      "credentialSetup",
      "deploymentRefresh",
      "deployApply",
      "deployPlan",
      "init",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(WORKSPACE_BROWSER_OPERATION_KINDS).toEqual([
      "check",
      "credentialSetup",
      "deploymentRefresh",
      "deployApply",
      "deployPlan",
      "pull",
      "push",
      "save",
      "status",
    ]);
    expect(isWorkspaceOperationKind("init")).toBe(true);
    expect(isWorkspaceBrowserOperationKind("init")).toBe(false);
    expect(isWorkspaceBrowserOperationKind("deploymentRefresh")).toBe(true);
    expect(isWorkspaceBrowserOperationKind("credentialSetup")).toBe(true);
    expect(workspaceOperationInputDisplay({ check: true, kind: "save", source: "cli" })).toEqual({
      check: true,
      source: "cli",
    });
    expect(
      workspaceOperationInputDisplay({
        accountId: "account-123",
        kind: "credentialSetup",
        provider: "cloudflare",
      }),
    ).toEqual({ accountId: "account-123", provider: "cloudflare" });
  });

  it("validates ids and parses formatted operation state", () => {
    const state = initialWorkspaceOperationState({
      actor: "browser",
      id: "op_deploy_00000001",
      input: { targetAlias: "remote" },
      now: () => "2026-06-02T00:00:00.000Z",
      operation: "deployApply",
      workspaceLabel: "personal-sites",
      workspaceRoot: "/tmp/personal-sites",
    });

    expect(parseWorkspaceOperationId("op_deploy_00000001")).toEqual({
      ok: true,
      operationId: "op_deploy_00000001",
    });
    expect(parseWorkspaceOperationId("../secret")).toEqual({
      error: "Workspace operation id is invalid.",
      ok: false,
    });
    expect(parseWorkspaceOperationStateJson(formatWorkspaceOperationState(state))).toEqual({
      ...state,
      kind: WORKSPACE_OPERATION_STATE_FILE_KIND,
      version: WORKSPACE_OPERATION_STATE_FILE_VERSION,
    });
    expect(() =>
      parseWorkspaceOperationStateJson(
        JSON.stringify({ ...state, operation: "unsupported-operation" }),
      ),
    ).toThrow("Workspace operation state file is invalid.");
  });

  it("redacts display state before format or update", () => {
    const workspaceRoot = "/tmp/personal-sites";
    const ownerSetupUrl = "https://personal.dpeek.workers.dev/setup?token=owner-setup-secret";
    const state = initialWorkspaceOperationState({
      id: "op_redact_00000001",
      input: {
        rawAdapterOutput: "TOKEN=secret",
        targetAlias: "remote",
        workspaceFile: `${workspaceRoot}/logs/output.txt`,
      },
      now: () => "2026-06-02T00:00:00.000Z",
      operation: "deployApply",
      workspaceLabel: "personal-sites",
      workspaceRoot,
    });
    const updated = nextWorkspaceOperationState(state, {
      events: [
        {
          at: "2026-06-02T00:00:01.000Z",
          profileLabel: "default",
          provider: "cloudflare",
          status: "waiting",
          type: "externalAuthorizationUrl",
          url: "https://dash.cloudflare.com/oauth2/authorize?account=123",
        },
      ],
      logs: [
        {
          at: "2026-06-02T00:00:01.000Z",
          level: "info",
          message: `Bearer secret-token CF_API_TOKEN=secret ${workspaceRoot}/logs/output.txt`,
        },
      ],
      result: {
        deployment: {
          leaseToken: "lease:local-gateway",
          ownerSetupUrl,
          rawAdapterOutput: "TOKEN=secret",
        },
        summary: {
          fields: {
            attemptId: "attempt.deploy.1",
            ownerSetupUrl,
            providerStatePayload: "raw",
          },
          title: "Deploy applied",
        },
      },
      status: "running",
      summary: {
        fields: {
          ownerSetupUrl,
          providerStatePayload: "raw",
          setupUrl: ownerSetupUrl,
        },
        title: "Deploy applied",
      },
      workspaceRoot,
    });
    const text = formatWorkspaceOperationState(updated);

    expect(updated.input).toMatchObject({
      rawAdapterOutput: "[redacted]",
      targetAlias: "remote",
      workspaceFile: "<workspace>/logs/output.txt",
    });
    expect(updated.logs[0]?.message).toContain("Bearer [redacted]");
    expect(updated.logs[0]?.message).toContain("[redacted]");
    expect(updated.result?.deployment?.leaseToken).toBe("[redacted]");
    expect(updated.result?.deployment?.ownerSetupUrl).toBe(
      "https://personal.dpeek.workers.dev/setup?token=[redacted]",
    );
    expect(updated.result?.deployment?.rawAdapterOutput).toBe("[redacted]");
    expect(updated.result?.summary.fields.ownerSetupUrl).toBe(ownerSetupUrl);
    expect(updated.summary.fields.ownerSetupUrl).toBe(ownerSetupUrl);
    expect(updated.summary.fields.providerStatePayload).toBe("[redacted]");
    expect(updated.summary.fields.setupUrl).toBe(
      "https://personal.dpeek.workers.dev/setup?token=[redacted]",
    );
    expect(updated.events[0]?.url).toBe("https://dash.cloudflare.com/oauth2/authorize?account=123");
    expect(text).not.toContain(workspaceRoot);
    expect(text).not.toContain("secret-token");
    expect(text).toContain(ownerSetupUrl);
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
