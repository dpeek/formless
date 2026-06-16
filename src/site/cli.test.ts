import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  archiveApps,
  parsePortableArchive,
  type AppArchive,
  type InstanceArchive,
} from "@dpeek/formless-archive";
import {
  writePortableArchiveDirectory,
  type ArchiveDiskMediaFile,
} from "@dpeek/formless-archive/node";
import type {
  CloudflareDnsRecord,
  CloudflareDomainClient,
  CloudflareWorkerDomain,
  CloudflareWorkerRoute,
  CloudflareZone,
} from "./cloudflare-domain-client.ts";
import {
  listInstallableAppPackages,
  packageAppFactsForKey,
  type InstallableAppPackage,
} from "@dpeek/formless-installed-apps";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageResolver,
} from "../shared/app-packages.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { STORAGE_SNAPSHOT_KIND, STORAGE_SNAPSHOT_VERSION } from "@dpeek/formless-storage";
import type { StorageSnapshot, StoredRecord } from "@dpeek/formless-storage";
import {
  INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
  INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
  instanceControlPlaneSchema,
} from "@dpeek/formless-instance-control-plane";
import { computeSourceSchemaHash, type SourceSchemaHash } from "../shared/upgrade-migrations.ts";
import { FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME } from "../shared/workspace-runtime-packages.ts";
import {
  LOCAL_SESSION_BOOTSTRAP_API_PATH,
  LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV,
  WORKSPACE_GATEWAY_PROXY_TOKEN_ENV,
  WORKSPACE_GATEWAY_SIDECAR_URL_ENV,
} from "@dpeek/formless-gateway";
import {
  INSTANCE_WORKSPACE_MANIFEST_FILE as FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  defaultWorkspacePackageLinks,
  defaultInstanceWorkspaceManifest as defaultFormlessInstanceWorkspaceManifest,
  formatInstanceWorkspaceManifest as formatFormlessInstanceWorkspaceManifest,
  formatWorkspacePackageLinks,
  parseInstanceWorkspaceManifestJson as parseFormlessInstanceWorkspaceManifestJson,
} from "@dpeek/formless-workspace";
import {
  crmSeedRecords,
  crmSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { formlessCliUsage, normalizeSourceUrl, parseFormlessCliArgs } from "./cli-command.ts";
import {
  instanceWorkspaceInstanceStatePath,
  instanceWorkspaceMediaFilePath,
  listWorkspaceOperationStates,
  readInstanceWorkspaceControlPlaneStorageSnapshot,
  writeInstanceWorkspaceAppStorageSnapshot,
  writeInstanceWorkspaceControlPlaneStorageSnapshot,
} from "@dpeek/formless-workspace/node";
import {
  FORMLESS_ALCHEMY_APP_NAME,
  discoverFormlessInstanceWorkspaceRoot,
  exportAppArchive,
  exportInstanceArchive,
  formlessInstanceWorkspaceDevEnv,
  initFormlessInstanceWorkspace,
  planFormlessInstanceDeployment,
  resolveFormlessInstanceWorkspaceRoot,
  resetFormlessInstanceWorkspaceLocalState,
  restoreAppArchive,
  restorePortableArchive,
  runFormlessCli,
  workspaceDomainProviderAlchemyRuntime,
  type CheckFormlessInstanceDeployMetadataInput,
  type CreateFormlessInstanceOwnerSetupCapabilityInput,
  type DeployFormlessInstanceInput,
  type DestroyFormlessInstanceInput,
  type DestroyFormlessInstanceResult,
  type DomainProviderAlchemyRuntime,
  type FormlessCliDependencies,
  type FormlessCliRunCommandOptions,
  type FormlessInstanceWorkspaceProviderContext,
  type WriteFormlessInstanceStateInput,
} from "./cli.ts";

const tempDirs: string[] = [];
const setupToken = "abcDEF0123456789_-abcDEF0123456789_-";

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless Site CLI", () => {
  it("keeps top-level help aliases and usage output stable", async () => {
    const usage = [
      "Usage: formless <command>",
      "",
      "Commands:",
      "  dev [--workspace <path>] [--open]   Run local workspace and browser setup",
      "  save [--workspace <path>] [--check] Save Authority state to storage snapshots",
      "  pull [--workspace <path>] [--target <alias>]",
      "                                      Pull remote instance state into workspace source",
      "  push [--workspace <path>] [--target <alias>]",
      "       [--apply] [--replace] [--allow-stale] [--replace-install-set]",
      "  deploy [--workspace <path>] [--target <alias>] [--dry-run]",
      "       [--migration-policy <new|existing>] Deploy workspace source and desired resources",
      "  destroy [--workspace <path>] [--target <alias>] --confirm <workerName>",
      "  owner setup [--workspace <path>] [--target <alias>]",
      "       [--open] [--admin-token <token>]",
      "  token <adopt|rotate> [--workspace <path>] [--target <alias>]",
      "       [--admin-token <token>]",
    ].join("\n");
    const logs: string[] = [];

    expect(formlessCliUsage()).toBe(usage);
    expect(parseFormlessCliArgs([])).toEqual({ kind: "help" });
    expect(parseFormlessCliArgs(["help"])).toEqual({ kind: "help" });
    expect(parseFormlessCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseFormlessCliArgs(["-h"])).toEqual({ kind: "help" });

    await runFormlessCli(["help"], cliDeps(process.cwd(), { logs }));

    expect(logs).toEqual([usage]);
  });

  it("parses top-level workspace command shortcuts", () => {
    expect(parseFormlessCliArgs(["dev"])).toEqual({
      kind: "workspaceDev",
      open: false,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["dev", "--workspace", "../personal"])).toEqual({
      kind: "workspaceDev",
      open: false,
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["dev", "--workspace", "../personal", "--open"])).toEqual({
      kind: "workspaceDev",
      open: true,
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["save", "--workspace", "../personal", "--check"])).toEqual({
      check: true,
      kind: "workspaceSave",
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["pull", "--workspace", "../personal"])).toEqual({
      kind: "workspacePull",
      targetAlias: null,
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "push",
        "--target",
        "remote",
        "--apply",
        "--replace",
        "--allow-stale",
        "--replace-install-set",
      ]),
    ).toEqual({
      allowStale: true,
      apply: true,
      kind: "workspacePush",
      replace: true,
      replaceInstallSet: true,
      targetAlias: "remote",
      workspacePath: null,
    });
    expect(
      parseFormlessCliArgs([
        "deploy",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--dry-run",
        "--migration-policy",
        "existing",
      ]),
    ).toEqual({
      dryRun: true,
      kind: "workspaceDeploy",
      migrationPolicy: "existing",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "destroy",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--confirm",
        "personal",
      ]),
    ).toEqual({
      confirm: "personal",
      kind: "workspaceDestroy",
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "owner",
        "setup",
        "--workspace",
        "../personal",
        "--target",
        "remote",
        "--open",
        "--admin-token",
        "secret",
      ]),
    ).toEqual({
      adminToken: "secret",
      kind: "workspaceOwnerSetup",
      open: true,
      targetAlias: "remote",
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["token", "adopt", "--admin-token", "secret"])).toEqual({
      adminToken: "secret",
      kind: "workspaceTokenAdopt",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["token", "rotate"])).toEqual({
      adminToken: null,
      kind: "workspaceTokenRotate",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs([])).toEqual({ kind: "help" });
  });

  it("keeps CLI parse error messages stable", () => {
    expect(() => parseFormlessCliArgs(["unknown"])).toThrow("Unknown command: unknown");
    expect(() => parseFormlessCliArgs(["init"])).toThrow("Unknown command: init");
    expect(() => parseFormlessCliArgs(["dev", "--help"])).toThrow(
      "Usage: formless dev [--workspace <path>] [--open]",
    );
    expect(() => parseFormlessCliArgs(["dev", "--verbose"])).toThrow(
      "Unknown option for formless dev: --verbose",
    );
    expect(() => parseFormlessCliArgs(["save", "--workspace"])).toThrow(
      "Missing value for --workspace.",
    );
    expect(() => parseFormlessCliArgs(["save", "--force"])).toThrow(
      "Unknown option for formless save: --force",
    );
    expect(() => parseFormlessCliArgs(["pull", "--target", "Remote"])).toThrow(
      "Formless instance workspace target alias must start with a lowercase letter",
    );
    expect(() => parseFormlessCliArgs(["push", "--force"])).toThrow(
      "Unknown option for formless push: --force",
    );
    expect(() => parseFormlessCliArgs(["deploy", "--migration-policy", "auto"])).toThrow(
      'formless deploy --migration-policy must be "new" or "existing".',
    );
    expect(() => parseFormlessCliArgs(["destroy"])).toThrow(
      "Missing required option for formless destroy: --confirm.",
    );
    expect(() => parseFormlessCliArgs(["destroy", "--confirm"])).toThrow(
      "Missing value for --confirm.",
    );
    expect(() => parseFormlessCliArgs(["destroy", "--confirm", "personal", "--force"])).toThrow(
      "Unknown option for formless destroy: --force",
    );
    expect(() => parseFormlessCliArgs(["owner"])).toThrow("Usage: formless owner <setup>");
    expect(() => parseFormlessCliArgs(["owner", "setup", "--force"])).toThrow(
      "Unknown option for formless owner setup: --force",
    );
    expect(() => parseFormlessCliArgs(["token", "forget"])).toThrow(
      "Usage: formless token <adopt|rotate>",
    );
    expect(() => parseFormlessCliArgs(["publish", "--force"])).toThrow("Unknown command: publish");
  });

  it("parses local-first command defaults", () => {
    expect(parseFormlessCliArgs(["save"])).toEqual({
      check: false,
      kind: "workspaceSave",
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["pull"])).toEqual({
      kind: "workspacePull",
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["push"])).toEqual({
      allowStale: false,
      apply: false,
      kind: "workspacePush",
      replace: false,
      replaceInstallSet: false,
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["deploy"])).toEqual({
      dryRun: false,
      kind: "workspaceDeploy",
      migrationPolicy: null,
      targetAlias: null,
      workspacePath: null,
    });
    expect(parseFormlessCliArgs(["destroy", "--confirm", "personal"])).toEqual({
      confirm: "personal",
      kind: "workspaceDestroy",
      targetAlias: null,
      workspacePath: null,
    });
  });

  it("rejects removed public command families", () => {
    const removedCommands = [
      ["archive", "export"],
      ["archive", "restore"],
      ["check"],
      ["domains", "forget-redirect"],
      ["domains", "forget-route"],
      ["domains", "mark-manually-removed"],
      ["domains", "plan"],
      ["domains", "run-delete"],
      ["init"],
      ["instance", "pull"],
      ["instance", "push"],
      ["instance", "status"],
      ["refresh"],
      ["reset-local"],
      ["status"],
    ];

    for (const args of removedCommands) {
      expect(() => parseFormlessCliArgs(args)).toThrow(`Unknown command: ${args[0]}`);
    }
  });

  it("rejects removed public command families before side effects", async () => {
    const tempDir = await makeTempDir();
    const requests: CapturedFetchRequest[] = [];
    const commands: CapturedCommand[] = [];
    const healthInputs: CheckFormlessInstanceDeployMetadataInput[] = [];
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const removedCommands = [
      ["archive", "export", "--target", "https://instance.example"],
      ["archive", "restore", "--target", "https://instance.example"],
      ["check"],
      ["domains", "forget-redirect", "--host", "old.example"],
      ["domains", "forget-route", "--host", "old.example"],
      ["domains", "mark-manually-removed", "--host", "old.example"],
      ["domains", "plan"],
      ["domains", "run-delete", "--host", "old.example"],
      ["init"],
      ["instance", "pull"],
      ["instance", "push"],
      ["instance", "status"],
      ["refresh"],
      ["reset-local"],
      ["status"],
    ];
    const dependencies = cliDeps(tempDir, {
      commands,
      fetch: responseQueue().fetcher(requests),
      healthInputs,
      logs,
      openedUrls,
      setupInputs,
      stateWrites,
    });

    for (const args of removedCommands) {
      await expect(runFormlessCli(args, dependencies)).rejects.toThrow(
        `Unknown command: ${args[0]}`,
      );
    }

    expect(requests).toEqual([]);
    expect(commands).toEqual([]);
    expect(healthInputs).toEqual([]);
    expect(logs).toEqual([]);
    expect(openedUrls).toEqual([]);
    expect(setupInputs).toEqual([]);
    expect(stateWrites).toEqual([]);
  });

  it("initializes an instance workspace from remote target status", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({
      setupComplete: true,
      owner: {
        createdAt: "2026-05-01T00:00:00.000Z",
        email: "david@example.com",
        id: "owner-1",
        name: "David Peek",
      },
    });
    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [installedSite("david", "David Peek"), installedSite("james", "James Peek")],
    });

    const result = await initFormlessInstanceWorkspace(
      {
        fromRemote: true,
        name: "personal-sites",
        targetAlias: "prod",
        targetUrl: "https://personal.dpeek.workers.dev/setup?token=ignored",
        workspacePath: workspaceRoot,
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(manifest).toEqual(layoutWorkspaceManifest("personal-sites"));
    expect(result.remoteStatus?.deployMetadata.version).toBe(packageJson.version);
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
    ]);
  });

  it("initializes a fresh instance workspace from a local instance archive", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const archiveRoot = path.join(workspaceRoot, "archives/instance");

    await mkdir(archiveRoot, { recursive: true });
    await writeFile(
      path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
      JSON.stringify(instanceArchive([appArchive("david", "David Peek")]), null, 2),
    );

    const result = await initFormlessInstanceWorkspace(
      {
        fromArchive: archiveRoot,
        name: "personal-sites",
        workspacePath: workspaceRoot,
      },
      cliDeps(tempDir),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(manifest).toEqual(layoutWorkspaceManifest("personal-sites"));
    expect(result.archiveSourcePath).toBe("archives/instance");
  });

  it("discovers nearest Formless workspace manifest and rejects legacy manifest names", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const nestedRoot = path.join(workspaceRoot, "app", "site");

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(nestedRoot, { recursive: true });

    await expect(discoverFormlessInstanceWorkspaceRoot(nestedRoot)).resolves.toEqual({
      manifestPath: path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      workspaceRoot,
    });
    await expect(resolveFormlessInstanceWorkspaceRoot({ cwd: nestedRoot })).resolves.toBe(
      workspaceRoot,
    );

    for (const fileName of ["formless.instance-workspace.json", "formless-workspace.json"]) {
      const legacyRoot = path.join(tempDir, fileName.replace(".json", ""));
      const legacyPath = path.join(legacyRoot, fileName);

      await mkdir(path.join(legacyRoot, "nested"), { recursive: true });
      await writeFile(legacyPath, "{}");
      await expect(
        discoverFormlessInstanceWorkspaceRoot(path.join(legacyRoot, "nested")),
      ).rejects.toThrow(
        `Legacy Formless workspace manifest found at ${legacyPath}. Local-first workspaces use ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE}; run \`formless dev\` and complete setup in the browser.`,
      );
      await expect(
        runFormlessCli(["pull", "--workspace", legacyRoot], cliDeps(tempDir)),
      ).rejects.toThrow(
        `Legacy Formless workspace manifest found at ${legacyPath}. Local-first workspaces use ${FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE}; run \`formless dev\` and complete setup in the browser.`,
      );
    }
  });

  it("creates one owner setup URL with focused bootstrap reads and no secret logging", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const setupUrl = `https://personal.dpeek.workers.dev/setup?token=${setupToken}`;

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ setupComplete: false });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--admin-token", "explicit-admin-token"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "explicit-admin-token",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(logs).toEqual([
      [
        "Instance owner setup URL created.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Owner setup: incomplete.",
        `Setup URL: ${setupUrl}.`,
        "Browser opened: no.",
      ].join("\n"),
    ]);
    expect(logs.join("\n")).not.toContain("explicit-admin-token");
    expect(logs.join("\n")).not.toContain("/setup/capability");
    expect(logs.join("\n")).not.toContain("capabilityCreated");
  });

  it("reports complete owner setup without creating a capability or opening a browser", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({
      setupComplete: true,
      owner: {
        createdAt: "2026-05-01T00:00:00.000Z",
        email: "david@example.com",
        id: "owner-1",
        name: "David Peek",
      },
    });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        openedUrls,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([]);
    expect(openedUrls).toEqual([]);
    expect(logs).toEqual([
      [
        "Instance owner setup already complete.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Owner setup: complete (David Peek <david@example.com>).",
      ].join("\n"),
    ]);
  });

  it("requires an admin token after reading incomplete owner setup status", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    responses.queueJson({ setupComplete: false });

    await expect(
      runFormlessCli(
        ["owner", "setup", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          fetch: responses.fetcher(requests),
          openedUrls,
          setupInputs,
        }),
      ),
    ).rejects.toThrow(
      "Formless owner setup requires an admin token; run `formless token adopt` or pass --admin-token.",
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([]);
    expect(openedUrls).toEqual([]);
  });

  it("opens owner setup URL from ignored secret state without logging the admin token", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const setupUrl = `https://personal.dpeek.workers.dev/setup?token=${setupToken}`;

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-admin-token\n",
    );

    responses.queueJson({ setupComplete: false });

    await runFormlessCli(
      ["owner", "setup", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
        openedUrls,
        setupInputs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
    ]);
    expectNoOwnerSetupProtectedBootstrapReads(requests);
    expect(setupInputs).toEqual([
      {
        adminToken: "local-admin-token",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(openedUrls).toEqual([setupUrl]);
    expect(logs.at(-1)).toContain(`Setup URL: ${setupUrl}.`);
    expect(logs.at(-1)).toContain("Browser opened: yes.");
    expect(logs.join("\n")).not.toContain("local-admin-token");
    expect(logs.join("\n")).not.toContain("generated-token");
    expect(logs.join("\n")).not.toContain("/setup/capability");
  });

  it("pulls instance workspace archives from the control-plane target URL", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const installs = [installedSite("david", "David Peek"), installedSite("james", "James Peek")];
    const fetcher = archiveFetch(
      requests,
      installs,
      {
        david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
        james: { records: [] },
      },
      [],
      [domainMapping("dpeek.com", "david"), domainMapping("www.dpeek.com", "david")],
      controlPlaneRecords(),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-archive-token\n",
    );

    await runFormlessCli(
      ["pull", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    const pulledControlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest: parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
      workspaceRoot,
    });

    expect(
      pulledControlPlane?.records
        .map((record) => `${record.entity}:${record.id}`)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(
      [
        "app-install:david",
        "deployment-config:instance.primary",
        "route:route:david:admin",
        "route:route:david:public-site",
        "route:route:david:schema",
        "route:route:host:publicSite:dpeek.com",
      ].sort((left, right) => left.localeCompare(right)),
    );
    expect(JSON.stringify(pulledControlPlane)).not.toContain("CF_API_TOKEN");
    expect(JSON.stringify(pulledControlPlane)).not.toContain("rec_site");
    await expect(
      readFile(path.join(workspaceRoot, "state/media/media/david/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    await expect(
      readFile(path.join(workspaceRoot, "state/apps/james.json"), "utf8"),
    ).resolves.toContain('"storageIdentity": "app:james"');
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/formless/control-plane/snapshot?actorKind=cliDeployer",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/david/snapshot",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/james/snapshot",
      "GET https://personal.dpeek.workers.dev/api/formless/media/media/images/cover.png",
      "GET https://personal.dpeek.workers.dev/api/formless/domain-mappings",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual(
      requests.map(() => "Bearer stored-archive-token"),
    );
    expect(logs).toEqual([
      [
        "Workspace operation: pull (succeeded).",
        "Workspace source: layout-only manifest, storage snapshots, media payloads.",
        "Summary: Workspace pulled.",
        "appCount: 2.",
        "mediaCount: 1.",
        "recordCount: 2.",
        "Details:",
        "appState: david, james.",
        "domainCount: 2.",
        "target: instance.primary.",
      ].join("\n"),
    ]);
    expect(logs.join("\n")).not.toContain("stored-archive-token");
    expect(JSON.stringify(pulledControlPlane)).not.toContain("stored-archive-token");
    await expect(
      readFile(path.join(workspaceRoot, "state/apps/david.json")),
    ).resolves.not.toContain("stored-archive-token");
  });

  it("binds workspace domain provider cleanup to the instance Alchemy app and deploy state root", async () => {
    const selectedTarget = {
      alias: "remote",
      url: "https://personal.dpeek.workers.dev",
    };
    const deploymentStateRoot = "/workspace/.formless/deploy/personal";
    const context: FormlessInstanceWorkspaceProviderContext = {
      credentialProfile: "personal-profile",
      deploymentStatePath: path.join(deploymentStateRoot, "formless.instance.json"),
      deploymentStateRoot,
      localSecretPath: path.join(deploymentStateRoot, "deploy.env"),
      manifest: {
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        state: { root: "state" },
        defaultTarget: "remote",
        targets: [selectedTarget],
        media: { root: "media" },
        local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
        defaultAppPolicy: "declared-installs",
        apps: [workspaceApp("david", "David Peek")],
      },
      plan: planFormlessInstanceDeployment({
        account: {
          id: "account-123",
          workersDevSubdomain: "dpeek",
        },
        instanceName: "personal",
        mediaBucketName: "personal-media",
        migrationPolicy: "existing",
        packageVersion: packageJson.version,
      }),
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        CLOUDFLARE_API_TOKEN: "state-cf-token",
      },
      selectedTarget,
      workspaceRoot: "/workspace",
    };
    const runtimeInputs: unknown[] = [];
    const fakeRuntime: DomainProviderAlchemyRuntime = {
      factories: {} as DomainProviderAlchemyRuntime["factories"],
      password: "alchemy-password",
      runner: async (_appName, _options, apply) => apply(),
    };

    const runtime = workspaceDomainProviderAlchemyRuntime(context, async (input) => {
      runtimeInputs.push(input);

      return fakeRuntime;
    });
    if (!runtime) {
      throw new Error("Expected workspace domain provider runtime.");
    }
    const result = await runtime({
      accountId: "account-123",
      env: {
        ALCHEMY_PASSWORD: "ambient-password",
        CLOUDFLARE_API_TOKEN: "ambient-token",
        UNRELATED: "kept",
      },
    });

    expect(result).toBe(fakeRuntime);
    expect(runtimeInputs).toEqual([
      {
        accountId: "account-123",
        appName: FORMLESS_ALCHEMY_APP_NAME,
        env: {
          ALCHEMY_PASSWORD: "alchemy-password",
          ALCHEMY_PROFILE: "personal-profile",
          CLOUDFLARE_API_TOKEN: "state-cf-token",
          UNRELATED: "kept",
        },
        rootDir: deploymentStateRoot,
        stage: "personal",
      },
    ]);
  });

  it("pushes workspace app archives to the control-plane target URL as a dry-run by default", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([4, 5, 6]),
      records: mediaRecords(),
    });
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek"), installedSite("extra", "Extra")],
      {
        david: { records: [] },
        extra: { records: [] },
      },
      [
        {
          ok: false,
          errors: [{ message: 'Installed app "david" already exists.' }],
        },
      ],
      [],
      [],
      controlPlaneRecords(),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid, Buffer.from([4, 5, 6]));
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{ archive: InstanceArchive }>(restoreRequest);

    expect(`${restoreRequest?.method} ${restoreRequest?.url}`).toBe(
      "POST https://personal.dpeek.workers.dev/api/formless/archive/restore",
    );
    expect(restoreRequest?.headers.authorization).toBe("Bearer local-token");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: true,
      installCollisions: "reject",
    });
    expect(restoreBody.archive.capabilities).toEqual([
      "installed-app-registry",
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ]);
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(restoreBody.archive.controlPlane?.records.map((record) => record.entity)).toEqual([
      "app-install",
      "deployment-config",
      "route",
      "route",
      "route",
      "route",
    ]);
    expect(logs).toHaveLength(1);

    expect(logs[0]).toContain("Workspace operation: push (succeeded).");
    expect(logs[0]).toContain("mode: dry-run.");
    expect(logs[0]).toContain("target: instance.primary.");
    expect(logs[0]).toContain("dryRunRestoreOk: false.");
    expect(logs[0]).toContain("drift: drift.");
  });

  it("pushes redirect route storage snapshot records through the composed workspace archive", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, [
      ...controlPlaneRecords(),
      redirectRouteRecord("old.dpeek.com", "dpeek.com"),
    ]);
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/instance"), {
      ...instanceArchive([localDavid]),
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: controlPlaneSnapshot([redirectRouteRecord("old.dpeek.com", "dpeek.com")]),
    });
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--replace"],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    const restoreRequest = requests.find(
      (request) =>
        request.method === "POST" &&
        request.url === "https://personal.dpeek.workers.dev/api/formless/archive/restore",
    );
    const restoreBody = capturedRequestJson<{ archive: InstanceArchive }>(restoreRequest);

    expect(
      restoreBody.archive.controlPlane?.records.map((record) => `${record.entity}:${record.id}`),
    ).toContain("route:route:redirect:old.dpeek.com");
    expect(
      restoreBody.archive.controlPlane?.records.find(
        (record) => record.id === "route:redirect:old.dpeek.com",
      )?.values,
    ).toMatchObject({
      kind: "redirect",
      matchHost: "old.dpeek.com",
      preservePath: true,
      preserveQueryString: true,
      statusCode: "308",
      toHost: "dpeek.com",
    });
    expect(JSON.stringify(restoreBody.archive.controlPlane)).not.toContain("redirect-intent");
    expect(logs[0]).toContain("Workspace operation: push (succeeded).");
    expect(logs[0]).toContain("mode: dry-run.");
  });

  it("backs up, dry-runs, and applies instance workspace push with explicit replace", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [
        restorePlan({ replacedInstalls: ["david"] }),
        restoreReport({ replacedInstalls: ["david"] }),
      ],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await runFormlessCli(
      ["push", "--workspace", workspaceRoot, "--apply", "--replace"],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    const restoreRequests = requests.filter((request) => request.method === "POST");

    expect(restoreRequests).toHaveLength(2);
    expect(
      restoreRequests.map(
        (request) =>
          capturedRequestJson<{ archive: InstanceArchive }>(request).archive.restorePolicy,
      ),
    ).toEqual([
      { dryRun: true, installCollisions: "replace" },
      { dryRun: false, installCollisions: "replace" },
    ]);
    await expect(
      readFile(
        path.join(workspaceRoot, ".formless/backups/push-2026-05-12T02-00-00-000Z/archive.json"),
        "utf8",
      ),
    ).resolves.toContain('"kind": "formless.instanceArchive"');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Workspace operation: push (succeeded).");
    expect(logs[0]).toContain("Summary: Workspace push applied.");
    expect(logs[0]).toContain("mode: apply.");
    expect(logs[0]).toContain("dryRunRestoreOk: true.");
    expect(logs[0]).toContain("applyRestoreOk: true.");
  });

  it("guards apply when target drift is not acknowledged", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([9]), records: publishRecords() },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        ["push", "--workspace", workspaceRoot, "--apply", "--replace"],
        cliDeps(tempDir, { fetch: fetcher }),
      ),
    ).rejects.toThrow("Formless instance push apply refused because remote drift was detected");
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    await expect(
      readFile(
        path.join(workspaceRoot, ".formless/backups/push-2026-05-12T02-00-00-000Z/archive.json"),
        "utf8",
      ),
    ).resolves.toContain('"kind": "formless.instanceArchive"');
  });

  it("guards push apply when live desired domain mappings drift", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
      [],
      [domainMapping("dpeek.com", "david")],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords({ host: "local.dpeek.com" }),
    );
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        ["push", "--workspace", workspaceRoot, "--apply", "--replace"],
        cliDeps(tempDir, { fetch: fetcher }),
      ),
    ).rejects.toThrow("Formless instance push apply refused because remote drift was detected");
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("blocks unsupported install-set replacement when extra remote installs exist", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const localDavid = appArchive("david", "David Peek");
    const fetcher = pushArchiveFetch(
      requests,
      [installedSite("david", "David Peek"), installedSite("extra", "Extra")],
      {
        david: { records: [] },
        extra: { records: [] },
      },
      [restorePlan({ replacedInstalls: ["david"] })],
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        [
          "push",
          "--workspace",
          workspaceRoot,
          "--apply",
          "--replace",
          "--allow-stale",
          "--replace-install-set",
        ],
        cliDeps(tempDir, { fetch: fetcher }),
      ),
    ).rejects.toThrow(
      "Formless instance push cannot replace the remote install set yet; archive restore cannot prune extra remote installs: extra.",
    );
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("adopts and rotates instance workspace admin tokens explicitly", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const commands: CapturedCommand[] = [];
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);

    await expect(
      runFormlessCli(["token", "adopt", "--workspace", workspaceRoot], cliDeps(tempDir)),
    ).rejects.toThrow(
      "Cloudflare Worker secrets cannot be read back; pass --admin-token or set FORMLESS_ADMIN_TOKEN.",
    );

    await runFormlessCli(
      ["token", "adopt", "--workspace", workspaceRoot, "--admin-token", "local-secret"],
      cliDeps(tempDir, { logs }),
    );

    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=local-secret\n");

    await runFormlessCli(
      ["token", "rotate", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        commands,
        logs,
        packageRoot: "/package",
      }),
    );

    expect(commands).toEqual([
      {
        args: [
          "exec",
          "--",
          "wrangler",
          "secret",
          "bulk",
          path.join(workspaceRoot, ".formless/instance.env.next"),
          "--name",
          "personal",
        ],
        command: "npm",
        cwd: "/package",
        env: { CLOUDFLARE_ACCOUNT_ID: "account-123" },
      },
    ]);
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=generated-token\n");
    expect(logs.at(-1)).toContain("Instance workspace admin token rotated.");
  });

  it("starts instance workspace dev from an empty workspace after selecting a workspace name", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "empty-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const nameSelections: Array<{ defaultName: string; workspaceRoot: string }> = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const sidecars: CapturedWorkspaceGatewaySidecar[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        selectWorkspaceName: async (input) => {
          nameSelections.push(input);

          return "confirmed-workspace";
        },
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
        startWorkspaceGatewaySidecar: fakeWorkspaceGatewaySidecar(sidecars),
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restore skipped")),
    );
    child.close(0);
    await run;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toMatchObject({
      args: ["run", "dev"],
      command: "npm",
      cwd: "/package",
    });
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: "generated-token",
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_OWNER_SESSION_SECRET: setupToken,
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "local-session-token",
      [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: expect.any(String),
      [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/?$/),
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4443",
      VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
      VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: expect.any(String),
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(spawnCalls[0]?.env).not.toHaveProperty("FORMLESS_LOCAL_WORKSPACE_GATEWAY");
    expect(spawnCalls[0]?.env).not.toHaveProperty("FORMLESS_WORKSPACE_GATEWAY_ROOT");
    expect(spawnCalls[0]?.env).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN");
    expect(spawnCalls[0]?.env).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL");
    expect(spawnCalls[0]?.env).not.toHaveProperty("VITE_FORMLESS_LOCAL_SESSION_BOOTSTRAP_TOKEN");
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4443/api/formless/app-installs",
      "GET http://localhost:4443/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(openedUrls).toEqual([]);
    expect(
      parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
    ).toEqual(layoutWorkspaceManifest("confirmed-workspace"));
    expect(nameSelections).toEqual([{ defaultName: "empty-workspace", workspaceRoot }]);
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "records"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "media"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await stat(path.join(workspaceRoot, ".formless/local"))).isDirectory()).toBe(true);
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.env"), "utf8"),
    ).resolves.toBe(
      `FORMLESS_ADMIN_TOKEN=generated-token\nFORMLESS_OWNER_SESSION_SECRET=${setupToken}\n`,
    );
    expect(withoutFakeCliDevLogs(logs)).toEqual([
      "Instance shell: http://localhost:4443/",
      "Local bootstrap entry: complete workspace setup in the browser.",
      `Local state: ${path.relative(tempDir, path.join(workspaceRoot, ".formless/local"))}.`,
      "Workspace storage restore skipped: no workspace state found.",
    ]);
    expect(child.killed).toBe(false);
    expect(sidecars).toMatchObject([
      {
        closed: true,
        endpoint: spawnCalls[0]?.env?.[WORKSPACE_GATEWAY_SIDECAR_URL_ENV],
        proxyToken: spawnCalls[0]?.env?.[WORKSPACE_GATEWAY_PROXY_TOKEN_ENV],
        workspaceRoot,
      },
    ]);
  });

  it("opens a local session bootstrap URL only for top-level workspace dev --open", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "open-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restore skipped")),
    );
    child.close(0);
    await run;

    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(openedUrls).toHaveLength(1);
    expect(openedUrl.origin).toBe("http://localhost:4443");
    expect(openedUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(openedUrl.searchParams.get("token")).toBe("local-session-token");
    expect(spawnCalls[0]?.env?.FORMLESS_ADMIN_TOKEN).toBe("generated-token");
    expect(spawnCalls[0]?.env?.[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]).toBe("local-session-token");
    expect(openedUrls[0]).not.toContain("generated-token");
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
  });

  it("opens the local session bootstrap URL on the child-advertised dev origin", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "open-workspace");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot, "--open"],
      cliDeps(tempDir, {
        env: { PORT: "5173" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        openedUrls,
        packageRoot: "/package",
        spawn: ((_command: string, _args: string[], _options: CapturedSpawnOptions) => {
          child.announceReady("http://localhost:5174");

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restore skipped")),
    );
    child.close(0);
    await run;

    const openedUrl = new URL(openedUrls[0] ?? "");

    expect(openedUrl.origin).toBe("http://localhost:5174");
    expect(openedUrl.pathname).toBe(LOCAL_SESSION_BOOTSTRAP_API_PATH);
    expect(openedUrl.searchParams.get("token")).toBe("local-session-token");
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5174/api/formless/app-installs",
      "GET http://localhost:5174/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
  });

  it("keeps workspace dev browser gateway config same-origin without sidecar proxy config", async () => {
    const workspaceRoot = await makeTempDir();
    const env = formlessInstanceWorkspaceDevEnv(
      {
        FORMLESS_LOCAL_WORKSPACE_GATEWAY: "1",
        [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: "old-session-bootstrap-token",
        [WORKSPACE_GATEWAY_PROXY_TOKEN_ENV]: "old-proxy-token",
        [WORKSPACE_GATEWAY_SIDECAR_URL_ENV]: "http://127.0.0.1:1/",
        FORMLESS_WORKSPACE_GATEWAY_ROOT: "/old/root",
        VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN: "browser-proxy-token",
        VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL: "http://127.0.0.1:1/",
      },
      workspaceRoot,
      defaultFormlessInstanceWorkspaceManifest({ name: "local-workspace" }),
      null,
    );

    expect(env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: expect.any(String),
      FORMLESS_OWNER_SESSION_SECRET: expect.any(String),
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: expect.any(String),
      FORMLESS_RUNTIME_PROFILE: "instance",
      VITE_FORMLESS_WORKSPACE_GATEWAY_API: "/api/formless/workspace",
      VITE_FORMLESS_WORKSPACE_GATEWAY_BOOTSTRAP_TOKEN: expect.any(String),
    });
    expect(env[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]).not.toBe("old-session-bootstrap-token");
    expect(env).not.toHaveProperty(WORKSPACE_GATEWAY_PROXY_TOKEN_ENV);
    expect(env).not.toHaveProperty(WORKSPACE_GATEWAY_SIDECAR_URL_ENV);
    expect(env).not.toHaveProperty("FORMLESS_LOCAL_WORKSPACE_GATEWAY");
    expect(env).not.toHaveProperty("FORMLESS_WORKSPACE_GATEWAY_ROOT");
    expect(env).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_PROXY_TOKEN");
    expect(env).not.toHaveProperty("VITE_FORMLESS_WORKSPACE_GATEWAY_SIDECAR_URL");
  });

  it("starts workspace dev from an empty current directory for browser onboarding", async () => {
    const workspaceRoot = await makeTempDir();
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    const run = runFormlessCli(
      ["dev"],
      cliDeps(workspaceRoot, {
        env: { PORT: "4443" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line === "Workspace storage restore skipped: no workspace state found."),
    );
    child.close(0);
    await run;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4443",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(
      parseFormlessInstanceWorkspaceManifestJson(
        await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
      ),
    ).toEqual(layoutWorkspaceManifest(expectedWorkspaceName(workspaceRoot)));
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    await expect(stat(path.join(workspaceRoot, "archives"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "records"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(stat(path.join(workspaceRoot, "media"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.env"), "utf8"),
    ).resolves.toBe(
      `FORMLESS_ADMIN_TOKEN=generated-token\nFORMLESS_OWNER_SESSION_SECRET=${setupToken}\n`,
    );
    expect(logs).toContain("Local bootstrap entry: complete workspace setup in the browser.");
    expect(child.killed).toBe(false);
  });

  it("rejects fresh workspace dev bootstrap when local onboarding source conflicts exist", async () => {
    const conflicts: Array<{
      expected: string;
      path: string;
      write: "dir" | "file";
    }> = [
      {
        expected: "Legacy Formless workspace manifest found",
        path: "formless-workspace.json",
        write: "file",
      },
      {
        expected: "portable archive source exists",
        path: PORTABLE_ARCHIVE_MANIFEST_FILE,
        write: "file",
      },
      {
        expected: "reviewable archive root exists",
        path: "archives",
        write: "dir",
      },
      {
        expected: "ignored .formless state exists",
        path: ".formless/deploy",
        write: "dir",
      },
    ];

    for (const conflict of conflicts) {
      const tempDir = await makeTempDir();
      const workspaceRoot = path.join(tempDir, "conflict-workspace");
      const conflictPath = path.join(workspaceRoot, conflict.path);
      const spawnCalls: CapturedSpawn[] = [];

      await mkdir(path.dirname(conflictPath), { recursive: true });

      if (conflict.write === "dir") {
        await mkdir(conflictPath, { recursive: true });
      } else {
        await writeFile(conflictPath, "{}\n");
      }

      await expect(
        runFormlessCli(
          ["dev", "--workspace", workspaceRoot],
          cliDeps(tempDir, {
            spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
              spawnCalls.push({
                args,
                command,
                cwd: options.cwd,
                env: options.env,
              });

              return new FakeCliDevChild() as unknown as ReturnType<typeof spawn>;
            }) as typeof spawn,
          }),
        ),
      ).rejects.toThrow(conflict.expected);
      expect(spawnCalls).toEqual([]);
    }
  });

  it("runs instance workspace dev with product profile, isolated persistence, and first-run archive restore from storage state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([4, 5, 6]),
      records: mediaRecords(),
    });

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless/local"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/local/dev.env"),
      "FORMLESS_ADMIN_TOKEN=persisted-local-admin\nFORMLESS_OWNER_SESSION_SECRET=persisted-owner-session\n",
    );
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid, Buffer.from([4, 5, 6]));

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: {
          FORMLESS_ADMIN_TOKEN: "remote-token",
          KEEP: "value",
          PORT: "4444",
        },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restored: storage state")),
    );
    child.close(0);
    await run;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toMatchObject({
      args: ["run", "dev"],
      command: "npm",
      cwd: "/package",
    });
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_ADMIN_TOKEN: "persisted-local-admin",
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_OWNER_SESSION_SECRET: "persisted-owner-session",
      [LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]: expect.any(String),
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      KEEP: "value",
      PORT: "4444",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(spawnCalls[0]?.env?.[LOCAL_SESSION_BOOTSTRAP_TOKEN_ENV]).not.toBe(
      "persisted-local-admin",
    );
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.env"), "utf8"),
    ).resolves.toBe(
      "FORMLESS_ADMIN_TOKEN=persisted-local-admin\nFORMLESS_OWNER_SESSION_SECRET=persisted-owner-session\n",
    );
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4444/api/formless/app-installs",
      "GET http://localhost:4444/api/formless/app-installs",
      "POST http://localhost:4444/api/formless/archive/restore",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer persisted-local-admin",
      "Bearer persisted-local-admin",
      "Bearer persisted-local-admin",
    ]);

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(restoreRequest?.headers.authorization).toBe("Bearer persisted-local-admin");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(restoreBody.archive.controlPlane?.records.map((record) => record.entity)).toEqual([
      "app-install",
      "route",
      "route",
      "route",
    ]);
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(restoreBody.archive.apps[0]?.data.kind).toBe(STORAGE_SNAPSHOT_KIND);
    expect(JSON.stringify(restoreBody.archive.controlPlane)).not.toContain(
      "media/images/cover.png",
    );
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(withoutFakeCliDevLogs(logs)).toEqual([
      "Instance shell: http://localhost:4444/",
      "Local bootstrap entry: complete workspace setup in the browser.",
      `Local state: ${path.relative(tempDir, path.join(workspaceRoot, ".formless/local"))}.`,
      `Workspace storage restored: storage state (1 apps, ${mediaRecords().length} records, 1 media).`,
    ]);
    expect(child.killed).toBe(false);
  });

  it("starts workspace dev with a linked private app package and clean install records", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "instance");
    const packageRoot = path.join(tempDir, "app");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];
    const sourceSchemaHash = await computeSourceSchemaHash(taskSourceSchema);

    await writeWorkspaceManifest(workspaceRoot, { apps: [] });
    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writePrivatePackageFixture(packageRoot, sourceSchemaHash);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      privateControlPlaneRecords(sourceSchemaHash),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, privateAppArchive(sourceSchemaHash));

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4451" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restored: storage state")),
    );
    child.close(0);
    await run;

    const runtimePackages = spawnCalls[0]?.env?.[FORMLESS_WORKSPACE_APP_PACKAGES_ENV_NAME];

    expect(runtimePackages).toContain('"packageAppKey": "private-labs"');
    expect(runtimePackages).toContain('"sourceSchema"');
    expect(runtimePackages).not.toContain("../app/formless.app.json");
    expect(runtimePackages).not.toContain(packageRoot);

    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(requests.at(-1));
    const controlPlaneJson = JSON.stringify(restoreBody.archive.controlPlane);
    const appInstall = restoreBody.archive.controlPlane?.records.find(
      (record) => record.entity === "app-install",
    );
    const routes = restoreBody.archive.controlPlane?.records.filter(
      (record) => record.entity === "route",
    );

    expect(appInstall?.values).toMatchObject({
      installId: "labs",
      packageAppKey: "private-labs",
      sourceSchemaHash,
    });
    expect(
      routes
        ?.map((record) => record.values.matchPath)
        .sort((left, right) => String(left).localeCompare(String(right))),
    ).toEqual(["/apps/labs", "/apps/labs/schema"]);
    expect(restoreBody.archive.apps[0]?.app).toMatchObject({
      installId: "labs",
      packageAppKey: "private-labs",
      sourceSchemaHash,
      sourceSchemaKey: "private-labs",
    });
    expect(controlPlaneJson).toContain("private-labs");
    expect(controlPlaneJson).not.toContain("../app");
    expect(controlPlaneJson).not.toContain("formless.app.json");
    expect(controlPlaneJson).not.toContain(packageRoot);
    expect(restoreBody.mediaFiles).toEqual([]);
    expect(logs.at(-1)).toBe(
      "Workspace storage restored: storage state (1 apps, 0 records, 0 media).",
    );
  });

  it("rejects missing local app archive before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4447" },
          fetch: localInstanceDevFetch(requests, []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow(
      "Formless instance local dev requires local app state state/apps/david.json.",
    );

    expect(child.killed).toBe(false);
    expect(requests).toEqual([]);
  });

  it("rejects mismatched app archive identity and package facts before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(
      workspaceRoot,
      appArchive("james", "James Peek"),
      undefined,
      "david",
    );

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4448" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow('Storage snapshot storageIdentity must be "app:david".');

    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      localOnlyControlPlaneRecords().map((record) =>
        record.entity === "app-install"
          ? {
              ...record,
              values: {
                ...record.values,
                packageRevision: 999,
              },
            }
          : record,
      ),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, appArchive("david", "David Peek"));

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4449" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], _options: CapturedSpawnOptions) =>
            child as unknown as ReturnType<typeof spawn>) as typeof spawn,
        }),
      ),
    ).rejects.toThrow(
      'Formless instance local dev app install "david" has package revision 999, expected 1.',
    );
  });

  it("rejects missing media payloads before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([4, 5, 6]),
      records: mediaRecords(),
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4450" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow(
      "Formless instance local dev app state state/apps/david.json is missing media files: media/david/media/images/cover.png.",
    );
  });

  it("rejects secret-looking control-plane storage state before local dev restore", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const manifestPath = path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecordsWithDisabledDeployTarget(),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(manifestPath, "utf8"),
    );
    const deploymentConfigSourcePath = instanceWorkspaceInstanceStatePath(workspaceRoot, manifest);
    const deploymentConfigSource = JSON.parse(
      await readFile(deploymentConfigSourcePath, "utf8"),
    ) as { records: StoredRecord[] };

    deploymentConfigSource.records = deploymentConfigSource.records.map((record) =>
      record.entity === "deployment-config"
        ? {
            ...record,
            values: {
              ...record.values,
              targetUrl: "https://CF_API_TOKEN_secret.example",
            },
          }
        : record,
    );
    await writeFile(
      deploymentConfigSourcePath,
      `${JSON.stringify(deploymentConfigSource, null, 2)}\n`,
    );

    await expect(
      runFormlessCli(
        ["dev", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          env: { PORT: "4451" },
          fetch: localInstanceDevFetch([], []),
          spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
            announceFakeCliDevServer(child, options.env);

            return child as unknown as ReturnType<typeof spawn>;
          }) as typeof spawn,
        }),
      ),
    ).rejects.toThrow("cannot store control-plane secret values");
  });

  it("runs top-level workspace dev from the nearest manifest with empty local state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const nestedRoot = path.join(workspaceRoot, "src", "site");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(nestedRoot, { recursive: true });

    const run = runFormlessCli(
      ["dev"],
      cliDeps(nestedRoot, {
        env: { PORT: "4446" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line === "Workspace storage restore skipped: no workspace state found."),
    );
    child.close(0);
    await run;

    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      PORT: "4446",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4446/api/formless/app-installs",
      "GET http://localhost:4446/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(withoutFakeCliDevLogs(logs)).toEqual([
      "Instance shell: http://localhost:4446/",
      "Local bootstrap entry: complete workspace setup in the browser.",
      `Local state: ${path.relative(nestedRoot, path.join(workspaceRoot, ".formless/local"))}.`,
      "Workspace storage restore skipped: no workspace state found.",
    ]);
  });

  it("keeps existing workspace-local installs on instance dev rerun", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4445" },
        fetch: localInstanceDevFetch(requests, [installedSite("david", "David Peek")]),
        logs,
        spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restore skipped")),
    );
    child.close(0);
    await run;

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4445/api/formless/app-installs",
      "GET http://localhost:4445/api/formless/app-installs",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(logs.at(-1)).toBe(
      "Workspace storage restore skipped: local installs already exist (david).",
    );
  });

  it("saves browser-created local Authority installed apps into deterministic workspace archives", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const fetcher = archiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
      },
      [],
      [],
      controlPlaneRecords(),
    );

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless/local"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/local/dev.env"),
      "FORMLESS_ADMIN_TOKEN=local-save-token\nFORMLESS_OWNER_SESSION_SECRET=local-owner-secret\n",
    );
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=stored-instance-token\n",
    );

    await runFormlessCli(["save"], cliDeps(workspaceRoot, { fetch: fetcher, logs }));

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );
    const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    const operationStates = await listWorkspaceOperationStates(workspaceRoot);
    const appStateValue = JSON.parse(
      await readFile(path.join(workspaceRoot, "state/apps/david.json"), "utf8"),
    ) as StorageSnapshot;

    expect(manifest).toEqual(layoutWorkspaceManifest("personal-sites"));
    expect(operationStates).toHaveLength(1);
    expect(operationStates[0]).toMatchObject({
      actor: "cli",
      input: { check: false },
      operation: "save",
      status: "succeeded",
    });
    expect(controlPlane?.records.map((record) => record.entity)).toContain("route");
    expect(controlPlane?.records.map((record) => record.entity)).toContain("app-install");
    expect(controlPlane?.records.map((record) => record.entity)).not.toContain(
      "deploy-drift-report",
    );
    expect(JSON.stringify(controlPlane)).not.toContain("CF_API_TOKEN");
    expect(JSON.stringify(controlPlane)).not.toContain("media/images/cover.png");
    expect(appStateValue.kind).toBe(STORAGE_SNAPSHOT_KIND);
    expect(appStateValue.storageIdentity).toBe("app:david");
    await expect(
      readFile(path.join(workspaceRoot, "state/media/media/david/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/formless/app-installs",
      "GET http://localhost:5173/api/formless/control-plane/snapshot?actorKind=cliDeployer",
      "GET http://localhost:5173/api/app-installs/site/david/snapshot",
      "GET http://localhost:5173/api/formless/media/media/images/cover.png",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer local-save-token",
      "Bearer local-save-token",
      "Bearer local-save-token",
      "Bearer local-save-token",
    ]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Workspace operation: save (succeeded).");
    expect(logs[0]).toContain(
      "Workspace source: layout-only manifest, storage snapshots, media payloads.",
    );
    expect(logs[0]).toContain("Summary: Workspace saved.");
    expect(logs[0]).toContain("source: http://localhost:5173.");
    expect(logs[0]).toContain("appCount: 1.");
    expect(logs[0]).toContain("mediaCount: 1.");
    expect(logs[0]).toContain("recordCount: 6.");
    expect(logs[0]).toContain(
      `appState: {"installId":"david","mediaCount":1,"recordCount":${mediaRecords().length}}.`,
    );
  });

  it("preserves source-only deploy records during local Authority save", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const localControlPlaneRecords = controlPlaneRecords().filter(
      (record) => record.entity !== "deployment-config",
    );
    const fetcher = archiveFetch(
      [],
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [],
      [],
      localControlPlaneRecords,
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, controlPlaneRecords());

    await runFormlessCli(["save"], cliDeps(workspaceRoot, { fetch: fetcher }));

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );
    const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      workspaceRoot,
    });

    expect(controlPlane?.records.map((record) => `${record.entity}:${record.id}`)).toContain(
      "deployment-config:instance.primary",
    );
  });

  it("checks local workspace source staleness without rewriting reviewable files", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const fetcher = archiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [],
      [],
      controlPlaneRecords(),
    );

    await writeWorkspaceManifest(workspaceRoot);
    const manifestBefore = await readFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      "utf8",
    );

    await expect(
      runFormlessCli(["save", "--check"], cliDeps(workspaceRoot, { fetch: fetcher })),
    ).rejects.toThrow(
      'Formless workspace source is stale: state/apps/david.json, state/instance.json. Run "npx formless save".',
    );
    await expect(
      readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    ).resolves.toBe(manifestBefore);
    await expect(stat(path.join(workspaceRoot, "state/instance.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const logs: string[] = [];

    await runFormlessCli(["save"], cliDeps(workspaceRoot, { fetch: fetcher }));
    await runFormlessCli(["save", "--check"], cliDeps(workspaceRoot, { fetch: fetcher, logs }));

    expect(logs.at(-1)).toContain("Workspace operation: save (succeeded).");
    expect(logs.at(-1)).toContain("Summary: Workspace source current.");
    expect(logs.at(-1)).toContain("mode: check.");
  });

  it("rejects secret-looking local Authority control-plane fields during workspace save", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const secretControlPlane = controlPlaneRecords().map((record) =>
      record.entity === "deployment-config"
        ? {
            ...record,
            values: {
              ...record.values,
              credentialRef: "CF_API_TOKEN_secret",
            },
          }
        : record,
    );
    const fetcher = archiveFetch(
      [],
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [],
      [],
      secretControlPlane,
    );

    await writeWorkspaceManifest(workspaceRoot);

    await expect(
      runFormlessCli(["save"], cliDeps(workspaceRoot, { fetch: fetcher })),
    ).rejects.toThrow(
      'Instance archive controlPlane records record "instance.primary" field "instance:deployment-config.credentialRef" cannot store control-plane secret values.',
    );
  });

  it("resets only instance workspace local state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, appArchive("david", "David Peek"));
    await mkdir(path.join(workspaceRoot, ".formless/local/wrangler"), { recursive: true });
    await mkdir(path.join(workspaceRoot, ".formless/backups"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/local/wrangler/state.txt"), "state");
    await writeFile(path.join(workspaceRoot, ".formless/backups/keep.txt"), "backup");
    await writeFile(path.join(workspaceRoot, ".formless/instance.env"), "FORMLESS_ADMIN_TOKEN=x\n");

    const result = await resetFormlessInstanceWorkspaceLocalState(
      { workspacePath: workspaceRoot },
      cliDeps(tempDir),
    );

    await expect(
      stat(path.join(workspaceRoot, ".formless/local/wrangler/state.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/backups/keep.txt"), "utf8"),
    ).resolves.toBe("backup");
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=x\n");
    await expect(
      readFile(path.join(workspaceRoot, "state/apps/david.json"), "utf8"),
    ).resolves.toContain('"storageIdentity": "app:david"');
    expect(result.localStateRoot).toBe(path.join(workspaceRoot, ".formless/local"));
  });

  it("rebuilds local runtime state from workspace source after local reset", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, localOnlyControlPlaneRecords());
    await writeWorkspaceAppStateFromArchive(workspaceRoot, appArchive("david", "David Peek"));
    await mkdir(path.join(workspaceRoot, ".formless/local/wrangler"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/local/wrangler/state.txt"), "state");

    await resetFormlessInstanceWorkspaceLocalState(
      { workspacePath: workspaceRoot },
      cliDeps(tempDir),
    );

    const run = runFormlessCli(
      ["dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4450" },
        fetch: localInstanceDevFetch(requests, []),
        logs,
        spawn: ((_command: string, _args: string[], options: CapturedSpawnOptions) => {
          announceFakeCliDevServer(child, options.env);

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace storage restored: storage state")),
    );
    child.close(0);
    await run;

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4450/api/formless/app-installs",
      "GET http://localhost:4450/api/formless/app-installs",
      "POST http://localhost:4450/api/formless/archive/restore",
    ]);
    expect(requests.map((request) => request.headers.authorization)).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    await expect(
      stat(path.join(workspaceRoot, ".formless/local/wrangler/state.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/local/dev.json"), "utf8"),
    ).resolves.toContain('"sourceUrl": "http://localhost:4450"');
    expect(logs.at(-1)).toBe(
      "Workspace storage restored: storage state (1 apps, 0 records, 0 media).",
    );
    expect(child.killed).toBe(false);
  });

  it("destroys a claimed instance workspace after confirmation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const manifestPath = path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE);
    const deploymentStateRoot = path.join(workspaceRoot, ".formless/deploy/personal");
    const instanceArchiveRoot = path.join(workspaceRoot, "archives/instance");
    const appStatePath = path.join(workspaceRoot, "state/apps/david.json");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot, {
      domains: [{ enabled: true, host: "legacy.dpeek.com", profile: "instance" }],
    });
    const originalManifest = await readFile(manifestPath, "utf8");
    const controlPlaneSourceRecords = [
      ...controlPlaneRecords({ host: "dpeek.com" }).filter(
        (record) =>
          record.entity === "app-install" ||
          record.entity === "route" ||
          record.entity === "deployment-config",
      ),
      redirectRouteRecord("old.dpeek.com", "dpeek.com"),
      disabledHostRouteRecord("draft.dpeek.com", "david"),
    ];

    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, controlPlaneSourceRecords);
    await writeArchiveDirectory(instanceArchiveRoot, {
      ...instanceArchive([appArchive("david", "David Peek")]),
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: controlPlaneSnapshot(controlPlaneSourceRecords),
    });
    await writeWorkspaceAppStateFromArchive(workspaceRoot, appArchive("david", "David Peek"));
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/instance.env"), "FORMLESS_ADMIN_TOKEN=x\n");
    await writeWorkspaceDeployState(workspaceRoot);

    await runFormlessCli(
      ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
      cliDeps(tempDir, {
        destroy: async (input) => {
          destroyInputs.push(input);

          return { resources: destroyedResourceSummary(input) };
        },
        logs,
        packageRoot: "/package",
      }),
    );

    expect(destroyInputs).toHaveLength(1);
    expect(destroyInputs[0]).toMatchObject({
      credentialProfile: "personal-profile",
      packageRoot: "/package",
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        CLOUDFLARE_API_TOKEN: "state-cf-token",
      },
      stateRoot: path.join(workspaceRoot, ".formless/deploy/personal"),
    });
    expect(destroyInputs[0]?.plan).toMatchObject({
      account: {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
      expectedUrl: {
        url: "https://personal.dpeek.workers.dev",
      },
      instanceName: "personal",
      resources: {
        authority: {
          namespaceName: "personal-authority",
        },
        mediaBucket: {
          name: "personal-media",
        },
        worker: {
          name: "personal",
        },
      },
    });
    expect(destroyInputs[0]?.domainProviderPlan).toMatchObject({
      instanceId: "personal",
      workerName: "personal",
    });
    expect(
      destroyInputs[0]?.domainProviderResources?.resources.map((resource) => resource.kind),
    ).toEqual([
      "cloudflare-dns-records",
      "cloudflare-redirect-rule",
      "cloudflare-worker-custom-domain",
    ]);
    expect(
      destroyInputs[0]?.domainProviderResources?.resources.map((resource) => {
        const host = resource.inputs.host ?? resource.inputs.fromHost;

        return typeof host === "string" ? host : "<missing>";
      }),
    ).toEqual(["old.dpeek.com", "old.dpeek.com", "dpeek.com"]);
    expect(JSON.stringify(destroyInputs[0]?.domainProviderResources)).not.toContain(
      "draft.dpeek.com",
    );
    expect(JSON.stringify(destroyInputs[0]?.domainProviderResources)).not.toContain(
      "legacy.dpeek.com",
    );
    await expect(readFile(manifestPath, "utf8")).resolves.toBe(originalManifest);
    await expect(
      readFile(path.join(instanceArchiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
    ).resolves.toContain("formless.instanceArchive");
    await expect(readFile(appStatePath, "utf8")).resolves.toContain(
      '"storageIdentity": "app:david"',
    );
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=x\n");
    expect(await pathExists(deploymentStateRoot)).toBe(false);
    expect(logs).toEqual([
      [
        "Instance workspace destroyed.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: instance.primary (https://personal.dpeek.workers.dev).",
        "Worker: personal.",
        "Durable Object namespace: personal-authority.",
        "Media bucket: personal-media.",
        "Route provider resources: 3 provider resources from 2 routes (instance:route; dpeek.com, old.dpeek.com).",
        "Destroyed resources: Worker destroyed, Durable Object namespace destroyed, R2 media bucket destroyed, Turnstile widget destroyed, Worker assets destroyed, Worker secrets destroyed, custom domains 1, DNS records 1, redirects 1, Alchemy state destroyed.",
        `Ignored deploy state: ${path.relative(tempDir, deploymentStateRoot)}.`,
        `Deployment facts: ${path.relative(
          tempDir,
          path.join(deploymentStateRoot, "formless.instance.json"),
        )}.`,
        `Local deploy secrets: ${path.relative(
          tempDir,
          path.join(deploymentStateRoot, "deploy.env"),
        )}.`,
      ].join("\n"),
    ]);
  });

  it("destroys a local-first workspace through the top-level command", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot);

    await runFormlessCli(
      [
        "destroy",
        "--workspace",
        workspaceRoot,
        "--target",
        "instance.primary",
        "--confirm",
        "personal",
      ],
      cliDeps(tempDir, {
        destroy: async (input) => {
          destroyInputs.push(input);

          return { resources: destroyedResourceSummary() };
        },
      }),
    );

    expect(destroyInputs).toHaveLength(1);
    expect(destroyInputs[0]?.stateRoot).toBe(path.join(workspaceRoot, ".formless/deploy/personal"));
  });

  it("reports Turnstile widget handling in destroy summaries without leaking secrets", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot);

    await runFormlessCli(
      ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
      cliDeps(tempDir, {
        destroy: async (input) => {
          destroyInputs.push(input);

          return { resources: destroyedResourceSummary(input) };
        },
        logs,
        packageRoot: "/package",
      }),
    );

    expect(destroyInputs).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Turnstile widget destroyed");
    expect(logs[0]).toContain("Destroyed resources:");
    expect(logs.join("\n")).not.toContain("state-cf-token");
    expect(logs.join("\n")).not.toContain("alchemy-password");
    expect(logs.join("\n")).not.toContain("FORMLESS_TURNSTILE_SECRET_KEY");
  });

  it("refuses destroy before provider mutation when no workspace target is selected", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await mkdir(workspaceRoot, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      formatFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        targets: [],
        local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
        defaultAppPolicy: "declared-installs",
        apps: [workspaceApp("david", "David Peek")],
      }),
    );

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow(
      "Formless instance destroy requires an enabled instance deployment-config record.",
    );
    expect(destroyInputs).toEqual([]);
  });

  it("refuses destroy before provider mutation when confirmation or deploy state is invalid", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot);

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "wrong"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow('Formless instance destroy confirmation must match Worker name "personal".');
    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "wrong"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow('Formless instance destroy confirmation must match Worker name "personal".');

    await rm(path.join(workspaceRoot, ".formless/deploy/personal/formless.instance.json"));

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow("Formless instance destroy requires ignored deploy state");

    expect(destroyInputs).toEqual([]);
  });

  it("refuses destroy before provider mutation when ignored deploy secrets are incomplete", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const destroyInputs: DestroyFormlessInstanceInput[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceDeployState(workspaceRoot, { deployEnv: "CLOUDFLARE_API_TOKEN=token\n" });

    await expect(
      runFormlessCli(
        ["destroy", "--workspace", workspaceRoot, "--confirm", "personal"],
        cliDeps(tempDir, {
          destroy: async (input) => {
            destroyInputs.push(input);

            return { resources: destroyedResourceSummary() };
          },
        }),
      ),
    ).rejects.toThrow(
      "Formless instance destroy requires ALCHEMY_PASSWORD in ignored deploy secrets",
    );
    expect(destroyInputs).toEqual([]);
  });

  it("deploys a local-first workspace, records target source, preserves layout manifest, and pushes saved archives", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal");
    const packageRoot = path.join(tempDir, "app");
    const accountDiscoveryInputs: Array<{ credentialProfile: string | null }> = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const healthInputs: CheckFormlessInstanceDeployMetadataInput[] = [];
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const localDavid = appArchive("david", "David Peek");
    const ownerSetupUrl = `https://personal.dpeek.workers.dev/setup?token=${setupToken}`;
    const desiredResourcesByKind = {
      "cloudflare-dns-records": 1,
      "cloudflare-redirect-rule": 1,
      "cloudflare-worker-custom-domain": 1,
    };
    const sourceSchemaHash = await computeSourceSchemaHash(taskSourceSchema);
    const controlPlaneSourceRecords = [
      ...controlPlaneRecords().filter((record) => record.entity !== "deployment-config"),
      ...privateControlPlaneRecords(sourceSchemaHash),
      redirectRouteRecord("old.dpeek.com", "dpeek.com"),
    ];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspacePackageLinks(workspaceRoot, "../app/formless.app.json");
    await writePrivatePackageFixture(packageRoot, sourceSchemaHash);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid, privateAppArchive(sourceSchemaHash)]),
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, privateAppArchive(sourceSchemaHash));
    await writeFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      formatFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal",
        targets: [],
        local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
        defaultAppPolicy: "declared-installs",
        apps: [workspaceApp("david", "David Peek")],
      }),
    );
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, controlPlaneSourceRecords);

    await runFormlessCli(
      ["deploy"],
      cliDeps(workspaceRoot, {
        accountDiscoveryInputs,
        deploy: async (input) => {
          deployInputs.push(input);
          return { url: input.plan.expectedUrl.url };
        },
        env: {
          ALCHEMY_PROFILE: "personal-profile",
          ALCHEMY_STATE_TOKEN: "alchemy-state-token",
          CLOUDFLARE_API_TOKEN: "cf-token",
        },
        fetch: deploymentApplyFetch(
          requests,
          pushArchiveFetch(
            requests,
            [],
            {},
            [
              restorePlan({ createdInstalls: ["david"] }),
              restoreReport({ createdInstalls: ["david"] }),
            ],
            [],
            [],
          ),
          { resourcesByKind: desiredResourcesByKind },
        ),
        healthInputs,
        logs,
        packageRoot: "/package",
        setupInputs,
      }),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );
    const controlPlane = await readInstanceWorkspaceControlPlaneStorageSnapshot({
      manifest,
      workspaceRoot,
    });
    const deployEnv = await readFile(
      path.join(workspaceRoot, ".formless/deploy/personal/deploy.env"),
      "utf8",
    );
    const deployState = await readFile(
      path.join(workspaceRoot, ".formless/deploy/personal/formless.instance.json"),
      "utf8",
    );
    const restoreRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        request.url === "https://personal.dpeek.workers.dev/api/formless/archive/restore",
    );
    const deploymentRequests = requests.filter((request) => {
      const pathname = new URL(request.url).pathname;

      return (
        pathname.startsWith("/api/formless/deployments/") ||
        pathname === "/api/formless/control-plane/operations/deployment-config/update"
      );
    });
    const desiredState = deploymentDesiredStateRef();
    const observationRequest = capturedRequestJson<{
      idempotencyKey: string;
      input: {
        observedDesiredStateHash: string;
        observedStatus: string;
        observedSummary: string;
      };
      recordId: string;
    }>(
      deploymentRequests.find(
        (request) =>
          new URL(request.url).pathname ===
          "/api/formless/control-plane/operations/deployment-config/update",
      ),
    );

    expect(accountDiscoveryInputs).toEqual([{ credentialProfile: null }]);
    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]?.workspaceAppPackages).toContain('"packageAppKey": "private-labs"');
    expect(deployInputs[0]?.workspaceAppPackages).toContain('"sourceSchema"');
    expect(deployInputs[0]?.workspaceAppPackages).not.toContain("../app/formless.app.json");
    expect(deployInputs[0]?.workspaceAppPackages).not.toContain(packageRoot);
    expect(deployInputs[0]).toMatchObject({
      credentialProfile: null,
      packageRoot: "/package",
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        CLOUDFLARE_API_TOKEN: "cf-token",
        FORMLESS_ADMIN_TOKEN: "generated-token",
      },
      stateRoot: path.join(workspaceRoot, ".formless/deploy/personal"),
    });
    expect(deployInputs[0]?.plan).toMatchObject({
      account: {
        id: "account-123",
        workersDevSubdomain: "dpeek",
      },
      expectedUrl: {
        url: "https://personal.dpeek.workers.dev",
      },
      instanceName: "personal",
      migrationPolicy: "new",
      resources: {
        assets: {
          bindingName: "ASSETS",
        },
        authority: {
          bindingName: "FORMLESS_AUTHORITY",
          namespaceName: "personal-authority",
        },
        mediaBucket: {
          bindingName: "FORMLESS_MEDIA",
          name: "personal-media",
        },
        worker: {
          name: "personal",
          workersDevEnabled: true,
        },
      },
    });
    expect(healthInputs).toEqual([
      {
        expectedVersion: packageJson.version,
        url: "https://personal.dpeek.workers.dev",
      },
    ]);
    expect(setupInputs).toEqual([
      {
        adminToken: "generated-token",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(manifest).toEqual(layoutWorkspaceManifest("personal"));
    expect(JSON.stringify(manifest)).not.toContain("cf-token");
    expect(JSON.stringify(manifest)).not.toContain("alchemy-state-token");
    expect(JSON.stringify(manifest)).not.toContain(setupToken);
    expect(JSON.stringify(controlPlane)).not.toContain("cf-token");
    expect(JSON.stringify(controlPlane)).not.toContain("alchemy-password");
    expect(JSON.stringify(controlPlane)).not.toContain("generated-token");
    expect(JSON.stringify(controlPlane)).not.toContain(setupToken);
    expect(
      controlPlane?.records.find((record) => record.entity === "deployment-config")?.values,
    ).toMatchObject({
      accountId: "account-123",
      providerFamily: "cloudflare",
      targetUrl: "https://personal.dpeek.workers.dev",
      workerName: "personal",
    });
    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=generated-token\n");
    expect(deployEnv).toContain("ALCHEMY_PASSWORD=alchemy-password\n");
    expect(deployEnv).toContain("ALCHEMY_PROFILE=personal-profile\n");
    expect(deployEnv).toContain("FORMLESS_ADMIN_TOKEN=generated-token\n");
    expect(deployEnv).toContain("CLOUDFLARE_ACCOUNT_ID=account-123\n");
    expect(deployEnv).toContain("CLOUDFLARE_API_TOKEN=cf-token\n");
    expect(deployEnv).toContain("ALCHEMY_STATE_TOKEN=alchemy-state-token\n");
    expect(deployState).toContain('"workersDevUrl": "https://personal.dpeek.workers.dev"');
    expect(restoreRequests).toHaveLength(2);
    expect(
      deploymentRequests.map((request) => `${request.method} ${new URL(request.url).pathname}`),
    ).toEqual([
      "GET /api/formless/deployments/desired-state",
      "POST /api/formless/control-plane/operations/deployment-config/update",
    ]);
    expect(deploymentRequests.map((request) => request.headers.authorization ?? "")).toEqual([
      "Bearer generated-token",
      "Bearer generated-token",
    ]);
    expect(observationRequest).toMatchObject({
      idempotencyKey: expect.any(String),
      recordId: "instance.primary",
      input: {
        observedDesiredStateHash: desiredState.hash,
        observedStatus: "deployed",
        observedSummary: "3 deployment resources applied from workspace source.",
      },
    });
    expect(
      restoreRequests.map(
        (request) =>
          capturedRequestJson<{ archive: InstanceArchive }>(request).archive.restorePolicy,
      ),
    ).toEqual([
      { dryRun: true, installCollisions: "replace" },
      { dryRun: false, installCollisions: "replace" },
    ]);
    expect(
      JSON.stringify(restoreRequests.map((request) => capturedRequestJson(request))),
    ).not.toContain("cf-token");
    expect(
      JSON.stringify(restoreRequests.map((request) => capturedRequestJson(request))),
    ).not.toContain("alchemy-password");
    expect(
      JSON.stringify(restoreRequests.map((request) => capturedRequestJson(request))),
    ).not.toContain("generated-token");
    expect(logs.at(-1)).toContain("Workspace operation: deploy apply (succeeded).");
    expect(logs.at(-1)).toContain(`ownerSetupUrl: ${ownerSetupUrl}.`);
    expect(logs.at(-1)).toContain("turnstileWidget: provisioned.");
    expect(logs.at(-1)).toContain("url: https://personal.dpeek.workers.dev.");
    expect(logs.at(-1)).toContain('"turnstileWidget":"provisioned"');
    expect(logs.at(-1)).toContain('"resourcesByKind":');
    expect(logs.at(-1)).toContain('"cloudflare-worker-custom-domain":1');
    expect(logs.at(-1)).toContain('"cloudflare-dns-records":1');
    expect(logs.at(-1)).toContain('"cloudflare-redirect-rule":1');
    expect(logs.at(-1)).toContain('"applyRestoreOk":true');
    expect(logs.join("\n")).not.toContain("cf-token");
    expect(logs.join("\n")).not.toContain("alchemy-state-token");
    expect(logs.join("\n")).not.toContain("generated-token");
    expect(logs.join("\n")).not.toContain("/setup/capability");
    expect(logs.join("\n")).not.toContain("capabilityCreated");
  });

  it("plans top-level deploy dry-run without runtime or provider reconciliation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const accountDiscoveryInputs: Array<{ credentialProfile: string | null }> = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const healthInputs: CheckFormlessInstanceDeployMetadataInput[] = [];
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const controlPlaneSourceRecords = [
      ...controlPlaneRecords(),
      redirectRouteRecord("old.dpeek.com", "dpeek.com"),
    ];
    const remoteControlPlaneRecords = controlPlaneSourceRecords.map((record) =>
      record.entity === "deployment-config"
        ? {
            ...record,
            values: {
              ...record.values,
              observedAt: "2026-05-26T01:00:00.000Z",
              observedStatus: "in-sync",
              observedSummary: "Deployment is in sync.",
            },
          }
        : record,
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, controlPlaneSourceRecords);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["deploy", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, {
        accountDiscoveryInputs,
        deploy: async (input) => {
          deployInputs.push(input);

          return { url: input.plan.expectedUrl.url };
        },
        fetch: archiveFetch(
          requests,
          [installedSite("david", "David Peek")],
          { david: { records: [] } },
          [],
          [domainMapping("dpeek.com", "david")],
          remoteControlPlaneRecords,
        ),
        healthInputs,
        logs,
        setupInputs,
      }),
    );

    expect(accountDiscoveryInputs).toEqual([{ credentialProfile: null }]);
    expect(deployInputs).toEqual([]);
    expect(healthInputs).toEqual([]);
    expect(setupInputs).toEqual([]);
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/formless/app-installs",
        "GET /api/formless/control-plane/snapshot",
        "GET /api/app-installs/site/david/snapshot",
        "GET /api/formless/domain-mappings",
        "GET /api/formless/deployments/status",
      ],
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Workspace operation: deploy plan (succeeded).");
    expect(logs[0]).toContain("Summary: Deploy planned.");
    expect(logs[0]).toContain("drift: no-drift.");
    expect(logs[0]).toContain("observationStatus: not-run.");
    expect(logs[0]).toContain("turnstileWidget: planned.");
    expect(logs[0]).toContain('"cloudflare-worker-custom-domain":1');
    expect(logs[0]).toContain('"cloudflare-dns-records":1');
    expect(logs[0]).toContain('"cloudflare-redirect-rule":1');
    expect(logs.join("\n")).not.toContain("local-token");
  });

  it("redacts deploy secrets from command errors", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal");
    const localDavid = appArchive("david", "David Peek");

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);
    await writeFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      formatFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal",
        targets: [],
        local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
        defaultAppPolicy: "declared-installs",
        apps: [workspaceApp("david", "David Peek")],
      }),
    );
    await writeWorkspaceControlPlaneStorageSnapshot(
      workspaceRoot,
      controlPlaneRecords().filter(
        (record) =>
          record.entity !== "deployment-config" && record.id !== "route:host:publicSite:dpeek.com",
      ),
    );

    let thrown: unknown;

    try {
      await runFormlessCli(
        ["deploy"],
        cliDeps(workspaceRoot, {
          deploy: async () => {
            throw new Error(
              `provider failed CF_API_TOKEN=cf-token ALCHEMY_PASSWORD=alchemy-password Bearer generated-token ${workspaceRoot}`,
            );
          },
          env: {
            ALCHEMY_PASSWORD: "alchemy-password",
            CLOUDFLARE_API_TOKEN: "cf-token",
          },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = thrown instanceof Error ? thrown.message : "";

    expect(message).toBe(
      "provider failed [redacted]=[redacted] ALCHEMY_PASSWORD=[redacted] Bearer [redacted] <workspace>",
    );
    expect(message).not.toContain("cf-token");
    expect(message).not.toContain("alchemy-password");
    expect(message).not.toContain("generated-token");
  });

  it("refuses top-level deploy before Cloudflare mutation when existing target drift is unacknowledged", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const requests: CapturedFetchRequest[] = [];
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const remoteRecords: StoredRecord[] = [
      {
        id: "remote-only",
        entity: "block",
        values: { title: "Remote" },
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        ["deploy", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          deploy: async (input) => {
            deployInputs.push(input);
            return { url: input.plan.expectedUrl.url };
          },
          fetch: archiveFetch(
            requests,
            [installedSite("david", "David Peek")],
            {
              david: { records: remoteRecords },
            },
            [],
            [],
            controlPlaneRecords(),
          ),
        }),
      ),
    ).rejects.toThrow("Formless deploy refused because remote drift was detected");
    expect(deployInputs).toEqual([]);
    expect(requests.some((request) => request.method === "POST")).toBe(false);
  });

  it("reports existing target drift during top-level deploy dry-run", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const remoteRecords: StoredRecord[] = [
      {
        id: "remote-only",
        entity: "block",
        values: { title: "Remote" },
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await runFormlessCli(
      ["deploy", "--workspace", workspaceRoot, "--dry-run"],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);
          return { url: input.plan.expectedUrl.url };
        },
        fetch: archiveFetch(
          requests,
          [installedSite("david", "David Peek")],
          {
            david: { records: remoteRecords },
          },
          [],
          [],
          controlPlaneRecords(),
        ),
        logs,
      }),
    );

    expect(deployInputs).toEqual([]);
    expect(requests.some((request) => request.method === "POST")).toBe(false);
    expect(logs.at(-1)).toContain("Workspace operation: deploy plan (succeeded).");
    expect(logs.at(-1)).toContain("drift: drift.");
  });

  it("retries top-level deploy against an empty selected runtime as initial population", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const requests: CapturedFetchRequest[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const localDavid = appArchive("david", "David Peek", { records: [] });
    const controlPlaneSourceRecords = controlPlaneRecords().filter(
      (record) => record.id !== "route:host:publicSite:dpeek.com",
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot, controlPlaneSourceRecords);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    await writeWorkspaceAppStateFromArchive(workspaceRoot, localDavid);

    await runFormlessCli(
      ["deploy", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);
          return { url: input.plan.expectedUrl.url };
        },
        fetch: deploymentApplyFetch(
          requests,
          pushArchiveFetch(
            requests,
            [],
            {},
            [
              restorePlan({ createdInstalls: ["david"] }),
              restoreReport({ createdInstalls: ["david"] }),
            ],
            [],
            [],
            [],
          ),
        ),
        setupInputs,
      }),
    );

    const restoreRequests = requests.filter(
      (request) =>
        request.method === "POST" &&
        request.url === "https://personal.dpeek.workers.dev/api/formless/archive/restore",
    );

    expect(deployInputs).toHaveLength(1);
    expect(setupInputs).toEqual([
      {
        adminToken: "local-token",
        deploymentUrl: "https://personal.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(restoreRequests).toHaveLength(2);
    expect(
      restoreRequests.map(
        (request) =>
          capturedRequestJson<{ archive: InstanceArchive }>(request).archive.restorePolicy,
      ),
    ).toEqual([
      { dryRun: true, installCollisions: "replace" },
      { dryRun: false, installCollisions: "replace" },
    ]);
  });

  it("guards top-level deploy against missing Cloudflare accounts and target identity mismatch", async () => {
    const tempDir = await makeTempDir();
    const newWorkspaceRoot = path.join(tempDir, "new-personal");
    const existingWorkspaceRoot = path.join(tempDir, "personal-sites");
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const localDavid = appArchive("david", "David Peek", { records: [] });

    await writeWorkspaceManifest(newWorkspaceRoot);

    await expect(
      runFormlessCli(
        ["deploy"],
        cliDeps(newWorkspaceRoot, {
          accounts: [],
          deploy: async (input) => {
            deployInputs.push(input);
            return { url: input.plan.expectedUrl.url };
          },
        }),
      ),
    ).rejects.toThrow("No Cloudflare accounts were found for the selected credentials.");
    expect(deployInputs).toEqual([]);

    await writeWorkspaceManifest(existingWorkspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(existingWorkspaceRoot);
    await mkdir(path.join(existingWorkspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(existingWorkspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );
    await writeArchiveDirectory(
      path.join(existingWorkspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeWorkspaceAppStateFromArchive(existingWorkspaceRoot, localDavid);

    await expect(
      runFormlessCli(
        ["deploy", "--workspace", existingWorkspaceRoot],
        cliDeps(tempDir, {
          deploy: async (input) => {
            deployInputs.push(input);
            return { url: "https://wrong.dpeek.workers.dev" };
          },
          fetch: archiveFetch(
            [],
            [installedSite("david", "David Peek")],
            {
              david: { records: [] },
            },
            [],
            [],
            controlPlaneRecords(),
          ),
        }),
      ),
    ).rejects.toThrow(
      "Formless deploy returned https://wrong.dpeek.workers.dev, expected target https://personal.dpeek.workers.dev.",
    );
    expect(deployInputs).toHaveLength(1);
  });

  it("guards instance workspace deploy alias against target identity changes", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);
    await writeWorkspaceControlPlaneStorageSnapshot(workspaceRoot);
    await writeWorkspaceAppStateFromArchive(
      workspaceRoot,
      appArchive("david", "David Peek", { records: [] }),
    );

    await expect(
      runFormlessCli(
        ["deploy", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          deploy: async () => ({ url: "https://wrong.dpeek.workers.dev" }),
          fetch: archiveFetch(
            [],
            [installedSite("david", "David Peek")],
            {
              david: { records: [] },
            },
            [],
            [],
            controlPlaneRecords(),
          ),
        }),
      ),
    ).rejects.toThrow(
      "Formless deploy returned https://wrong.dpeek.workers.dev, expected target https://personal.dpeek.workers.dev.",
    );
  });

  it("exports app archives and restores them through the archive API", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "personal-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const sourceSnapshotRecords = mediaRecords();

    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [
        {
          adminRoute: "/apps/personal",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "personal",
          label: "Personal",
          packageAppKey: "site",
          publicRoute: "/sites/personal",
          publicRoutePrefix: "/sites/personal/",
          schemaRoute: "/apps/personal/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(snapshot(sourceSnapshotRecords));
    responses.queueBinary(Buffer.from([4, 5, 6]), "image/png");

    await exportAppArchive(
      {
        installId: "personal",
        outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        env: { FORMLESS_ADMIN_TOKEN: "export-token" },
        fetch: responses.fetcher(requests),
      }),
    );

    const archivePath = path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
    const archive = parsePortableArchive(
      JSON.parse(await readFile(archivePath, "utf8")) as unknown,
    );

    if (archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Expected app archive.");
    }

    expect(archive.app.installId).toBe("personal");
    expect(archive.capabilities).toEqual(["app-store-snapshots", "core-media-assets"]);
    expect(archive.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/personal/media/images/cover.png",
        deliveryHref: "/api/formless/media/media/images/cover.png",
        storageKey: "media/images/cover.png",
      }),
    ]);
    await expect(
      readFile(path.join(outDir, "media/personal/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/app-installs/site/personal/snapshot",
      "GET https://instance.example/api/formless/media/media/images/cover.png",
    ]);
    expect(requests.slice(0, 3).map((request) => request.headers.authorization)).toEqual([
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
    ]);

    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal-copy"],
          mediaCountsByApp: { "personal-copy": 1 },
          recordCountsByApp: { "personal-copy": { total: sourceSnapshotRecords.length } },
          replacedInstalls: [],
        },
      },
    });

    await restoreAppArchive(
      {
        adminToken: "secret",
        apply: true,
        archiveDir: outDir,
        installId: "personal-copy",
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: AppArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(`${restoreRequest?.method} ${restoreRequest?.url}`).toBe(
      "POST https://instance.example/api/formless/archive/restore",
    );
    expect(restoreRequest?.headers.authorization).toBe("Bearer secret");
    expect(restoreBody.archive.app.installId).toBe("personal-copy");
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(restoreBody.archive.media.objects[0]).toMatchObject({
      deliveryHref: "/api/formless/media/media/images/cover.png",
      storageKey: "media/images/cover.png",
    });
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
  });

  it("does not retarget old Site media keys or hrefs during app archive restore", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "legacy-site-media-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const legacyStorageKey = "app-installs/personal/site/images/cover.png";
    const legacyHref = `/api/app-installs/site/personal/media/${legacyStorageKey}`;
    const legacyArchive: AppArchive = {
      ...appArchive("personal", "Personal", {
        records: [
          block("block-cover", "2026-05-05T00:00:02.000Z", {
            type: "image",
            label: "Cover",
            href: legacyHref,
          }),
        ],
      }),
      capabilities: ["app-store-snapshots"],
      media: {
        objects: [
          {
            archivePath: "media/personal/site/images/cover.png",
            byteSize: 3,
            contentType: "image/png",
            deliveryHref: legacyHref,
            storageKey: legacyStorageKey,
          },
        ],
      },
    };

    await writeArchiveDirectory(outDir, legacyArchive, { personal: new Uint8Array([4, 5, 6]) });
    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal-copy"],
          mediaCountsByApp: { "personal-copy": 1 },
          recordCountsByApp: { "personal-copy": { total: 1 } },
          replacedInstalls: [],
        },
      },
    });

    await restoreAppArchive(
      {
        adminToken: null,
        apply: true,
        archiveDir: outDir,
        installId: "personal-copy",
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: AppArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(restoreBody.archive.app.installId).toBe("personal-copy");
    expect(restoreBody.archive.media.objects[0]).toMatchObject({
      deliveryHref: legacyHref,
      storageKey: legacyStorageKey,
    });
    expect(
      restoreBody.archive.data.kind === STORAGE_SNAPSHOT_KIND
        ? restoreBody.archive.data.records[0]?.values.href
        : undefined,
    ).toBe(legacyHref);
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(JSON.stringify(restoreBody.archive)).not.toContain("personal-copy/site/images");
  });

  it("exports installed Tasks app archives without media requests", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "tasks-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [
        {
          adminRoute: "/apps/work",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "work",
          label: "Work Tasks",
          packageAppKey: "tasks",
          ...packageAppFactsForKey("tasks", bundledAppPackageResolver)!,
          schemaRoute: "/apps/work/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(taskSnapshot(taskSeedRecords));

    await exportAppArchive(
      {
        installId: "work",
        outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const archivePath = path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
    const archive = parsePortableArchive(
      JSON.parse(await readFile(archivePath, "utf8")) as unknown,
    );

    if (archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Expected app archive.");
    }

    expect(archive.app).toMatchObject({
      installId: "work",
      packageAppKey: "tasks",
      packageRevision: packageAppFactsForKey("tasks", bundledAppPackageResolver)!.packageRevision,
      sourceSchemaKey: "tasks",
      sourceSchemaHash: packageAppFactsForKey("tasks", bundledAppPackageResolver)!.sourceSchemaHash,
    });
    expect(archive.data).toEqual(taskSnapshot(taskSeedRecords));
    expect(archive.media.objects).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/app-installs/tasks/work/snapshot",
    ]);
  });

  it("exports and restores mixed instance archives without non-Site media requests", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const sourceSnapshotRecords = mediaRecords();

    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [
        {
          adminRoute: "/apps/personal",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "personal",
          label: "Personal",
          packageAppKey: "site",
          ...packageAppFactsForKey("site", bundledAppPackageResolver)!,
          publicRoute: "/sites/personal",
          publicRoutePrefix: "/sites/personal/",
          schemaRoute: "/apps/personal/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          adminRoute: "/apps/work",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "work",
          label: "Work Tasks",
          packageAppKey: "tasks",
          ...packageAppFactsForKey("tasks", bundledAppPackageResolver)!,
          schemaRoute: "/apps/work/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          adminRoute: "/apps/sales",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "sales",
          label: "Sales CRM",
          packageAppKey: "crm",
          ...packageAppFactsForKey("crm", bundledAppPackageResolver)!,
          schemaRoute: "/apps/sales/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(controlPlaneSnapshot(controlPlaneRecords()));
    responses.queueJson(snapshot(sourceSnapshotRecords));
    responses.queueJson(taskSnapshot(taskSeedRecords));
    responses.queueJson(crmSnapshot(crmSeedRecords, "app:sales"));
    responses.queueBinary(Buffer.from([4, 5, 6]), "image/png");

    await exportInstanceArchive(
      {
        outDir,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        env: { FORMLESS_ADMIN_TOKEN: "export-token" },
        fetch: responses.fetcher(requests),
      }),
    );

    const archivePath = path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE);
    const archive = parsePortableArchive(
      JSON.parse(await readFile(archivePath, "utf8")) as unknown,
    );

    if (archive.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Expected instance archive.");
    }

    const personal = archive.apps.find((app) => app.app.installId === "personal");
    const sales = archive.apps.find((app) => app.app.installId === "sales");
    const work = archive.apps.find((app) => app.app.installId === "work");

    expect(
      archive.apps.map((app) => [
        app.app.installId,
        app.app.packageAppKey,
        app.app.packageRevision,
        app.app.sourceSchemaHash,
      ]),
    ).toEqual([
      [
        "personal",
        "site",
        packageAppFactsForKey("site", bundledAppPackageResolver)!.packageRevision,
        packageAppFactsForKey("site", bundledAppPackageResolver)!.sourceSchemaHash,
      ],
      [
        "sales",
        "crm",
        packageAppFactsForKey("crm", bundledAppPackageResolver)!.packageRevision,
        packageAppFactsForKey("crm", bundledAppPackageResolver)!.sourceSchemaHash,
      ],
      [
        "work",
        "tasks",
        packageAppFactsForKey("tasks", bundledAppPackageResolver)!.packageRevision,
        packageAppFactsForKey("tasks", bundledAppPackageResolver)!.sourceSchemaHash,
      ],
    ]);
    expect(archive.capabilities).toEqual([
      "installed-app-registry",
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ]);
    expect(personal?.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/personal/media/images/cover.png",
        storageKey: "media/images/cover.png",
      }),
    ]);
    expect(sales?.media.objects).toEqual([]);
    expect(work?.media.objects).toEqual([]);
    await expect(
      readFile(path.join(outDir, "media/personal/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/formless/control-plane/snapshot?actorKind=cliDeployer",
      "GET https://instance.example/api/app-installs/site/personal/snapshot",
      "GET https://instance.example/api/app-installs/tasks/work/snapshot",
      "GET https://instance.example/api/app-installs/crm/sales/snapshot",
      "GET https://instance.example/api/formless/media/media/images/cover.png",
    ]);
    expect(requests.slice(0, 6).map((request) => request.headers.authorization)).toEqual([
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
      "Bearer export-token",
    ]);

    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "sales", "work"],
          mediaCountsByApp: { personal: 1, sales: 0, work: 0 },
          recordCountsByApp: {
            personal: { total: sourceSnapshotRecords.length },
            sales: { total: crmSeedRecords.length },
            work: { total: taskSeedRecords.length },
          },
          replacedInstalls: [],
        },
      },
    });

    await restorePortableArchive(
      {
        adminToken: "secret",
        apply: true,
        archiveDir: outDir,
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(`${restoreRequest?.method} ${restoreRequest?.url}`).toBe(
      "POST https://instance.example/api/formless/archive/restore",
    );
    expect(restoreRequest?.headers.authorization).toBe("Bearer secret");
    expect(restoreBody.archive.kind).toBe(INSTANCE_ARCHIVE_KIND);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(
      restoreBody.archive.apps.find((app) => app.app.installId === "sales")?.media.objects,
    ).toEqual([]);
    expect(
      restoreBody.archive.apps.find((app) => app.app.installId === "work")?.media.objects,
    ).toEqual([]);
    expect(restoreBody.mediaFiles).toHaveLength(1);
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
  });

  it("adds upgrade planning to archive restore dry-run without mutating target", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-restore");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    await writeArchiveDirectory(outDir, instanceArchive([appArchive("david", "David Peek")]));
    responses.queueJson(
      {
        packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
          packageAppKey: appPackage.packageAppKey,
          packageRevision: appPackage.packageRevision,
          sourceSchemaHash: appPackage.sourceSchemaHash,
        })),
        packageVersion: "0.1.7",
        runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
        storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
        version: "0.1.7",
      },
      200,
      { "Cache-Control": "no-store" },
    );
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listInstallableAppPackages(bundledAppPackageResolver),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(restorePlan({ replacedInstalls: ["david"] }));

    const result = await restorePortableArchive(
      {
        adminToken: null,
        apply: false,
        archiveDir: outDir,
        replace: false,
        target: "https://instance.example",
      },
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{ archive: InstanceArchive }>(restoreRequest);

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/deploy",
      "GET https://instance.example/api/formless/setup",
      "GET https://instance.example/api/formless/app-installs",
      "POST https://instance.example/api/formless/archive/restore",
    ]);
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: true,
      installCollisions: "reject",
    });
    expect(result.archivePath).toBe(path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE));
    expect(result.upgradePlanning).toBeDefined();
  });

  it("rejects older archive restore dry-runs before posting to the target", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "legacy-instance-restore");
    const requests: CapturedFetchRequest[] = [];

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(legacyV1Archive(instanceArchive([appArchive("david", "David Peek")])), null, 2)}\n`,
    );

    await expect(
      restorePortableArchive(
        {
          adminToken: null,
          apply: false,
          archiveDir: outDir,
          replace: false,
          target: "https://instance.example",
        },
        cliDeps(tempDir, {
          fetch: responseQueue().fetcher(requests),
        }),
      ),
    ).rejects.toThrow("Instance archive version must be 2.");
    expect(requests).toEqual([]);
  });

  it("rejects legacy control-plane entity spellings in archive restore dry-runs", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "legacy-control-plane-restore");
    const requests: CapturedFetchRequest[] = [];
    const archive: InstanceArchive = {
      ...instanceArchive([appArchive("david", "David Peek")]),
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: controlPlaneSnapshot(
        controlPlaneRecords().map((record) =>
          record.entity === "app-install" ? { ...record, entity: "appInstall" } : record,
        ),
      ),
    };

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(archive, null, 2)}\n`,
    );

    await expect(
      restorePortableArchive(
        {
          adminToken: null,
          apply: false,
          archiveDir: outDir,
          replace: false,
          target: "https://instance.example",
        },
        cliDeps(tempDir, {
          fetch: responseQueue().fetcher(requests),
        }),
      ),
    ).rejects.toThrow(
      'Instance archive controlPlane records record "david" references unknown entity "appInstall".',
    );
    expect(requests).toEqual([]);
  });

  it("rejects unsupported archive versions before restore mutation", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "unsupported-instance-restore");
    const requests: CapturedFetchRequest[] = [];

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(
        {
          ...(legacyV1Archive(instanceArchive([appArchive("david", "David Peek")])) as Record<
            string,
            unknown
          >),
          version: 0,
        },
        null,
        2,
      )}\n`,
    );

    await expect(
      restorePortableArchive(
        {
          adminToken: null,
          apply: true,
          archiveDir: outDir,
          replace: false,
          target: "https://instance.example",
        },
        cliDeps(tempDir, {
          fetch: responseQueue().fetcher(requests),
        }),
      ),
    ).rejects.toThrow("Instance archive version must be 2.");
    expect(requests).toEqual([]);
  });

  it("normalizes local source URLs", () => {
    expect(normalizeSourceUrl("http://localhost:5173/pages/home?x=1#top")).toBe(
      "http://localhost:5173/pages/home",
    );
    expect(() => normalizeSourceUrl("not a url")).toThrow("Source URL is invalid: not a url");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "formless-site-cli-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

type CapturedCommand = {
  args: string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

type CapturedSpawnOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type CapturedSpawn = {
  args: string[];
  command: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type CapturedFetchRequest = {
  body: BodyInit | null | undefined;
  headers: Record<string, string>;
  method: string;
  url: string;
};

type CapturedWorkspaceGatewaySidecar = {
  closed: boolean;
  endpoint: string;
  proxyToken: string;
  workspaceRoot: string;
};

function capturedRequestJson<T>(request: CapturedFetchRequest | undefined): T {
  if (!request || typeof request.body !== "string") {
    throw new Error("Expected captured request body to be a JSON string.");
  }

  return JSON.parse(request.body) as T;
}

function expectNoOwnerSetupProtectedBootstrapReads(requests: CapturedFetchRequest[]) {
  const forbiddenPrefixes = [
    "/api/formless/app-installs",
    "/api/formless/archive",
    "/api/formless/control-plane",
    "/api/formless/deploy",
    "/api/formless/deployments",
    "/api/formless/session",
  ];

  expect(
    requests
      .map((request) => new URL(request.url).pathname)
      .filter((pathname) => forbiddenPrefixes.some((prefix) => pathname.startsWith(prefix))),
  ).toEqual([]);
}

function parseRequestBody<T>(init: RequestInit | undefined): T {
  if (typeof init?.body !== "string") {
    throw new Error("Expected request body to be a JSON string.");
  }

  return JSON.parse(init.body) as T;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

class FakeCliDevChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  stderr = new EventEmitter();
  stdout = new EventEmitter();

  announceReady(origin: string) {
    queueMicrotask(() => {
      this.stdout.emit("data", Buffer.from(`${fakeCliDevReadyLog(origin)}\n`));
    });
  }

  kill() {
    this.killed = true;
    return true;
  }

  close(code: number, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.emit("close", code, signal);
  }
}

function announceFakeCliDevServer(child: FakeCliDevChild, env: NodeJS.ProcessEnv | undefined) {
  child.announceReady(fakeCliDevOriginFromEnv(env));
}

function fakeCliDevOriginFromEnv(env: NodeJS.ProcessEnv | undefined): string {
  const port = env?.PORT && /^\d+$/.test(env.PORT) ? env.PORT : "5173";

  return `http://localhost:${port}`;
}

