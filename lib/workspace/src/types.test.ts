import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_INSTANCE_WORKSPACE_LOCAL_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_MEDIA_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_SECRET_STATE_ROOT,
  DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
  INSTANCE_WORKSPACE_MANIFEST_FILE,
  WORKSPACE_PACKAGE_LINKS_FILE,
  WORKSPACE_PACKAGE_LINKS_KIND,
  WORKSPACE_PACKAGE_LINKS_VERSION,
  WORKSPACE_BOOTSTRAP_OPERATION_KINDS,
  WORKSPACE_BROWSER_OPERATION_KINDS,
  WORKSPACE_CLI_OPERATION_COMMANDS,
  WORKSPACE_CLI_OPERATION_KINDS,
  WORKSPACE_OPERATION_CAPABILITIES,
  WORKSPACE_OPERATION_DEFINITIONS,
  WORKSPACE_OPERATION_KINDS,
  WORKSPACE_OPERATION_KEYS,
  WORKSPACE_OPERATION_STATE_FILE_KIND,
  WORKSPACE_OPERATION_STATE_FILE_VERSION,
  WORKSPACE_AUTO_SAVE_STATE_FILE,
  WORKSPACE_AUTO_SAVE_STATE_FILE_KIND,
  WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION,
  WORKSPACE_AUTO_SAVE_SUPPRESSION_REASONS,
  WORKSPACE_AUTO_SAVE_WRITE_SOURCES,
  defaultInstanceWorkspaceManifest,
  defaultWorkspacePackageLinks,
  formatWorkspaceAutoSaveState,
  formatWorkspacePackageLinks,
  formatWorkspaceOperationState,
  formatInstanceWorkspaceManifest,
  initialWorkspaceAutoSaveState,
  initialWorkspaceOperationState,
  isWorkspaceAutoSaveSuppressionReason,
  isWorkspaceAutoSaveWriteSource,
  workspaceOperationActorAllowed,
  workspaceOperationCapabilityAllowed,
  workspaceOperationExecutionDecision,
  isWorkspaceBrowserOperationKind,
  isWorkspaceCliCommandName,
  isWorkspaceCliOperationKind,
  isWorkspaceOperationKind,
  nextWorkspaceOperationState,
  normalizeInstanceWorkspaceTargetUrl,
  nextWorkspaceAutoSaveEnqueuedState,
  nextWorkspaceAutoSaveFailedState,
  nextWorkspaceAutoSaveSavedState,
  nextWorkspaceAutoSaveSavingState,
  nextWorkspaceAutoSaveSuppressedState,
  parseInstanceWorkspaceManifest,
  parseInstanceWorkspaceManifestJson,
  parseInstanceWorkspaceRelativePath,
  parseInstanceWorkspaceResourceSlug,
  parseWorkspaceAutoSaveStateJson,
  parseWorkspacePackageLinks,
  parseWorkspacePackageLinksJson,
  parseWorkspacePackageManifestLinkPath,
  parseWorkspaceOperationId,
  parseWorkspaceOperationStateJson,
  workspaceOperationBootstrapAllowed,
  workspaceOperationDefinitionForCliCommand,
  workspaceOperationDefinitionForKey,
  workspaceOperationDefinitionForKind,
  workspaceOperationInputDefaults,
  workspaceOperationInputFieldDefaultValue,
  workspaceOperationInputDisplay,
  workspaceOperationMode,
  workspaceOperationRequiredCapability,
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
      state: {
        root: DEFAULT_INSTANCE_WORKSPACE_STATE_ROOT,
      },
      targets: [],
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
      state: {
        root: "state",
      },
      media: {
        root: "state/media",
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
      state: {
        root: "state",
      },
      targets: [],
      media: {
        root: "state/media",
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
      state: {
        root: "state",
      },
      media: {
        root: "state/media",
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
        state: {
          root: "state",
        },
        media: {
          root: "state/media",
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
      'formless.json key "deploy" was removed from manifest version 1; store instance intent in workspace storage state instead.',
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
        state: {
          root: "state",
        },
        media: {
          root: "state/media",
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
        state: { root: "../state" },
      }),
    ).toThrow("formless.json state.root must be a relative workspace path.");

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        state: { root: "/state" },
      }),
    ).toThrow("formless.json state.root must be a relative workspace path.");

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
      "archives",
      "defaultAppPolicy",
      "defaultTarget",
      "deploy",
      "domains",
      "source",
      "targets",
    ]) {
      expect(() =>
        parseInstanceWorkspaceManifest({
          ...layoutManifestSource(),
          [key]: key === "defaultTarget" ? "remote" : [],
        }),
      ).toThrow(
        `formless.json key "${key}" was removed from manifest version 1; store instance intent in workspace storage state instead.`,
      );
    }

    expect(() =>
      parseInstanceWorkspaceManifest({
        ...layoutManifestSource(),
        state: {
          root: "state",
          apps: "state/apps",
        },
      }),
    ).toThrow('formless.json state has unsupported key "apps".');
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