function fakeCliDevReadyLog(origin: string): string {
  return `Fake Vite ready: ${origin}/`;
}

function withoutFakeCliDevLogs(logs: string[]): string[] {
  return logs.filter((line) => !line.startsWith("Fake Vite ready: "));
}

async function writeWorkspaceManifest(
  workspaceRoot: string,
  options: {
    apps?: TestWorkspaceApp[];
    domains?: Array<{
      enabled: boolean;
      host: string;
      profile: "app" | "instance" | "publicSite";
      targetInstallId?: string;
    }>;
  } = {},
) {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
    formatFormlessInstanceWorkspaceManifest({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      defaultTarget: "remote",
      targets: [{ alias: "remote", url: "https://personal.dpeek.workers.dev" }],
      local: { stateRoot: ".formless/local", secretStateRoot: ".formless" },
      defaultAppPolicy: "declared-installs",
      apps: options.apps ?? [workspaceApp("david", "David Peek")],
      ...(options.domains === undefined ? {} : { domains: options.domains }),
    }),
  );
}

async function writeWorkspacePackageLinks(workspaceRoot: string, manifest: string) {
  await mkdir(workspaceRoot, { recursive: true });
  await writeFile(
    path.join(workspaceRoot, "formless.packages.json"),
    formatWorkspacePackageLinks({
      ...defaultWorkspacePackageLinks(),
      links: [{ manifest }],
    }),
  );
}