describe("workspace package links", () => {
  it("parses omitted package links as empty reviewable dependency config", () => {
    expect(WORKSPACE_PACKAGE_LINKS_FILE).toBe("formless.packages.json");
    expect(defaultWorkspacePackageLinks()).toEqual({
      version: WORKSPACE_PACKAGE_LINKS_VERSION,
      kind: WORKSPACE_PACKAGE_LINKS_KIND,
      links: [],
    });

    const links = parseWorkspacePackageLinks({
      version: 1,
      kind: "formless.workspacePackages",
    });
    const formatted = formatWorkspacePackageLinks(links);

    expect(links).toEqual(defaultWorkspacePackageLinks());
    expect(formatted).toBe(`${JSON.stringify(JSON.parse(formatted), null, 2)}\n`);
    expect(JSON.parse(formatted)).toEqual({
      version: 1,
      kind: "formless.workspacePackages",
      links: [],
    });
    expect(parseWorkspacePackageLinksJson(formatted)).toEqual(links);
  });

  it("parses and formats sibling app package manifest links", () => {
    const links = parseWorkspacePackageLinks({
      version: 1,
      kind: "formless.workspacePackages",
      links: [
        {
          manifest: "../app/formless.app.json",
        },
        {
          manifest: "packages/private-labs/formless.app.json",
        },
      ],
    });
    const formatted = formatWorkspacePackageLinks(links);

    expect(parseWorkspacePackageManifestLinkPath("package link", "../app/formless.app.json")).toBe(
      "../app/formless.app.json",
    );
    expect(links).toEqual({
      version: 1,
      kind: "formless.workspacePackages",
      links: [
        {
          manifest: "../app/formless.app.json",
        },
        {
          manifest: "packages/private-labs/formless.app.json",
        },
      ],
    });
    expect(JSON.parse(formatted)).toEqual({
      version: 1,
      kind: "formless.workspacePackages",
      links: [
        {
          manifest: "../app/formless.app.json",
        },
        {
          manifest: "packages/private-labs/formless.app.json",
        },
      ],
    });
    expect(parseWorkspacePackageLinksJson(formatted)).toEqual(links);
  });

  it("rejects duplicate package manifest links", () => {
    expect(() =>
      parseWorkspacePackageLinks({
        version: 1,
        kind: "formless.workspacePackages",
        links: [
          {
            manifest: "../app/formless.app.json",
          },
          {
            manifest: " ../app/formless.app.json ",
          },
        ],
      }),
    ).toThrow('formless.packages.json links has duplicate manifest "../app/formless.app.json".');
  });

  it("rejects invalid package manifest link paths", () => {
    for (const manifest of [
      "/app/formless.app.json",
      "https://example.com/formless.app.json",
      "file:///app/formless.app.json",
      "~/app/formless.app.json",
      "",
      " ",
      "packages\\app\\formless.app.json",
      "packages//app/formless.app.json",
      "packages/./app/formless.app.json",
      "packages/app/../formless.app.json",
      "packages/app/manifest.json",
    ]) {
      expect(() =>
        parseWorkspacePackageLinks({
          version: 1,
          kind: "formless.workspacePackages",
          links: [
            {
              manifest,
            },
          ],
        }),
      ).toThrow(/formless\.packages\.json links\[0\]\.manifest/);
    }
  });

  it("rejects unsupported fields and secret-looking package link fields", () => {
    expect(() =>
      parseWorkspacePackageLinks({
        version: 1,
        kind: "formless.workspacePackages",
        packages: [],
      }),
    ).toThrow('formless.packages.json has unsupported key "packages".');

    expect(() =>
      parseWorkspacePackageLinks({
        version: 1,
        kind: "formless.workspacePackages",
        links: [
          {
            manifest: "../app/formless.app.json",
            label: "Private app",
          },
        ],
      }),
    ).toThrow('formless.packages.json links[0] has unsupported key "label".');

    expect(() =>
      parseWorkspacePackageLinks({
        version: 1,
        kind: "formless.workspacePackages",
        links: [
          {
            manifest: "../app/formless.app.json",
            adminToken: "secret",
          },
        ],
      }),
    ).toThrow(
      'formless.packages.json must not store secret field "formless.packages.json.links[0].adminToken".',
    );
  });
});