async function writePrivatePackageFixture(packageRoot: string, sourceSchemaHash: SourceSchemaHash) {
  const sourceRoot = path.join(packageRoot, "source");

  await mkdir(sourceRoot, { recursive: true });
  await writeJsonFile(path.join(sourceRoot, "schema.json"), taskSourceSchema);
  await writeJsonFile(path.join(sourceRoot, "seed-records.json"), []);
  await writeJsonFile(
    path.join(packageRoot, "formless.app.json"),
    privatePackageManifest(sourceSchemaHash),
  );
}

function privatePackageManifest(sourceSchemaHash: SourceSchemaHash): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "source/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-labs",
      path: "source/seed-records.json",
    },
    sourceSchemaHash,
    capabilities: [{ kind: "generatedAdmin", routeBase: "/apps" }],
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeWorkspaceControlPlaneStorageSnapshot(
  workspaceRoot: string,
  records: StoredRecord[] = controlPlaneRecords(),
) {
  const manifest = parseFormlessInstanceWorkspaceManifestJson(
    await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
  );

  await writeInstanceWorkspaceControlPlaneStorageSnapshot({
    manifest,
    snapshot: controlPlaneSnapshot(records),
    workspaceRoot,
  });
}

type TestWorkspaceApp = ReturnType<typeof workspaceApp> & {
  routes?: {
    admin?: `/apps/${string}`;
    public?: `/sites/${string}`;
    schema?: `/apps/${string}/schema`;
  };
};

async function writeWorkspaceDeployState(
  workspaceRoot: string,
  options: {
    deployEnv?: string;
    mediaBucketName?: string;
    workerName?: string;
  } = {},
) {
  const workerName = options.workerName ?? "personal";
  const deployRoot = path.join(workspaceRoot, ".formless/deploy", workerName);

  await mkdir(deployRoot, { recursive: true });
  await writeFile(
    path.join(deployRoot, "formless.instance.json"),
    `${JSON.stringify(
      {
        version: 1,
        kind: "formless-instance",
        instanceName: workerName,
        accountId: "account-123",
        workerName,
        workersDevUrl: `https://${workerName}.dpeek.workers.dev`,
        mediaBucketName: options.mediaBucketName ?? `${workerName}-media`,
        authorityNamespaceName: `${workerName}-authority`,
        deploymentTarget: "workers.dev",
        deployedPackageVersion: packageJson.version,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(deployRoot, "deploy.env"),
    options.deployEnv ??
      [
        "ALCHEMY_PASSWORD=alchemy-password",
        "ALCHEMY_PROFILE=personal-profile",
        "CLOUDFLARE_API_TOKEN=state-cf-token",
        "",
      ].join("\n"),
  );
}

function workspaceApp(installId: string, label: string) {
  return {
    installId,
    packageAppKey: "site",
    label,
    archivePath: `state/apps/${installId}.json`,
  };
}