describe("workspace operation contracts", () => {
  it("defines workspace operation definitions and derived kind sets", () => {
    expect(WORKSPACE_OPERATION_CAPABILITIES).toEqual([
      "workspace-read",
      "workspace-source-write",
      "workspace-source-sync",
      "credential-setup",
      "deployment-plan",
      "deployment-apply",
      "deployment-observe",
    ]);
    expect(WORKSPACE_OPERATION_KEYS).toEqual([
      "workspace.source.check",
      "workspace.credentials.setup",
      "deployment.refresh",
      "deployment.apply",
      "deployment.plan",
      "workspace.init",
      "workspace.source.pull",
      "workspace.source.push",
      "workspace.source.save",
      "workspace.status",
    ]);
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
    expect(WORKSPACE_OPERATION_KINDS).toEqual(
      WORKSPACE_OPERATION_DEFINITIONS.map((definition) => definition.kind),
    );
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
    expect(WORKSPACE_BROWSER_OPERATION_KINDS).toEqual(
      WORKSPACE_OPERATION_DEFINITIONS.filter((definition) => "gateway" in definition.bindings).map(
        (definition) => definition.kind,
      ),
    );
    expect(WORKSPACE_CLI_OPERATION_KINDS).toEqual([
      "deployApply",
      "deployPlan",
      "pull",
      "push",
      "save",
    ]);
    expect(WORKSPACE_CLI_OPERATION_COMMANDS).toEqual([
      "formless deploy",
      "formless deploy --dry-run",
      "formless pull",
      "formless push",
      "formless save",
    ]);
    expect(WORKSPACE_BOOTSTRAP_OPERATION_KINDS).toEqual(["status"]);
    expect(isWorkspaceOperationKind("init")).toBe(true);
    expect(isWorkspaceBrowserOperationKind("init")).toBe(false);
    expect(isWorkspaceBrowserOperationKind("deploymentRefresh")).toBe(true);
    expect(isWorkspaceBrowserOperationKind("credentialSetup")).toBe(true);
    expect(isWorkspaceCliOperationKind("push")).toBe(true);
    expect(isWorkspaceCliCommandName("formless push")).toBe(true);
    expect(isWorkspaceCliCommandName("formless instance push")).toBe(false);
    expect(isWorkspaceCliCommandName("formless instance owner setup")).toBe(false);

    expect(workspaceOperationDefinitionForKey("workspace.status")).toMatchObject({
      handlerKey: "workspace.status",
      kind: "status",
      mode: "read",
      requiredCapability: "workspace-read",
    });
    expect(workspaceOperationDefinitionForKind("deployApply")).toMatchObject({
      handlerKey: "deployment.apply",
      key: "deployment.apply",
      requiredCapability: "deployment-apply",
    });
    expect(workspaceOperationDefinitionForKind("save").bindings.cli?.commands).toEqual([
      "formless save",
    ]);
    expect(workspaceOperationDefinitionForCliCommand("formless deploy")).toMatchObject({
      handlerKey: "deployment.apply",
      kind: "deployApply",
    });
    expect(workspaceOperationDefinitionForCliCommand("formless deploy --dry-run")).toMatchObject({
      handlerKey: "deployment.plan",
      kind: "deployPlan",
    });
    expect("gateway" in workspaceOperationDefinitionForKind("init").bindings).toBe(false);
    expect(workspaceOperationDefinitionForKind("status").bindings.gateway).toEqual({
      bootstrap: true,
      inputFields: ["includeDeploymentStatus", "targetAlias"],
      requestKind: "status",
    });
    expect(workspaceOperationDefinitionForKind("save").bindings.gateway?.inputFields).toEqual([
      "check",
    ]);
    expect(workspaceOperationDefinitionForKind("push").bindings.gateway?.inputFields).toEqual([
      "allowStale",
      "apply",
      "replace",
      "replaceInstallSet",
      "targetAlias",
    ]);
    expect(workspaceOperationInputDefaults("push")).toEqual({
      allowStale: false,
      apply: false,
      replace: false,
      replaceInstallSet: false,
    });
    expect(workspaceOperationInputFieldDefaultValue("save", "check")).toBe(false);
  });

  it("matches operations against actor policy and required execution capability", () => {
    expect(
      Object.fromEntries(
        [
          "check",
          "credentialSetup",
          "deploymentRefresh",
          "deployApply",
          "deployPlan",
          "status",
        ].map((kind) => [
          kind,
          workspaceOperationRequiredCapability(kind as (typeof WORKSPACE_OPERATION_KINDS)[number]),
        ]),
      ),
    ).toEqual({
      check: "workspace-read",
      credentialSetup: "credential-setup",
      deploymentRefresh: "deployment-observe",
      deployApply: "deployment-apply",
      deployPlan: "deployment-plan",
      status: "workspace-read",
    });

    expect(workspaceOperationActorAllowed("deployPlan", "browser")).toBe(true);
    expect(workspaceOperationCapabilityAllowed("deployPlan", ["deployment-plan"])).toBe(true);
    expect(
      workspaceOperationExecutionDecision({
        actor: "browser",
        capabilities: ["deployment-plan"],
        kind: "deployPlan",
      }),
    ).toEqual({ ok: true });
    expect(
      workspaceOperationExecutionDecision({
        actor: "browser",
        capabilities: ["deployment-apply"],
        kind: "deployPlan",
      }),
    ).toEqual({
      error: 'Workspace operation "deployPlan" requires execution capability "deployment-plan".',
      ok: false,
      requiredCapability: "deployment-plan",
    });
  });

  it("derives operation mode, bootstrap availability, and display inputs", () => {
    expect(workspaceOperationMode("status")).toBe("read");
    for (const operation of WORKSPACE_OPERATION_KINDS.filter((kind) => kind !== "status")) {
      expect(workspaceOperationMode(operation)).toBe("write");
    }
    expect(workspaceOperationBootstrapAllowed("status")).toBe(true);
    expect(workspaceOperationBootstrapAllowed("save")).toBe(false);

    expect(workspaceOperationInputDisplay({ kind: "init", name: "personal-sites" })).toEqual({
      name: "personal-sites",
    });
    expect(workspaceOperationInputDisplay({ kind: "status" })).toEqual({
      includeDeploymentStatus: false,
    });
    expect(workspaceOperationInputDisplay({ check: true, kind: "save", source: "cli" })).toEqual({
      check: true,
      source: "cli",
    });
    expect(workspaceOperationInputDisplay({ kind: "check", targetAlias: "remote" })).toEqual({
      targetAlias: "remote",
    });
    expect(workspaceOperationInputDisplay({ kind: "pull" })).toEqual({});
    expect(
      workspaceOperationInputDisplay({
        apply: true,
        kind: "push",
        replaceInstallSet: true,
        targetAlias: "remote",
      }),
    ).toEqual({
      allowStale: false,
      apply: true,
      replace: false,
      replaceInstallSet: true,
      targetAlias: "remote",
    });
    expect(workspaceOperationInputDisplay({ kind: "deployPlan", migrationPolicy: "new" })).toEqual({
      migrationPolicy: "new",
    });
    expect(workspaceOperationInputDisplay({ kind: "deployApply", targetAlias: "remote" })).toEqual({
      targetAlias: "remote",
    });
    expect(workspaceOperationInputDisplay({ kind: "deploymentRefresh" })).toEqual({});
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
      steps: [
        {
          detail: `${workspaceRoot}/deploy output`,
          error: "Health check failed with TOKEN=secret",
          fields: {
            expectedUrl: "https://personal.dpeek.workers.dev",
            rawAdapterOutput: "TOKEN=secret",
          },
          id: "health-check",
          label: "Health check",
          status: "failed",
        },
      ],
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
    expect(updated.steps?.[0]).toMatchObject({
      detail: "<workspace>/deploy output",
      error: "Health check failed with TOKEN=[redacted]",
      fields: {
        expectedUrl: "https://personal.dpeek.workers.dev",
        rawAdapterOutput: "[redacted]",
      },
    });
    expect(updated.events[0]?.url).toBe("https://dash.cloudflare.com/oauth2/authorize?account=123");
    expect(text).not.toContain(workspaceRoot);
    expect(text).not.toContain("secret-token");
    expect(text).toContain(ownerSetupUrl);
  });
});