function layoutWorkspaceManifest(name: string) {
  return {
    version: 1,
    kind: "formless-instance-workspace",
    name,
    state: { root: "state" },
    targets: [],
    media: { root: "state/media" },
    local: {
      stateRoot: ".formless/local",
      secretStateRoot: ".formless",
    },
    defaultAppPolicy: "none",
    apps: [],
  };
}

function expectedWorkspaceName(workspaceRoot: string): string {
  const basename = path.basename(workspaceRoot);
  const normalized = basename
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "formless-instance";
}

function installedSite(installId: string, label: string) {
  return installedApp(installId, label, "site");
}

function installedApp(installId: string, label: string, packageAppKey: "site" | "tasks") {
  const facts = packageAppFactsForKey(packageAppKey, bundledAppPackageResolver);

  if (!facts) {
    throw new Error(`Missing bundled package facts for ${packageAppKey}.`);
  }

  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    packageRevision: facts.packageRevision,
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as `/sites/${string}`,
          publicRoutePrefix: `/sites/${installId}/` as `/sites/${string}/`,
        }
      : {}),
    schemaRoute: `/apps/${installId}/schema` as `/apps/${string}/schema`,
    sourceSchemaHash: facts.sourceSchemaHash,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function privateControlPlaneRecords(sourceSchemaHash: SourceSchemaHash): StoredRecord[] {
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      id: "labs",
      entity: "app-install",
      values: {
        installId: "labs",
        packageAppKey: "private-labs",
        packageRevision: 7,
        sourceSchemaHash,
        label: "Private Labs",
        status: "installed",
        storageIdentity: "app:labs",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "route:labs:admin",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/apps/labs",
        kind: "mount",
        targetProfile: "app",
        appInstall: "labs",
        surface: "admin",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "route:labs:schema",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/apps/labs/schema",
        kind: "mount",
        targetProfile: "app",
        appInstall: "labs",
        surface: "schema",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
  ];
}

function instanceArchive(apps: AppArchive[]): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps,
  };
}

function legacyV1Archive(archive: InstanceArchive | AppArchive): unknown {
  const copy = JSON.parse(JSON.stringify(archive)) as {
    app?: Record<string, unknown>;
    apps?: unknown[];
    kind: string;
    version: number;
  };

  copy.version = 1;

  if (copy.kind === INSTANCE_ARCHIVE_KIND) {
    copy.apps = (copy.apps ?? []).map((app) =>
      legacyV1Archive(app as InstanceArchive | AppArchive),
    );
    return copy;
  }

  if (copy.app) {
    delete copy.app.packageRevision;
    delete copy.app.sourceSchemaHash;
  }

  return copy;
}

function appArchive(
  installId: string,
  label: string,
  options: {
    mediaBytes?: Uint8Array;
    packageAppKey?: string;
    records?: StoredRecord[];
  } = {},
): AppArchive {
  const packageAppKey = options.packageAppKey ?? "site";
  const packageFacts = packageAppFactsForKey(packageAppKey, bundledAppPackageResolver);

  if (!packageFacts) {
    throw new Error(`Missing bundled package facts for ${packageAppKey}.`);
  }

  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey,
      packageRevision: packageFacts.packageRevision,
      sourceSchemaKey: "site",
      sourceSchemaHash: packageFacts.sourceSchemaHash,
      label,
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: snapshot(options.records ?? [], `app:${installId}`),
    media: {
      objects: options.mediaBytes
        ? [
            {
              archivePath: `media/${installId}/media/images/cover.png`,
              asset: {
                byteSize: options.mediaBytes.byteLength,
                contentType: "image/png",
                deliveryHref: "/api/formless/media/media/images/cover.png",
                id: "cover.png",
                kind: "image",
                label: "cover.png",
                provider: "r2",
                status: "ready",
                storageKey: "media/images/cover.png",
              },
              byteSize: options.mediaBytes.byteLength,
              contentType: "image/png",
              deliveryHref: "/api/formless/media/media/images/cover.png",
              storageKey: "media/images/cover.png",
            },
          ]
        : [],
    },
  };
}