describe("workspace auto-save state contracts", () => {
  it("tracks dirty, in-flight, saved, failed, and suppressed generations", () => {
    const now = timestampSequence(
      "2026-06-02T00:00:00.000Z",
      "2026-06-02T00:00:01.000Z",
      "2026-06-02T00:00:02.000Z",
      "2026-06-02T00:00:03.000Z",
      "2026-06-02T00:00:04.000Z",
      "2026-06-02T00:00:05.000Z",
      "2026-06-02T00:00:06.000Z",
    );

    const initial = initialWorkspaceAutoSaveState({ now });
    const queued = nextWorkspaceAutoSaveEnqueuedState(initial, {
      now,
      source: "app-operation",
      storageIdentity: "app:site",
    });
    const saving = nextWorkspaceAutoSaveSavingState(queued, { now });
    const coalesced = nextWorkspaceAutoSaveEnqueuedState(saving, {
      now,
      source: "schema-save",
      storageIdentity: "app:site",
    });
    const stillQueued = nextWorkspaceAutoSaveSavedState(coalesced, { now });
    const failed = nextWorkspaceAutoSaveFailedState(stillQueued, {
      error: new Error("/workspace/state failed TOKEN=secret"),
      now,
      workspaceRoot: "/workspace",
    });
    const suppressed = nextWorkspaceAutoSaveSuppressedState(failed, {
      now,
      reason: "manual-save",
    });

    expect(initial).toEqual({
      dirtyGeneration: 0,
      displayState: "clean",
      kind: WORKSPACE_AUTO_SAVE_STATE_FILE_KIND,
      retryCount: 0,
      savedGeneration: 0,
      storageIdentities: [],
      updatedAt: "2026-06-02T00:00:00.000Z",
      version: WORKSPACE_AUTO_SAVE_STATE_FILE_VERSION,
      writeSources: [],
    });
    expect(queued).toMatchObject({
      dirtyGeneration: 1,
      displayState: "queued",
      lastEnqueueAt: "2026-06-02T00:00:01.000Z",
      storageIdentities: ["app:site"],
      writeSources: ["app-operation"],
    });
    expect(coalesced).toMatchObject({
      dirtyGeneration: 2,
      displayState: "saving",
      inFlightGeneration: 1,
      storageIdentities: ["app:site"],
      writeSources: ["app-operation", "schema-save"],
    });
    expect(stillQueued).toMatchObject({
      dirtyGeneration: 2,
      displayState: "queued",
      savedGeneration: 1,
      writeSources: ["app-operation", "schema-save"],
    });
    expect(failed).toMatchObject({
      displayState: "failed",
      dirtyGeneration: 2,
      retryCount: 1,
    });
    expect(failed.error?.message).toBe("<workspace>/state failed TOKEN=[redacted]");
    expect(suppressed.suppressed).toEqual({
      at: "2026-06-02T00:00:06.000Z",
      reason: "manual-save",
    });
  });

  it("parses and formats display-safe auto-save state", () => {
    const state = nextWorkspaceAutoSaveSavedState(
      nextWorkspaceAutoSaveSavingState(
        nextWorkspaceAutoSaveEnqueuedState(
          initialWorkspaceAutoSaveState({
            now: () => "2026-06-02T00:00:00.000Z",
          }),
          {
            now: () => "2026-06-02T00:00:01.000Z",
            source: "deployment-intent",
            storageIdentity: "instance:control-plane",
          },
        ),
        { now: () => "2026-06-02T00:00:02.000Z" },
      ),
      { now: () => "2026-06-02T00:00:03.000Z" },
    );
    const formatted = formatWorkspaceAutoSaveState(state);

    expect(WORKSPACE_AUTO_SAVE_STATE_FILE).toBe("auto-save.json");
    expect(WORKSPACE_AUTO_SAVE_WRITE_SOURCES).toContain("deployment-intent");
    expect(WORKSPACE_AUTO_SAVE_SUPPRESSION_REASONS).toContain("workspace-pull");
    expect(isWorkspaceAutoSaveWriteSource("media-reference")).toBe(true);
    expect(isWorkspaceAutoSaveWriteSource("raw-upload")).toBe(false);
    expect(isWorkspaceAutoSaveSuppressionReason("auto-save")).toBe(true);
    expect(formatted).toBe(`${JSON.stringify(JSON.parse(formatted), null, 2)}\n`);
    expect(parseWorkspaceAutoSaveStateJson(formatted)).toEqual(state);
    expect(() =>
      parseWorkspaceAutoSaveStateJson(JSON.stringify({ ...state, writeSources: ["raw-upload"] })),
    ).toThrow("Workspace auto-save state file is invalid.");
  });
});

function layoutManifestSource(): Record<string, unknown> {
  return {
    version: 1,
    kind: "formless-instance-workspace",
    name: "personal-sites",
    state: {
      root: "state",
    },
    media: {
      root: "state/media",
    },
    local: {
      stateRoot: ".formless/local",
      secretStateRoot: ".formless",
    },
  };
}

function timestampSequence(...timestamps: string[]): () => string {
  let index = 0;

  return () =>
    timestamps[index++ % timestamps.length] ?? timestamps.at(-1) ?? new Date(0).toISOString();
}