function privateAppArchive(sourceSchemaHash: SourceSchemaHash): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId: "labs",
      packageAppKey: "private-labs",
      packageRevision: 7,
      sourceSchemaKey: "private-labs",
      sourceSchemaHash,
      label: "Private Labs",
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: {
      kind: STORAGE_SNAPSHOT_KIND,
      version: STORAGE_SNAPSHOT_VERSION,
      storageIdentity: "app:labs",
      schemaKey: "private-labs",
      exportedAt: "2026-05-12T00:00:00.000Z",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      sourceCursor: 0,
      schema: taskSourceSchema,
      records: [],
    },
    media: {
      objects: [],
    },
  };
}

async function writeArchiveDirectory(
  archiveRoot: string,
  archive: InstanceArchive | AppArchive,
  mediaByInstall: Record<string, Uint8Array> = {},
) {
  if (archive.kind === APP_ARCHIVE_KIND) {
    const workspaceRoot = workspaceRootFromLegacyAppArchiveRoot(archiveRoot);

    if (workspaceRoot !== undefined) {
      await writeWorkspaceAppStateFromArchive(
        workspaceRoot,
        archive,
        mediaByInstall[archive.app.installId],
        path.basename(archiveRoot),
      );
      return;
    }
  }

  const mediaFiles: ArchiveDiskMediaFile[] = [];

  for (const app of archiveApps(archive)) {
    const bytes = mediaByInstall[app.app.installId];

    if (!bytes) {
      continue;
    }

    const object = app.media.objects[0];

    if (!object) {
      throw new Error(`Expected media object for ${app.app.installId}.`);
    }

    mediaFiles.push({
      archivePath: object.archivePath,
      byteSize: bytes.byteLength,
      bytes,
      contentType: object.contentType,
    });
  }

  await writePortableArchiveDirectory(
    {
      archive,
      mediaFiles,
      outDir: archiveRoot,
    },
    { cwd: "/" },
  );
}

function workspaceRootFromLegacyAppArchiveRoot(archiveRoot: string): string | undefined {
  const marker = `${path.sep}archives${path.sep}apps${path.sep}`;
  const index = archiveRoot.lastIndexOf(marker);

  return index < 0 ? undefined : archiveRoot.slice(0, index);
}

async function writeWorkspaceAppStateFromArchive(
  workspaceRoot: string,
  archive: AppArchive,
  mediaBytes?: Uint8Array,
  installId: string = archive.app.installId,
) {
  const manifest = parseFormlessInstanceWorkspaceManifestJson(
    await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
  );

  if (archive.data.kind !== STORAGE_SNAPSHOT_KIND) {
    throw new Error(
      `Workspace app state for "${archive.app.installId}" must be a storage snapshot.`,
    );
  }

  if (installId === archive.app.installId) {
    await writeInstanceWorkspaceAppStorageSnapshot({
      installId,
      manifest,
      snapshot: archive.data,
      workspaceRoot,
    });
  } else {
    const statePath = path.join(workspaceRoot, manifest.state.root, "apps", `${installId}.json`);

    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, `${JSON.stringify(archive.data, null, 2)}\n`);
  }

  if (mediaBytes === undefined) {
    return;
  }

  const object = archive.media.objects[0];

  if (!object) {
    throw new Error(`Expected media object for ${archive.app.installId}.`);
  }

  const mediaPath = instanceWorkspaceMediaFilePath(workspaceRoot, manifest, object.archivePath);

  await mkdir(path.dirname(mediaPath), { recursive: true });
  await writeFile(mediaPath, mediaBytes);
}

function archiveFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  extraPackages: InstallableAppPackage[] = [],
  domainMappings: ReturnType<typeof domainMapping>[] = [],
  controlPlaneRecords?: StoredRecord[],
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);

    requests.push({
      body: init?.body,
      headers: normalizeHeaders(init?.headers),
      method: init?.method ?? "GET",
      url: requestUrl,
    });

    if (parsedUrl.pathname === "/api/formless/deploy") {
      return Response.json(
        {
          packageApps: listInstallableAppPackages(bundledAppPackageResolver).map((appPackage) => ({
            packageAppKey: appPackage.packageAppKey,
            packageRevision: appPackage.packageRevision,
            sourceSchemaHash: appPackage.sourceSchemaHash,
          })),
          packageVersion: packageJson.version,
          runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
          storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
          version: packageJson.version,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (parsedUrl.pathname === "/api/formless/setup") {
      return Response.json({ setupComplete: true });
    }

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        packages: [...listInstallableAppPackages(bundledAppPackageResolver), ...extraPackages],
        installs,
      });
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json({
        appliedStates: [],
        auditEvents: [],
        mappings: domainMappings,
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/status") {
      const desiredState = deploymentDesiredStateRef();

      return Response.json({
        status: {
          checkedAt: "2026-05-12T02:00:00.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/bootstrap") {
      if (controlPlaneRecords === undefined) {
        return Response.json({ error: "not found" }, { status: 404 });
      }

      return Response.json({
        cursor: 1,
        records: controlPlaneRecords,
        schema: {},
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/snapshot") {
      if (controlPlaneRecords === undefined) {
        return Response.json({ error: "not found" }, { status: 404 });
      }

      return Response.json(controlPlaneSnapshot(controlPlaneRecords));
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/([^/]+)\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const packageAppKey = snapshotMatch[1] ?? "";
      const installId = snapshotMatch[2] ?? "";

      return Response.json(
        snapshotForPackage(packageAppKey, installId, dataByInstall[installId]?.records ?? []),
      );
    }

    if (parsedUrl.pathname === "/api/formless/media/media/images/cover.png") {
      const mediaBytes = Object.values(dataByInstall).find((data) => data.mediaBytes)?.mediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    const mediaMatch = parsedUrl.pathname.match(/^\/api\/app-installs\/site\/([^/]+)\/media\//);

    if (mediaMatch) {
      const installId = mediaMatch[1] ?? "";
      const mediaBytes = dataByInstall[installId]?.mediaBytes;

      if (mediaBytes) {
        return new Response(Buffer.from(mediaBytes), {
          headers: { "content-type": "image/png" },
        });
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function domainMapping(host: string, installId: string) {
  return {
    createdAt: "2026-05-26T00:00:00.000Z",
    enabled: true,
    host,
    installId,
    profile: "publicSite",
    surface: "site",
    targetInstallId: installId,
    updatedAt: "2026-05-26T00:00:00.000Z",
  };
}

function controlPlaneRecords(
  options: {
    driftStatus?: "drifted" | "in-sync" | "unknown";
    host?: string;
    installId?: string;
    targetUrl?: string;
  } = {},
): StoredRecord[] {
  const host = options.host ?? "dpeek.com";
  const installId = options.installId ?? "david";
  const adminRouteId = `route:${installId}:admin`;
  const publicRouteId = `route:${installId}:public-site`;
  const schemaRouteId = `route:${installId}:schema`;
  const domainRouteId = `route:host:publicSite:${host}`;
  const deployTargetId = "instance.primary";
  const targetUrl = options.targetUrl ?? "https://personal.dpeek.workers.dev";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      id: installId,
      entity: "app-install",
      values: {
        installId,
        packageAppKey: "site",
        label: "David Peek",
        status: "installed",
        storageIdentity: `app:${installId}`,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: adminRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchPath: `/apps/${installId}`,
        kind: "mount",
        targetProfile: "app",
        appInstall: installId,
        surface: "admin",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: publicRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchPath: `/sites/${installId}`,
        matchPrefix: `/sites/${installId}/`,
        kind: "mount",
        targetProfile: "public-site",
        appInstall: installId,
        surface: "public-site",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: schemaRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchPath: `/apps/${installId}/schema`,
        kind: "mount",
        targetProfile: "app",
        appInstall: installId,
        surface: "schema",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: domainRouteId,
      entity: "route",
      values: {
        enabled: true,
        matchHost: host,
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: installId,
        surface: "public-site",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: deployTargetId,
      entity: "deployment-config",
      values: {
        targetId: deployTargetId,
        targetKind: "instance",
        label: deployTargetId,
        enabled: true,
        targetUrl,
        providerFamily: "cloudflare",
        accountId: "account-123",
        workerName: "personal",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
  ];
}

function localOnlyControlPlaneRecords(): StoredRecord[] {
  return controlPlaneRecords().filter(
    (record) =>
      record.entity !== "deployment-config" && record.id !== "route:host:publicSite:dpeek.com",
  );
}

function controlPlaneRecordsWithDisabledDeployTarget(): StoredRecord[] {
  return controlPlaneRecords().map((record) => {
    if (record.entity !== "deployment-config") {
      return record;
    }

    return {
      ...record,
      values: {
        ...record.values,
        enabled: false,
      },
    };
  });
}

function redirectRouteRecord(fromHost: string, toHost: string): StoredRecord {
  const now = "2026-05-26T00:00:00.000Z";

  return {
    id: `route:redirect:${fromHost}`,
    entity: "route",
    values: {
      enabled: true,
      matchHost: fromHost,
      matchPath: "/",
      matchPrefix: "/",
      kind: "redirect",
      toHost: toHost,
      statusCode: "308",
      preservePath: true,
      preserveQueryString: true,
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
  };
}

function disabledHostRouteRecord(host: string, installId: string): StoredRecord {
  const now = "2026-05-26T00:00:00.000Z";

  return {
    id: `route:host:publicSite:${host}`,
    entity: "route",
    values: {
      enabled: false,
      matchHost: host,
      matchPath: "/",
      matchPrefix: "/",
      kind: "mount",
      targetProfile: "public-site",
      appInstall: installId,
      surface: "public-site",
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
  };
}

function pushArchiveFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  restoreResponses: unknown[],
  extraPackages: InstallableAppPackage[] = [],
  domainMappings: ReturnType<typeof domainMapping>[] = [],
  remoteControlPlaneRecords?: StoredRecord[],
): typeof fetch {
  const readFetch = archiveFetch(
    requests,
    installs,
    dataByInstall,
    extraPackages,
    domainMappings,
    remoteControlPlaneRecords ?? controlPlaneRecords(),
  );

  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    if (method === "POST" && parsedUrl.pathname === "/api/formless/archive/restore") {
      requests.push({
        body: init?.body,
        headers: normalizeHeaders(init?.headers),
        method,
        url: requestUrl,
      });

      const response = restoreResponses.shift();

      if (!response) {
        throw new Error(`Unexpected archive restore request: ${requestUrl}`);
      }

      return Response.json(response);
    }

    return readFetch(url, init);
  };
}

function deploymentApplyFetch(
  requests: CapturedFetchRequest[],
  baseFetch: typeof fetch,
  options: { resourcesByKind?: Record<string, number> } = {},
): typeof fetch {
  const resourcesByKind = options.resourcesByKind ?? {};
  const resourceCount = Object.values(resourcesByKind).reduce((sum, count) => sum + count, 0);

  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const desiredState = deploymentDesiredStateRef();

    if (
      parsedUrl.pathname.startsWith("/api/formless/deployments/") ||
      parsedUrl.pathname === "/api/formless/control-plane/operations/deployment-config/update"
    ) {
      requests.push({
        body: init?.body,
        headers: normalizeHeaders(init?.headers),
        method: init?.method ?? "GET",
        url: requestUrl,
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/desired-state") {
      return Response.json({
        desiredState: {
          ...desiredState,
          createdAt: "2026-05-12T02:00:00.000Z",
          display: {
            resourceCount,
            resourcesByKind,
            title: "Primary instance target",
          },
          resourceGraph: { resources: [], targetId: desiredState.targetId },
          schemaVersion: 1,
          source: { fingerprint: "workspace", intentRevision: 1 },
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/deployments/status") {
      return Response.json({
        status: {
          checkedAt: "2026-05-12T02:00:00.000Z",
          latestDesiredState: desiredState,
          state: "pending-changes",
          targetId: desiredState.targetId,
        },
        target: { kind: "instance", targetId: desiredState.targetId },
      });
    }

    if (parsedUrl.pathname === "/api/formless/control-plane/operations/deployment-config/update") {
      const body = parseRequestBody<{
        idempotencyKey: string;
        input: Record<string, unknown>;
        recordId: string;
      }>(init);
      const record = {
        createdAt: "2026-05-26T00:00:00.000Z",
        entity: "deployment-config",
        id: body.recordId,
        values: {
          accountId: "account-123",
          createdAt: "2026-05-26T00:00:00.000Z",
          enabled: true,
          label: "Primary instance",
          providerFamily: "cloudflare",
          targetId: "instance.primary",
          targetKind: "instance",
          targetUrl: "https://personal.dpeek.workers.dev",
          updatedAt: "2026-05-26T00:00:00.000Z",
          workerName: "personal",
          ...body.input,
        },
      };

      return Response.json({
        invocation: {},
        output: {
          affectedChangeIds: [],
          changes: [],
          cursor: 2,
          record,
          type: "update",
        },
        status: "committed",
      });
    }

    return baseFetch(url, init);
  };
}

function deploymentDesiredStateRef() {
  return {
    hash: `sha256:${"b".repeat(64)}`,
    revision: 3,
    targetId: "instance.primary",
    versionId: "desired.instance.primary.3",
  };
}

function localInstanceDevFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsedUrl = new URL(requestUrl);
    const method = init?.method ?? "GET";

    requests.push({
      body: init?.body,
      headers: normalizeHeaders(init?.headers),
      method,
      url: requestUrl,
    });

    if (method === "GET" && parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        packages: listInstallableAppPackages(bundledAppPackageResolver),
        installs,
      });
    }

    if (method === "POST" && parsedUrl.pathname === "/api/formless/archive/restore") {
      return Response.json(restoreReport({ createdInstalls: ["david"] }));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function restorePlan(
  summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }> = {},
) {
  return {
    ok: true,
    plan: {
      summary: restoreSummary(summary),
    },
  };
}

function restoreReport(
  summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }> = {},
) {
  return {
    ok: true,
    report: {
      applied: true,
      summary: restoreSummary(summary),
    },
  };
}

function restoreSummary(
  summary: Partial<{
    createdInstalls: string[];
    replacedInstalls: string[];
  }>,
) {
  return {
    appCount: 1,
    createdInstalls: summary.createdInstalls ?? [],
    mediaCountsByApp: { david: 0 },
    recordCountsByApp: { david: { total: 0 } },
    replacedInstalls: summary.replacedInstalls ?? [],
  };
}

function fakeCloudflareDomainClient(input: {
  dnsRecords: Record<string, CloudflareDnsRecord[]>;
  workerDomains: CloudflareWorkerDomain[];
  workerRoutes: Record<string, CloudflareWorkerRoute[]>;
  zonesByName: Record<string, CloudflareZone[]>;
}): CloudflareDomainClient {
  return {
    listActiveZonesForName: async ({ name }) => input.zonesByName[name] ?? [],
    listDnsRecords: async ({ name }) => input.dnsRecords[name] ?? [],
    listRedirectRules: async () => [],
    listWorkerDomains: async () => input.workerDomains,
    listWorkerRoutes: async ({ zoneId }) => input.workerRoutes[zoneId] ?? [],
  };
}

function destroyedResourceSummary(
  input?: DestroyFormlessInstanceInput,
): DestroyFormlessInstanceResult["resources"] {
  if (input !== undefined) {
    const resources =
      input.domainProviderResources?.resources ?? input.domainProviderPlan.resources;

    return {
      alchemyState: "destroyed",
      customDomains: resources.filter(
        (resource) => resource.kind === "cloudflare-worker-custom-domain",
      ).length,
      dnsRecords: resources.filter((resource) => resource.kind === "cloudflare-dns-records").length,
      durableObjectNamespace: "destroyed",
      mediaBucket: "destroyed",
      redirectRules: resources.filter((resource) => resource.kind === "cloudflare-redirect-rule")
        .length,
      turnstileWidget: "destroyed",
      worker: "destroyed",
      workerAssets: "destroyed",
      workerSecrets: "destroyed",
    };
  }

  return {
    alchemyState: "destroyed",
    customDomains: 1,
    dnsRecords: 1,
    durableObjectNamespace: "destroyed",
    mediaBucket: "destroyed",
    redirectRules: 0,
    turnstileWidget: "destroyed",
    worker: "destroyed",
    workerAssets: "destroyed",
    workerSecrets: "destroyed",
  };
}

function cliDeps(
  cwd: string,
  options: {
    accounts?: Array<{ id: string; name?: string; workersDevSubdomain: string }>;
    accountDiscoveryInputs?: Array<{ credentialProfile: string | null }>;
    cloudflareDomainClient?: CloudflareDomainClient;
    commands?: CapturedCommand[];
    deploy?: (input: DeployFormlessInstanceInput) => Promise<{ url: string }>;
    destroy?: (input: DestroyFormlessInstanceInput) => Promise<DestroyFormlessInstanceResult>;
    domainProviderDeleteRuntime?: FormlessCliDependencies["domainProviderDeleteRuntime"];
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    healthInputs?: CheckFormlessInstanceDeployMetadataInput[];
    logs?: string[];
    openedUrls?: string[];
    packageRoot?: string;
    selectWorkspaceName?: FormlessCliDependencies["selectWorkspaceName"];
    setupInputs?: CreateFormlessInstanceOwnerSetupCapabilityInput[];
    spawn?: typeof spawn;
    startWorkspaceGatewaySidecar?: FormlessCliDependencies["startWorkspaceGatewaySidecar"];
    stateRoot?: string;
    stateWrites?: WriteFormlessInstanceStateInput[];
  } = {},
): FormlessCliDependencies {
  const randomToken = randomTokenSequence(
    "generated-token",
    setupToken,
    "local-session-token",
    "sidecar-proxy-token",
  );

  return {
    accountDiscovery: {
      listAccounts: async (input) => {
        options.accountDiscoveryInputs?.push(input);

        return (
          options.accounts ?? [
            {
              id: "account-123",
              name: "Personal",
              workersDevSubdomain: "dpeek",
            },
          ]
        );
      },
    },
    cloudflareDomainClient: () =>
      options.cloudflareDomainClient ??
      fakeCloudflareDomainClient({
        dnsRecords: {},
        workerDomains: [],
        workerRoutes: {},
        zonesByName: {},
      }),
    cwd,
    deploymentAdapter: {
      deploy:
        options.deploy ??
        (async (input) => ({
          url: input.plan.expectedUrl.url,
        })),
      destroy: options.destroy ?? (async () => ({ resources: destroyedResourceSummary() })),
    },
    ...(options.domainProviderDeleteRuntime === undefined
      ? {}
      : { domainProviderDeleteRuntime: options.domainProviderDeleteRuntime }),
    env: options.env ?? {},
    fetch: options.fetch ?? fetch,
    healthCheck: {
      check: async (input) => {
        options.healthInputs?.push(input);

        return {
          cacheControl: "no-store",
          metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
          packageVersion: input.expectedVersion,
          runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
          storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
          url: input.url,
          version: input.expectedVersion,
        };
      },
    },
    localSecretEnv: {
      ensure: async (input) => ({
        created: false,
        path: path.join(input.root, "deploy.env"),
        secrets: {
          ALCHEMY_PASSWORD: "alchemy-password",
        },
      }),
    },
    log: (message) => {
      options.logs?.push(message);
    },
    now: () => "2026-05-12T02:00:00.000Z",
    openBrowser: async (url) => {
      options.openedUrls?.push(url);
    },
    packageRoot: options.packageRoot ?? process.cwd(),
    randomToken,
    runCommand: async (
      command: string,
      args: string[],
      commandOptions: FormlessCliRunCommandOptions,
    ) => {
      options.commands?.push({
        args,
        command,
        cwd: commandOptions.cwd,
        env: commandOptions.env,
      });
    },
    ...(options.selectWorkspaceName === undefined
      ? {}
      : { selectWorkspaceName: options.selectWorkspaceName }),
    spawn: options.spawn ?? spawn,
    startWorkspaceGatewaySidecar:
      options.startWorkspaceGatewaySidecar ?? fakeWorkspaceGatewaySidecar(),
    stateRoot: options.stateRoot ?? path.join(cwd, ".formless"),
    stateWriter: {
      write: async (input) => {
        options.stateWrites?.push(input);

        return {
          path: path.join(input.root, "formless.instance.json"),
          state: input.state,
        };
      },
    },
    setupCapability: {
      create: async (input) => {
        options.setupInputs?.push(input);

        return {
          capabilityCreated: true,
          endpointUrl: new URL(
            "/api/formless/setup/capability",
            `${input.deploymentUrl}/`,
          ).toString(),
          setupComplete: false,
        };
      },
    },
  };
}

function fakeWorkspaceGatewaySidecar(
  captures: CapturedWorkspaceGatewaySidecar[] = [],
): NonNullable<FormlessCliDependencies["startWorkspaceGatewaySidecar"]> {
  return async (input, dependencies) => {
    const sidecar = {
      closed: false,
      endpoint: "http://127.0.0.1:1",
      proxyToken: dependencies.createProxyToken?.() ?? "generated-token",
      workspaceRoot: input.workspaceRoot,
    };
    captures.push(sidecar);

    return {
      close: async () => {
        sidecar.closed = true;
      },
      endpoint: sidecar.endpoint,
      proxyToken: sidecar.proxyToken,
    };
  };
}

function randomTokenSequence(...tokens: string[]): () => string {
  let index = 0;

  return () => tokens[index++ % tokens.length] ?? setupToken;
}

function responseQueue() {
  const responses: Response[] = [];

  return {
    fetcher:
      (requests: CapturedFetchRequest[]): typeof fetch =>
      async (url, init) => {
        const requestUrl =
          typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        requests.push({
          body: init?.body,
          headers: normalizeHeaders(init?.headers),
          method: init?.method ?? "GET",
          url: requestUrl,
        });

        const response = responses.shift();

        if (!response) {
          throw new Error(`Unexpected request: ${requestUrl}`);
        }

        return response;
      },
    queueBinary: (value: Uint8Array, contentType: string, status = 200) =>
      responses.push(
        new Response(Buffer.from(value), {
          headers: { "content-type": contentType },
          status,
        }),
      ),
    queueJson: (value: unknown, status = 200, headers?: HeadersInit) =>
      responses.push(Response.json(value, { headers, status })),
    queueText: (value: string, status = 200) => responses.push(new Response(value, { status })),
  };
}

function snapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:personal",
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey: "site",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: 1,
    schema: siteSourceSchema,
    records,
  };
}

function controlPlaneSnapshot(records: StoredRecord[]): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity: INSTANCE_CONTROL_PLANE_STORAGE_IDENTITY,
    schemaKey: INSTANCE_CONTROL_PLANE_SCHEMA_KEY,
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-26T00:00:00.000Z",
    sourceCursor: records.length,
    schema: instanceControlPlaneSchema,
    records,
  };
}

function taskSnapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:work",
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey: "tasks",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: records.length,
    schema: taskSourceSchema,
    records,
  };
}

function crmSnapshot(
  records: StoredRecord[],
  storageIdentity: `app:${string}` = "app:rates",
): StorageSnapshot {
  return {
    kind: STORAGE_SNAPSHOT_KIND,
    version: STORAGE_SNAPSHOT_VERSION,
    storageIdentity,
    schemaKey: "crm",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: records.length,
    schema: crmSourceSchema,
    records,
  };
}

function snapshotForPackage(
  packageAppKey: string,
  installId: string,
  records: StoredRecord[],
): StorageSnapshot {
  if (packageAppKey === "site") {
    return snapshot(records, `app:${installId}`);
  }

  if (packageAppKey === "tasks") {
    return taskSnapshot(records, `app:${installId}`);
  }

  if (packageAppKey === "crm") {
    return crmSnapshot(records, `app:${installId}`);
  }

  throw new Error(`Unsupported test package "${packageAppKey}".`);
}

function mediaRecords(): StoredRecord[] {
  return [
    block("block-home", "2026-05-05T00:00:01.000Z", {
      type: "page",
      label: "Home",
      href: "/",
    }),
    block("block-cover", "2026-05-05T00:00:02.000Z", {
      type: "image",
      label: "Cover",
      mediaAssetId: "cover.png",
    }),
  ];
}

function publishRecords(): StoredRecord[] {
  return [
    ...mediaRecords(),
    block("block-about", "2026-05-05T00:00:03.000Z", {
      type: "page",
      label: "About",
      href: "/about",
    }),
  ];
}

function block(id: string, createdAt: string, values: StoredRecord["values"]): StoredRecord {
  return {
    id,
    createdAt,
    entity: "block",
    values,
  };
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error("Timed out waiting for predicate.");
}
