import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  parsePortableArchive,
  type AppArchive,
  type InstanceArchive,
} from "../shared/archive.ts";
import { listBundledAppPackages, type BundledAppPackage } from "../shared/app-installs.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import {
  rateSeedRecords,
  rateSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";
import { formlessCliUsage, normalizeSourceUrl, parseFormlessCliArgs } from "./cli-command.ts";
import {
  defaultSiteProjectConfig,
  formatSiteProjectConfig,
  parseSiteProjectConfigJson,
} from "./project-config.ts";
import {
  formatSiteProjectRecords,
  parseSiteProjectRecordsJson,
  siteProjectMediaAssetsFromRecords,
} from "./project-source.ts";
import {
  initSiteProject,
  onboardFormlessInstance,
  PORTABLE_ARCHIVE_MANIFEST_FILE,
  FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE,
  formatFormlessInstanceWorkspaceManifest,
  parseFormlessInstanceWorkspaceManifestJson,
  publishSiteProject,
  runFormlessCli,
  saveSiteProject,
  setupSiteProjectDeploy,
  siteProjectDevEnv,
  siteProjectWranglerPersistPath,
  startSiteProjectLocalPublishBroker,
  type CheckFormlessInstanceDeployMetadataInput,
  type CreateFormlessInstanceOwnerSetupCapabilityInput,
  type DeployFormlessInstanceInput,
  type FormlessCliDependencies,
  type FormlessCliRunCommandOptions,
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
      "  init <dir>                         Create a Formless Site project",
      "  onboard [options]                  Create a remote Formless instance",
      "       [--name <name>] [--credential-profile <name>] [--open | --no-open]",
      "  dev [--project <path>]             Run local public preview and /admin editor",
      "  save [--project <path>] [--check]   Save local Site edits back to project files",
      "       [--source <url>]",
      "  deploy setup [options]              Store deploy config and local admin token",
      "  publish [--project <path>]          Deploy code, media, and records",
      "       [--dry-run] [--yes]",
      "  archive export --target <url> --out <dir>",
      "  archive export-app --target <url> --install <id> --out <dir>",
      "  archive restore --target <url> --archive <dir> [--apply] [--replace]",
      "       [--admin-token <token>]",
      "  archive restore-app --target <url> --archive <dir> --install <id>",
      "       [--apply] [--replace] [--admin-token <token>]",
      "  archive import-site --project <path> --install <id> --out <dir>",
      "       [--label <label>]",
      "  instance init-workspace [--workspace <path>] [--name <name>]",
      "       [--target-url <url>] [--target <alias>] [--from-remote | --from-archive <dir>]",
      "  instance status|pull|check [--workspace <path>] [--target <alias>]",
      "  instance push [--workspace <path>] [--target <alias>]",
      "       [--apply] [--replace] [--allow-stale] [--replace-install-set]",
      "  instance dev|reset-local [--workspace <path>]",
      "  instance deploy [--workspace <path>] [--target <alias>]",
      "       [--migration-policy <new|existing>]",
      "  instance token <adopt|rotate> [--workspace <path>] [--target <alias>]",
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

  it("parses init, dev, and save commands", () => {
    expect(parseFormlessCliArgs(["init", "my-site"])).toEqual({
      kind: "init",
      targetDir: "my-site",
    });
    expect(parseFormlessCliArgs(["dev", "--project", "../site"])).toEqual({
      kind: "dev",
      projectPath: "../site",
    });
    expect(
      parseFormlessCliArgs([
        "save",
        "--project",
        "../site",
        "--check",
        "--source",
        "https://example.com/?draft=1#top",
      ]),
    ).toEqual({
      check: true,
      kind: "save",
      projectPath: "../site",
      source: "https://example.com",
    });
    expect(parseFormlessCliArgs([])).toEqual({ kind: "help" });
    expect(() => parseFormlessCliArgs(["save", "--source"])).toThrow("Missing value for --source.");
  });

  it("parses onboard command defaults, options, and browser-open flags", () => {
    expect(parseFormlessCliArgs(["onboard"])).toEqual({
      credentialProfile: null,
      instanceName: null,
      kind: "onboard",
      open: false,
    });
    expect(
      parseFormlessCliArgs([
        "onboard",
        "--name",
        "brother-instance",
        "--credential-profile",
        "personal",
        "--open",
      ]),
    ).toEqual({
      credentialProfile: "personal",
      instanceName: "brother-instance",
      kind: "onboard",
      open: true,
    });
    expect(parseFormlessCliArgs(["onboard", "--open", "--no-open"])).toEqual({
      credentialProfile: null,
      instanceName: null,
      kind: "onboard",
      open: false,
    });
  });

  it("keeps default project, deploy setup, and publish flags stable", () => {
    expect(parseFormlessCliArgs(["dev"])).toEqual({
      kind: "dev",
      projectPath: ".",
    });
    expect(parseFormlessCliArgs(["save"])).toEqual({
      check: false,
      kind: "save",
      projectPath: ".",
      source: null,
    });
    expect(
      parseFormlessCliArgs([
        "deploy",
        "setup",
        "--worker",
        "brother-site",
        "--publish-url",
        "https://live.example/",
        "--media-bucket",
        "brother-site-media",
      ]),
    ).toEqual({
      accountId: null,
      adminToken: null,
      createBucket: false,
      kind: "deploySetup",
      mediaBucket: "brother-site-media",
      projectPath: ".",
      publishUrl: "https://live.example",
      uploadSecret: true,
      workerName: "brother-site",
    });
    expect(parseFormlessCliArgs(["publish"])).toEqual({
      dryRun: false,
      kind: "publish",
      projectPath: ".",
      yes: false,
    });
    expect(parseFormlessCliArgs(["publish", "-y"])).toEqual({
      dryRun: false,
      kind: "publish",
      projectPath: ".",
      yes: true,
    });
  });

  it("keeps CLI parse error messages stable", () => {
    expect(() => parseFormlessCliArgs(["unknown"])).toThrow("Unknown command: unknown");
    expect(() => parseFormlessCliArgs(["init"])).toThrow("Usage: formless init <dir>");
    expect(() => parseFormlessCliArgs(["dev", "--help"])).toThrow(
      "Usage: formless dev [--project <path>]",
    );
    expect(() => parseFormlessCliArgs(["dev", "--verbose"])).toThrow(
      "Unknown option for formless dev: --verbose",
    );
    expect(() => parseFormlessCliArgs(["save", "--project"])).toThrow(
      "Missing value for --project.",
    );
    expect(() => parseFormlessCliArgs(["save", "--force"])).toThrow(
      "Unknown option for formless save: --force",
    );
    expect(() => parseFormlessCliArgs(["onboard", "--help"])).toThrow(
      "Usage: formless onboard [--name <name>] [--credential-profile <name>] [--open | --no-open]",
    );
    expect(() => parseFormlessCliArgs(["onboard", "--name"])).toThrow("Missing value for --name.");
    expect(() => parseFormlessCliArgs(["onboard", "--credential-profile"])).toThrow(
      "Missing value for --credential-profile.",
    );
    expect(() => parseFormlessCliArgs(["onboard", "--bogus"])).toThrow(
      "Unknown option for formless onboard: --bogus",
    );
    expect(() => parseFormlessCliArgs(["deploy"])).toThrow(
      "Usage: formless deploy setup [--project <path>] --worker <name> --publish-url <url> --media-bucket <bucket>",
    );
    expect(() =>
      parseFormlessCliArgs([
        "deploy",
        "setup",
        "--publish-url",
        "https://live.example",
        "--media-bucket",
        "brother-site-media",
      ]),
    ).toThrow("Missing required option for formless deploy setup: --worker.");
    expect(() =>
      parseFormlessCliArgs([
        "deploy",
        "setup",
        "--worker",
        "brother-site",
        "--media-bucket",
        "brother-site-media",
      ]),
    ).toThrow("Missing required option for formless deploy setup: --publish-url.");
    expect(() =>
      parseFormlessCliArgs([
        "deploy",
        "setup",
        "--worker",
        "brother-site",
        "--publish-url",
        "https://live.example",
      ]),
    ).toThrow("Missing required option for formless deploy setup: --media-bucket.");
    expect(() => parseFormlessCliArgs(["deploy", "setup", "--bogus"])).toThrow(
      "Unknown option for formless deploy setup: --bogus",
    );
    expect(() => parseFormlessCliArgs(["publish", "--force"])).toThrow(
      "Unknown option for formless publish: --force",
    );
  });

  it("parses deploy setup and publish commands", () => {
    expect(
      parseFormlessCliArgs([
        "deploy",
        "setup",
        "--project",
        "../site",
        "--worker",
        "brother-site",
        "--publish-url",
        "https://live.example/?draft=1",
        "--media-bucket",
        "brother-site-media",
        "--account-id",
        "account-123",
        "--admin-token",
        "admin-secret",
        "--create-bucket",
        "--skip-secret-upload",
      ]),
    ).toEqual({
      accountId: "account-123",
      adminToken: "admin-secret",
      createBucket: true,
      kind: "deploySetup",
      mediaBucket: "brother-site-media",
      projectPath: "../site",
      publishUrl: "https://live.example",
      uploadSecret: false,
      workerName: "brother-site",
    });
    expect(parseFormlessCliArgs(["publish", "--project", "../site", "--dry-run", "--yes"])).toEqual(
      {
        dryRun: true,
        kind: "publish",
        projectPath: "../site",
        yes: true,
      },
    );
  });

  it("parses archive commands", () => {
    expect(
      parseFormlessCliArgs([
        "archive",
        "export",
        "--target",
        "https://instance.example/?draft=1",
        "--out",
        "backup",
      ]),
    ).toEqual({
      kind: "archiveExport",
      outDir: "backup",
      target: "https://instance.example",
    });
    expect(
      parseFormlessCliArgs([
        "archive",
        "export-app",
        "--install",
        "personal",
        "--target",
        "https://instance.example",
        "--out",
        "personal-backup",
      ]),
    ).toEqual({
      installId: "personal",
      kind: "archiveExportApp",
      outDir: "personal-backup",
      target: "https://instance.example",
    });
    expect(
      parseFormlessCliArgs([
        "archive",
        "restore-app",
        "--target",
        "https://instance.example",
        "--archive",
        "personal-backup",
        "--install",
        "copy",
        "--apply",
        "--replace",
        "--admin-token",
        "secret",
      ]),
    ).toEqual({
      adminToken: "secret",
      apply: true,
      archiveDir: "personal-backup",
      installId: "copy",
      kind: "archiveRestoreApp",
      replace: true,
      target: "https://instance.example",
    });
    expect(
      parseFormlessCliArgs([
        "archive",
        "import-site",
        "--project",
        "../site",
        "--install",
        "personal",
        "--label",
        "Personal Site",
        "--out",
        "personal-archive",
      ]),
    ).toEqual({
      installId: "personal",
      kind: "archiveImportSite",
      label: "Personal Site",
      outDir: "personal-archive",
      projectPath: "../site",
    });
    expect(() => parseFormlessCliArgs(["archive", "export"])).toThrow(
      "Missing required option for formless archive export: --target.",
    );
    expect(() =>
      parseFormlessCliArgs(["archive", "restore", "--target", "https://instance.example"]),
    ).toThrow("Missing required option for formless archive restore: --archive.");
  });

  it("parses instance workspace command skeletons", async () => {
    const logs: string[] = [];

    expect(
      parseFormlessCliArgs([
        "instance",
        "init-workspace",
        "--workspace",
        "../personal",
        "--name",
        "personal-sites",
        "--target-url",
        "https://formless.example.workers.dev/setup?token=ignored",
        "--target",
        "remote",
        "--from-remote",
      ]),
    ).toEqual({
      fromArchive: null,
      fromRemote: true,
      kind: "instanceInitWorkspace",
      name: "personal-sites",
      targetAlias: "remote",
      targetUrl: "https://formless.example.workers.dev",
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs(["instance", "init-workspace", "--from-archive", "archives"]),
    ).toEqual({
      fromArchive: "archives",
      fromRemote: false,
      kind: "instanceInitWorkspace",
      name: null,
      targetAlias: "remote",
      targetUrl: null,
      workspacePath: ".",
    });
    expect(parseFormlessCliArgs(["instance", "status", "--target", "local"])).toEqual({
      kind: "instanceStatus",
      targetAlias: "local",
      workspacePath: ".",
    });
    expect(parseFormlessCliArgs(["instance", "pull", "--workspace", "../personal"])).toEqual({
      kind: "instancePull",
      targetAlias: null,
      workspacePath: "../personal",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
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
      kind: "instancePush",
      replace: true,
      replaceInstallSet: true,
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(parseFormlessCliArgs(["instance", "dev", "--workspace", "../personal"])).toEqual({
      kind: "instanceDev",
      workspacePath: "../personal",
    });
    expect(parseFormlessCliArgs(["instance", "reset-local"])).toEqual({
      kind: "instanceResetLocal",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "deploy",
        "--target",
        "remote",
        "--migration-policy",
        "existing",
      ]),
    ).toEqual({
      kind: "instanceDeploy",
      migrationPolicy: "existing",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "token",
        "adopt",
        "--target",
        "remote",
        "--admin-token",
        "secret",
      ]),
    ).toEqual({
      adminToken: "secret",
      kind: "instanceTokenAdopt",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(parseFormlessCliArgs(["instance", "token", "rotate"])).toEqual({
      adminToken: null,
      kind: "instanceTokenRotate",
      targetAlias: null,
      workspacePath: ".",
    });

    expect(logs).toEqual([]);
  });

  it("validates instance workspace command options", () => {
    expect(() => parseFormlessCliArgs(["instance"])).toThrow(
      "Usage: formless instance <init-workspace|status|pull|check|push|dev|reset-local|deploy|token>",
    );
    expect(() => parseFormlessCliArgs(["instance", "init-workspace", "--from-remote"])).toThrow(
      "Missing required option for formless instance init-workspace: --target-url.",
    );
    expect(() =>
      parseFormlessCliArgs([
        "instance",
        "init-workspace",
        "--target-url",
        "https://formless.example.workers.dev",
        "--from-remote",
        "--from-archive",
        "archives",
      ]),
    ).toThrow("formless instance init-workspace cannot combine --from-remote and --from-archive.");
    expect(() => parseFormlessCliArgs(["instance", "status", "--target", "Remote"])).toThrow(
      "Formless instance workspace target alias must start with a lowercase letter",
    );
    expect(() =>
      parseFormlessCliArgs(["instance", "deploy", "--migration-policy", "auto"]),
    ).toThrow('formless instance deploy --migration-policy must be "new" or "existing".');
    expect(() => parseFormlessCliArgs(["instance", "token", "forget"])).toThrow(
      "Usage: formless instance token <adopt|rotate>",
    );
  });

  it("initializes an instance workspace from remote target status", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];

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
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek"), installedSite("james", "James Peek")],
    });

    await runFormlessCli(
      [
        "instance",
        "init-workspace",
        "--workspace",
        workspaceRoot,
        "--name",
        "personal-sites",
        "--target-url",
        "https://personal.dpeek.workers.dev/setup?token=ignored",
        "--target",
        "prod",
        "--from-remote",
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
      }),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(manifest).toEqual({
      version: 1,
      kind: "formless-instance-workspace",
      name: "personal-sites",
      defaultTarget: "prod",
      targets: [{ alias: "prod", url: "https://personal.dpeek.workers.dev" }],
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
          installId: "david",
          packageAppKey: "site",
          label: "David Peek",
          archivePath: "archives/apps/david",
          routes: {
            admin: "/apps/david",
            schema: "/apps/david/schema",
            public: "/sites/david",
          },
        },
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
      ],
      deploy: {
        workerName: "personal",
        workersDevUrl: "https://personal.dpeek.workers.dev",
        migrationPolicy: "existing",
      },
    });
    await expect(readFile(path.join(workspaceRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
    ]);
    expect(logs).toEqual([
      [
        "Instance workspace initialized.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        `Manifest: ${path.relative(tempDir, path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE))}.`,
        `Secret state: ${path.relative(tempDir, path.join(workspaceRoot, ".formless/instance.env"))}.`,
        "Targets: prod=https://personal.dpeek.workers.dev.",
        "Default app policy: declared-installs.",
        "Local apps: david (site), james (site).",
        `Deploy metadata: ${packageJson.version}.`,
        "Owner setup: complete (David Peek <david@example.com>).",
        "Remote apps: david (site: David Peek), james (site: James Peek).",
      ].join("\n"),
    ]);
  });

  it("initializes a fresh instance workspace from a local instance archive", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const archiveRoot = path.join(workspaceRoot, "archives/instance");
    const logs: string[] = [];

    await mkdir(archiveRoot, { recursive: true });
    await writeFile(
      path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
      JSON.stringify(instanceArchive([appArchive("david", "David Peek")]), null, 2),
    );

    await runFormlessCli(
      [
        "instance",
        "init-workspace",
        "--workspace",
        workspaceRoot,
        "--name",
        "personal-sites",
        "--from-archive",
        archiveRoot,
      ],
      cliDeps(tempDir, { logs }),
    );

    const manifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(manifest).toMatchObject({
      name: "personal-sites",
      targets: [],
      archives: {
        instance: "archives/instance",
        apps: "archives/apps",
      },
      defaultAppPolicy: "declared-installs",
      apps: [
        {
          installId: "david",
          packageAppKey: "site",
          label: "David Peek",
          archivePath: "archives/apps/david",
          routes: {
            admin: "/apps/david",
            schema: "/apps/david/schema",
            public: "/sites/david",
          },
        },
      ],
    });
    expect(logs.at(-1)).toContain("Archive source: archives/instance.");
  });

  it("reports instance workspace status from manifest, secret state, and target reads", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];

    await mkdir(workspaceRoot, { recursive: true });
    await writeFile(
      path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
      formatFormlessInstanceWorkspaceManifest({
        version: 1,
        kind: "formless-instance-workspace",
        name: "personal-sites",
        defaultTarget: "remote",
        targets: [{ alias: "remote", url: "https://personal.dpeek.workers.dev" }],
        archives: { instance: "archives/instance", apps: "archives/apps" },
        local: { stateRoot: ".formless/local" },
        defaultAppPolicy: "declared-installs",
        apps: [
          {
            installId: "david",
            packageAppKey: "site",
            label: "David Peek",
            archivePath: "archives/apps/david",
          },
        ],
        deploy: { workerName: "personal", migrationPolicy: "existing" },
      }),
    );
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=secret\n",
    );

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({ setupComplete: false });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });

    await runFormlessCli(
      ["instance", "status", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: responses.fetcher(requests), logs }),
    );

    expect(logs).toEqual([
      [
        "Instance workspace status.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        `Manifest: ${path.relative(tempDir, path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE))}.`,
        "Targets: remote=https://personal.dpeek.workers.dev.",
        "Default target: remote.",
        "Selected target: remote (https://personal.dpeek.workers.dev).",
        "Automation token: stored.",
        "Default app policy: declared-installs.",
        "Local apps: david (site).",
        `Deploy metadata: ${packageJson.version}.`,
        "Owner setup: incomplete.",
        "Remote apps: david (site: David Peek).",
      ].join("\n"),
    ]);
  });

  it("pulls instance workspace archives into deterministic local layout", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const installs = [installedSite("david", "David Peek"), installedSite("james", "James Peek")];
    const fetcher = archiveFetch(requests, installs, {
      david: { mediaBytes: Buffer.from([4, 5, 6]), records: mediaRecords() },
      james: { records: [] },
    });

    await writeWorkspaceManifest(workspaceRoot, {
      apps: [workspaceApp("david", "David Peek"), workspaceApp("james", "James Peek")],
    });

    await runFormlessCli(
      ["instance", "pull", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    const instanceArchivePath = path.join(
      workspaceRoot,
      "archives/instance",
      PORTABLE_ARCHIVE_MANIFEST_FILE,
    );
    const pulledInstance = parsePortableArchive(
      JSON.parse(await readFile(instanceArchivePath, "utf8")) as unknown,
    );

    if (pulledInstance.kind !== INSTANCE_ARCHIVE_KIND) {
      throw new Error("Expected instance archive.");
    }

    expect(pulledInstance.apps.map((app) => app.app.installId)).toEqual(["david", "james"]);
    await expect(
      readFile(path.join(workspaceRoot, "archives/apps/david/media/david/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    await expect(
      readFile(
        path.join(workspaceRoot, "archives/apps/james", PORTABLE_ARCHIVE_MANIFEST_FILE),
        "utf8",
      ),
    ).resolves.toContain('"installId": "james"');
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/david/snapshot",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/james/snapshot",
      "GET https://personal.dpeek.workers.dev/api/formless/media/media/images/cover.png",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/david/snapshot",
      "GET https://personal.dpeek.workers.dev/api/formless/media/media/images/cover.png",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/james/snapshot",
    ]);
    expect(logs).toEqual([
      [
        "Instance workspace pulled.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        `Instance archive: ${path.relative(tempDir, instanceArchivePath)}.`,
        "Apps: 2.",
        `Records: ${mediaRecords().length}.`,
        "Media files: 1.",
        `App archives: david (${mediaRecords().length} records, 1 media), james (0 records, 0 media).`,
      ].join("\n"),
    ]);
  });

  it("checks workspace archives without treating generated export timestamps as drift", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localApp = appArchive("david", "David Peek");
    const fetcher = archiveFetch(requests, [installedSite("david", "David Peek")], {
      david: { records: [] },
    });

    await writeWorkspaceManifest(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localApp]),
    );
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localApp);

    await runFormlessCli(
      ["instance", "check", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    expect(logs).toEqual([
      [
        "Instance workspace check.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Drift: none.",
        "Local apps: 1. Remote apps: 1.",
        "Local records: 0. Remote records: 0.",
        "Local media files: 0. Remote media files: 0.",
        "Missing remote installs: none.",
        "Extra remote installs: none.",
        "Package mismatches: none.",
        "Changed records: none.",
        "Changed media: none.",
        "Changed archive paths: none.",
      ].join("\n"),
    ]);
  });

  it("reports workspace archive drift by install set, package, records, and media", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = appArchive("david", "David Peek", {
      mediaBytes: Buffer.from([1]),
      records: mediaRecords(),
    });
    const localDom = appArchive("dom", "Dom");
    const localJames = appArchive("james", "James");
    const remoteInstalls = [
      installedSite("david", "David Peek"),
      installedApp("james", "James", "tasks"),
      installedSite("extra", "Extra"),
    ];
    const fetcher = archiveFetch(requests, remoteInstalls, {
      david: { mediaBytes: Buffer.from([2]), records: publishRecords() },
      extra: { records: [] },
      james: { records: [] },
    });

    await writeWorkspaceManifest(workspaceRoot, {
      apps: [
        workspaceApp("david", "David Peek"),
        workspaceApp("dom", "Dom"),
        workspaceApp("james", "James"),
      ],
    });
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid, localDom, localJames]),
      {
        david: Buffer.from([1]),
      },
    );
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid, {
      david: Buffer.from([1]),
    });
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/dom"), localDom);
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/james"), localJames);

    await runFormlessCli(
      ["instance", "check", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    expect(logs).toEqual([
      [
        "Instance workspace check.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Drift: detected.",
        "Local apps: 3. Remote apps: 3.",
        `Local records: ${mediaRecords().length}. Remote records: ${publishRecords().length}.`,
        "Local media files: 1. Remote media files: 1.",
        "Missing remote installs: dom.",
        "Extra remote installs: extra.",
        "Package mismatches: james (local site, remote tasks).",
        "Changed records: david.",
        "Changed media: david.",
        "Changed archive paths: archives/apps/david, archives/apps/dom, archives/apps/james, archives/instance.",
      ].join("\n"),
    ]);
  });

  it("pushes workspace app archives as a dry-run by default", async () => {
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
    );

    await writeWorkspaceManifest(workspaceRoot);
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid, {
      david: Buffer.from([4, 5, 6]),
    });
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["instance", "push", "--workspace", workspaceRoot],
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
      "app-store-snapshots",
      "app-scoped-media",
      "core-media-assets",
    ]);
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.split("\n")).toEqual([
      "Instance workspace push dry run.",
      `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
      "Target: remote (https://personal.dpeek.workers.dev).",
      "Source: declared workspace app archives.",
      "Source apps: 1.",
      `Source records: ${mediaRecords().length}.`,
      "Source media files: 1.",
      "Replace existing installs: no.",
      "Replace install set: no.",
      "Backup: none.",
      "Drift: detected.",
      "Missing remote installs: none.",
      "Extra remote installs: extra.",
      "Changed records: david.",
      "Changed media: david.",
      "Dry-run restore: failed.",
      'Dry-run error: Installed app "david" already exists.',
    ]);
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
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid);

    await runFormlessCli(
      ["instance", "push", "--workspace", workspaceRoot, "--apply", "--replace"],
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
    expect(logs[0]?.split("\n")).toEqual([
      "Instance workspace push applied.",
      `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
      "Target: remote (https://personal.dpeek.workers.dev).",
      "Source: declared workspace app archives.",
      "Source apps: 1.",
      "Source records: 0.",
      "Source media files: 0.",
      "Replace existing installs: yes.",
      "Replace install set: no.",
      `Backup: ${path.relative(
        tempDir,
        path.join(workspaceRoot, ".formless/backups/push-2026-05-12T02-00-00-000Z/archive.json"),
      )}.`,
      "Drift: none.",
      "Missing remote installs: none.",
      "Extra remote installs: none.",
      "Changed records: none.",
      "Changed media: none.",
      "Dry-run restore: ok.",
      "Dry-run created installs: none.",
      "Dry-run replaced installs: david.",
      "Apply restore: ok.",
      "Apply created installs: none.",
      "Apply replaced installs: david.",
    ]);
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
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid);

    await expect(
      runFormlessCli(
        ["instance", "push", "--workspace", workspaceRoot, "--apply", "--replace"],
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
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid]),
    );
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid);

    await expect(
      runFormlessCli(
        [
          "instance",
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

    await expect(
      runFormlessCli(
        ["instance", "token", "adopt", "--workspace", workspaceRoot],
        cliDeps(tempDir),
      ),
    ).rejects.toThrow(
      "Cloudflare Worker secrets cannot be read back; pass --admin-token or set FORMLESS_ADMIN_TOKEN.",
    );

    await runFormlessCli(
      ["instance", "token", "adopt", "--workspace", workspaceRoot, "--admin-token", "local-secret"],
      cliDeps(tempDir, { logs }),
    );

    await expect(
      readFile(path.join(workspaceRoot, ".formless/instance.env"), "utf8"),
    ).resolves.toBe("FORMLESS_ADMIN_TOKEN=local-secret\n");

    await runFormlessCli(
      ["instance", "token", "rotate", "--workspace", workspaceRoot],
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

  it("runs instance workspace dev with product profile, isolated persistence, and first-run archive restore", async () => {
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
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid, {
      david: Buffer.from([4, 5, 6]),
    });

    const run = runFormlessCli(
      ["instance", "dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: {
          FORMLESS_ADMIN_TOKEN: "remote-token",
          FORMLESS_SITE_PROJECT_ROOT: "/old-site",
          KEEP: "value",
          PORT: "4444",
          VITE_FORMLESS_SITE_PROJECT_ID: "old-site-id",
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

          return child as unknown as ReturnType<typeof spawn>;
        }) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace archive restored: app archives")),
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
      FORMLESS_LAUNCH_FIXTURE: "empty",
      FORMLESS_RUNTIME_PROFILE: "instance",
      FORMLESS_WRANGLER_PERSIST: path.join(workspaceRoot, ".formless/local/wrangler"),
      KEEP: "value",
      PORT: "4444",
      VITE_FORMLESS_RUNTIME_PROFILE: "instance",
    });
    expect(spawnCalls[0]?.env).not.toHaveProperty("FORMLESS_ADMIN_TOKEN");
    expect(spawnCalls[0]?.env).not.toHaveProperty("FORMLESS_SITE_PROJECT_ROOT");
    expect(spawnCalls[0]?.env).not.toHaveProperty("VITE_FORMLESS_SITE_PROJECT_ID");
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4444/api/formless/app-installs",
      "GET http://localhost:4444/api/formless/app-installs",
      "POST http://localhost:4444/api/formless/archive/restore",
    ]);

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{
      archive: InstanceArchive;
      mediaFiles: { bytesBase64: string }[];
    }>(restoreRequest);

    expect(restoreRequest?.headers.authorization).toBeUndefined();
    expect(restoreBody.archive.restorePolicy).toEqual({
      dryRun: false,
      installCollisions: "reject",
    });
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(logs).toEqual([
      "Instance shell: http://localhost:4444/",
      `Local state: ${path.relative(tempDir, path.join(workspaceRoot, ".formless/local"))}.`,
      `Workspace archive restored: app archives (1 apps, ${mediaRecords().length} records, 1 media).`,
    ]);
    expect(child.killed).toBe(false);
  });

  it("keeps existing workspace-local installs on instance dev rerun", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const child = new FakeCliDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];

    await writeWorkspaceManifest(workspaceRoot);

    const run = runFormlessCli(
      ["instance", "dev", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        env: { PORT: "4445" },
        fetch: localInstanceDevFetch(requests, [installedSite("david", "David Peek")]),
        logs,
        spawn: (() => child as unknown as ReturnType<typeof spawn>) as typeof spawn,
      }),
    );

    await waitUntil(() =>
      logs.some((line) => line.startsWith("Workspace archive restore skipped")),
    );
    child.close(0);
    await run;

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4445/api/formless/app-installs",
      "GET http://localhost:4445/api/formless/app-installs",
    ]);
    expect(logs.at(-1)).toBe(
      "Workspace archive restore skipped: local installs already exist (david).",
    );
  });

  it("resets only instance workspace local state", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/apps/david"),
      appArchive("david", "David Peek"),
    );
    await mkdir(path.join(workspaceRoot, ".formless/local/wrangler"), { recursive: true });
    await mkdir(path.join(workspaceRoot, ".formless/backups"), { recursive: true });
    await writeFile(path.join(workspaceRoot, ".formless/local/wrangler/state.txt"), "state");
    await writeFile(path.join(workspaceRoot, ".formless/backups/keep.txt"), "backup");
    await writeFile(path.join(workspaceRoot, ".formless/instance.env"), "FORMLESS_ADMIN_TOKEN=x\n");

    await runFormlessCli(
      ["instance", "reset-local", "--workspace", workspaceRoot],
      cliDeps(tempDir, { logs }),
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
      readFile(
        path.join(workspaceRoot, "archives/apps/david", PORTABLE_ARCHIVE_MANIFEST_FILE),
        "utf8",
      ),
    ).resolves.toContain('"installId": "david"');
    expect(logs).toEqual([
      [
        "Instance workspace local state reset.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        `Manifest: ${path.relative(
          tempDir,
          path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE),
        )}.`,
        `Local state: ${path.relative(tempDir, path.join(workspaceRoot, ".formless/local"))}.`,
        "Next dev run will rebuild local runtime state from workspace archives.",
      ].join("\n"),
    ]);
  });

  it("deploys a claimed instance workspace with instance runtime vars and existing migration policy", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const healthInputs: CheckFormlessInstanceDeployMetadataInput[] = [];
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot);
    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await runFormlessCli(
      ["instance", "deploy", "--workspace", workspaceRoot],
      cliDeps(tempDir, {
        deploy: async (input) => {
          deployInputs.push(input);
          return { url: input.plan.expectedUrl.url };
        },
        healthInputs,
        logs,
        packageRoot: "/package",
      }),
    );

    expect(deployInputs).toHaveLength(1);
    expect(deployInputs[0]).toMatchObject({
      credentialProfile: null,
      packageRoot: "/package",
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        FORMLESS_ADMIN_TOKEN: "local-token",
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
      migrationPolicy: "existing",
      packageVersion: packageJson.version,
      resources: {
        mediaBucket: {
          name: "personal-media",
        },
        worker: {
          name: "personal",
        },
      },
      runtimeVars: {
        FORMLESS_DEPLOY_VERSION: packageJson.version,
        FORMLESS_RUNTIME_PROFILE: "instance",
        VITE_FORMLESS_RUNTIME_PROFILE: "instance",
      },
    });
    expect(healthInputs).toEqual([
      {
        expectedVersion: packageJson.version,
        url: "https://personal.dpeek.workers.dev",
      },
    ]);
    expect(logs).toEqual([
      [
        "Instance workspace deployed.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Worker: personal.",
        "Media bucket: personal-media.",
        "Migration policy: existing.",
        "Runtime profile: server instance, client instance.",
        `Deploy metadata: version ${packageJson.version} verified.`,
        `Deployment state: ${path.relative(
          tempDir,
          path.join(workspaceRoot, ".formless/deploy/personal"),
        )}.`,
        `Local deploy secrets: ${path.relative(
          tempDir,
          path.join(workspaceRoot, ".formless/deploy/personal/deploy.env"),
        )}.`,
        `Automation secret state: ${path.relative(
          tempDir,
          path.join(workspaceRoot, ".formless/instance.env"),
        )}.`,
      ].join("\n"),
    ]);
  });

  it("guards instance workspace deploy against missing secrets and target identity changes", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot);

    await expect(
      runFormlessCli(["instance", "deploy", "--workspace", workspaceRoot], cliDeps(tempDir)),
    ).rejects.toThrow("Formless instance deploy requires an admin token.");

    await mkdir(path.join(workspaceRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(workspaceRoot, ".formless/instance.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    await expect(
      runFormlessCli(
        ["instance", "deploy", "--workspace", workspaceRoot],
        cliDeps(tempDir, {
          deploy: async () => ({ url: "https://wrong.dpeek.workers.dev" }),
        }),
      ),
    ).rejects.toThrow(
      "Formless instance deploy returned https://wrong.dpeek.workers.dev, expected claimed target https://personal.dpeek.workers.dev.",
    );
  });

  it("initializes a Site project with config, deterministic records, and no starter media", async () => {
    const tempDir = await makeTempDir();
    const result = await initSiteProject(
      { targetDir: "my-site" },
      { cwd: tempDir, packageRoot: process.cwd() },
    );
    const config = parseSiteProjectConfigJson(await readFile(result.configPath, "utf8"));
    const records = parseSiteProjectRecordsJson(await readFile(result.recordsPath, "utf8"));
    const mediaAssets = siteProjectMediaAssetsFromRecords(records, { mediaRoot: config.mediaRoot });

    expect(config).toEqual(defaultSiteProjectConfig());
    expect(records.length).toBeGreaterThan(0);
    expect(result.recordCount).toBe(records.length);
    expect(mediaAssets).toEqual([]);
    expect(result.mediaCount).toBe(0);
    await expect(stat(path.join(result.projectRoot, config.mediaRoot))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await expect(
      initSiteProject({ targetDir: "my-site" }, { cwd: tempDir, packageRoot: process.cwd() }),
    ).rejects.toThrow("target already contains");
  });

  it("runs onboard through deploy, health check, and optional browser open", async () => {
    const logs: string[] = [];
    const commands: CapturedCommand[] = [];
    const deployInputs: DeployFormlessInstanceInput[] = [];
    const healthInputs: CheckFormlessInstanceDeployMetadataInput[] = [];
    const openedUrls: string[] = [];
    const setupInputs: CreateFormlessInstanceOwnerSetupCapabilityInput[] = [];
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const setupUrl = `https://brother-instance.dpeek.workers.dev/setup?token=${setupToken}`;
    const dependencies = cliDeps(process.cwd(), {
      commands,
      healthInputs,
      logs,
      openedUrls,
      setupInputs,
      stateWrites,
      deploy: async (input) => {
        deployInputs.push(input);
        return { url: input.plan.expectedUrl.url };
      },
    });

    await expect(
      onboardFormlessInstance(
        {
          credentialProfile: "personal",
          instanceName: "brother-instance",
          open: true,
        },
        dependencies,
      ),
    ).resolves.toMatchObject({
      browserOpened: true,
      credentialProfile: "personal",
      deployment: {
        url: "https://brother-instance.dpeek.workers.dev",
      },
      instanceName: "brother-instance",
      mode: "deployed",
      open: true,
      ownerSetup: {
        url: setupUrl,
      },
    });

    await runFormlessCli(
      ["onboard", "--name", "brother-instance", "--credential-profile", "personal", "--open"],
      dependencies,
    );

    expect(commands).toEqual([]);
    expect(deployInputs).toHaveLength(2);
    expect(deployInputs[0]).toMatchObject({
      credentialProfile: "personal",
      packageRoot: process.cwd(),
      secrets: {
        ALCHEMY_PASSWORD: "alchemy-password",
        FORMLESS_ADMIN_TOKEN: "generated-token",
      },
    });
    expect(healthInputs).toEqual([
      {
        expectedVersion: packageJson.version,
        url: "https://brother-instance.dpeek.workers.dev",
      },
      {
        expectedVersion: packageJson.version,
        url: "https://brother-instance.dpeek.workers.dev",
      },
    ]);
    expect(setupInputs).toEqual([
      {
        adminToken: "generated-token",
        deploymentUrl: "https://brother-instance.dpeek.workers.dev",
        setupToken,
      },
      {
        adminToken: "generated-token",
        deploymentUrl: "https://brother-instance.dpeek.workers.dev",
        setupToken,
      },
    ]);
    expect(openedUrls).toEqual([setupUrl, setupUrl]);
    expect(stateWrites).toHaveLength(2);
    expect(stateWrites.map((write) => write.root)).toEqual([
      path.join(process.cwd(), ".formless/instances/brother-instance"),
      path.join(process.cwd(), ".formless/instances/brother-instance"),
    ]);
    expect(stateWrites[0]?.state).toMatchObject({
      accountId: "account-123",
      credentialProfile: "personal",
      deploymentTarget: "workers.dev",
      instanceName: "brother-instance",
      workersDevUrl: "https://brother-instance.dpeek.workers.dev",
    });
    expect(JSON.stringify(stateWrites)).not.toContain("generated-token");
    expect(JSON.stringify(stateWrites)).not.toContain(setupToken);
    expect(logs).toEqual([
      [
        "Formless instance deployed.",
        "Instance: brother-instance.",
        "Account: Personal (account-123).",
        "Credential profile: personal.",
        "URL: https://brother-instance.dpeek.workers.dev.",
        "Worker: brother-instance.",
        "Media bucket: brother-instance-media.",
        "Authority storage: brother-instance-authority.",
        `Deploy metadata: version ${packageJson.version} verified.`,
        "State: .formless/instances/brother-instance/formless.instance.json.",
        "Local secrets: .formless/instances/brother-instance/deploy.env.",
        "Browser opened: yes.",
        "Owner setup: opened in browser.",
        "Complete owner setup to create the browser write session; automation remains protected by FORMLESS_ADMIN_TOKEN.",
      ].join("\n"),
    ]);
  });

  it("prints the owner setup URL when onboard does not open a browser", async () => {
    const logs: string[] = [];
    const openedUrls: string[] = [];
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const dependencies = cliDeps(process.cwd(), {
      logs,
      openedUrls,
      stateWrites,
    });
    const setupUrl = `https://brother-instance.dpeek.workers.dev/setup?token=${setupToken}`;

    await runFormlessCli(["onboard", "--name", "brother-instance", "--no-open"], dependencies);

    expect(openedUrls).toEqual([]);
    expect(JSON.stringify(stateWrites)).not.toContain(setupToken);
    expect(logs).toEqual([
      [
        "Formless instance deployed.",
        "Instance: brother-instance.",
        "Account: Personal (account-123).",
        "Credential profile: <default>.",
        "URL: https://brother-instance.dpeek.workers.dev.",
        "Worker: brother-instance.",
        "Media bucket: brother-instance-media.",
        "Authority storage: brother-instance-authority.",
        `Deploy metadata: version ${packageJson.version} verified.`,
        "State: .formless/instances/brother-instance/formless.instance.json.",
        "Local secrets: .formless/instances/brother-instance/deploy.env.",
        "Browser opened: no.",
        `Owner setup URL: ${setupUrl}.`,
        "Complete owner setup to create the browser write session; automation remains protected by FORMLESS_ADMIN_TOKEN.",
      ].join("\n"),
    ]);
  });

  it("stores global instance onboarding state outside the current directory", async () => {
    const cwd = "/tmp/empty-formless-project";
    const logs: string[] = [];
    const stateRoot = "/home/user/.formless";
    const stateWrites: WriteFormlessInstanceStateInput[] = [];
    const dependencies = cliDeps(cwd, {
      logs,
      stateRoot,
      stateWrites,
    });

    await runFormlessCli(["onboard", "--name", "brother-instance", "--no-open"], dependencies);

    expect(stateWrites.map((write) => write.root)).toEqual([
      "/home/user/.formless/instances/brother-instance",
    ]);
    expect(logs[0]).toContain(
      "State: /home/user/.formless/instances/brother-instance/formless.instance.json.",
    );
    expect(logs[0]).toContain(
      "Local secrets: /home/user/.formless/instances/brother-instance/deploy.env.",
    );
  });

  it("saves local authority snapshots into project records and media", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const sourceRecords = mediaRecords();
    const nextSnapshot = snapshot(sourceRecords);
    const fetcher = fakeSaveFetch(nextSnapshot, new Uint8Array([1, 2, 3]));

    await writeFileTree(projectRoot, sourceRecords.slice(0, 1));

    const result = await saveSiteProject(
      { projectPath: projectRoot, source: "https://local.test" },
      { cwd: tempDir, fetch: fetcher },
    );

    expect(result).toMatchObject({
      mediaCount: 1,
      mode: "write",
      recordCount: sourceRecords.length,
      source: "https://local.test",
    });
    await expect(readFile(path.join(projectRoot, "site.records.json"), "utf8")).resolves.toBe(
      formatSiteProjectRecords(sourceRecords),
    );
    await expect(readFile(path.join(projectRoot, "media/media/images/cover.png"))).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );

    await expect(
      saveSiteProject(
        { check: true, projectPath: projectRoot, source: "https://local.test" },
        { cwd: tempDir, fetch: fetcher },
      ),
    ).resolves.toMatchObject({ mode: "check" });

    await writeFile(path.join(projectRoot, "media/media/images/cover.png"), Buffer.from([9]));
    await expect(
      saveSiteProject(
        { check: true, projectPath: projectRoot, source: "https://local.test" },
        { cwd: tempDir, fetch: fetcher },
      ),
    ).rejects.toThrow("Site project source is stale: media/media/images/cover.png.");
  });

  it("exports app archives and restores them through the archive API", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "personal-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const sourceRecords = mediaRecords();

    responses.queueJson({
      packages: listBundledAppPackages(),
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
    responses.queueJson(snapshot(sourceRecords));
    responses.queueBinary(Buffer.from([4, 5, 6]), "image/png");

    await runFormlessCli(
      [
        "archive",
        "export-app",
        "--target",
        "https://instance.example",
        "--install",
        "personal",
        "--out",
        outDir,
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
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

    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal-copy"],
          mediaCountsByApp: { "personal-copy": 1 },
          recordCountsByApp: { "personal-copy": { total: sourceRecords.length } },
          replacedInstalls: [],
        },
      },
    });

    await runFormlessCli(
      [
        "archive",
        "restore-app",
        "--target",
        "https://instance.example",
        "--archive",
        outDir,
        "--install",
        "personal-copy",
        "--apply",
        "--admin-token",
        "secret",
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
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
    expect(logs.at(-1)).toContain("App archive restore for personal-copy applied ok.");
  });

  it("exports installed Tasks app archives without media requests", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "tasks-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];

    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [
        {
          adminRoute: "/apps/work",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "work",
          label: "Work Tasks",
          packageAppKey: "tasks",
          schemaRoute: "/apps/work/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(taskSnapshot(taskSeedRecords));

    await runFormlessCli(
      [
        "archive",
        "export-app",
        "--target",
        "https://instance.example",
        "--install",
        "work",
        "--out",
        outDir,
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
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
      sourceSchemaKey: "tasks",
    });
    expect(archive.data).toEqual({
      kind: "storeSnapshot",
      snapshot: taskSnapshot(taskSeedRecords),
    });
    expect(archive.media.objects).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/app-installs/tasks/work/snapshot",
    ]);
    expect(logs.at(-1)).toContain("App archive exported for work.");
  });

  it("exports and restores mixed instance archives without non-Site media requests", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const sourceRecords = mediaRecords();

    responses.queueJson({
      packages: listBundledAppPackages(),
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
        {
          adminRoute: "/apps/work",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "work",
          label: "Work Tasks",
          packageAppKey: "tasks",
          schemaRoute: "/apps/work/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
        {
          adminRoute: "/apps/rates",
          createdAt: "2026-05-01T00:00:00.000Z",
          installId: "rates",
          label: "Rates",
          packageAppKey: "estii",
          schemaRoute: "/apps/rates/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson(snapshot(sourceRecords));
    responses.queueJson(taskSnapshot(taskSeedRecords));
    responses.queueJson(rateSnapshot(rateSeedRecords));
    responses.queueBinary(Buffer.from([4, 5, 6]), "image/png");

    await runFormlessCli(
      ["archive", "export", "--target", "https://instance.example", "--out", outDir],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
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
    const rates = archive.apps.find((app) => app.app.installId === "rates");
    const work = archive.apps.find((app) => app.app.installId === "work");

    expect(archive.apps.map((app) => [app.app.installId, app.app.packageAppKey])).toEqual([
      ["personal", "site"],
      ["rates", "estii"],
      ["work", "tasks"],
    ]);
    expect(personal?.media.objects).toEqual([
      expect.objectContaining({
        archivePath: "media/personal/media/images/cover.png",
        storageKey: "media/images/cover.png",
      }),
    ]);
    expect(rates?.media.objects).toEqual([]);
    expect(work?.media.objects).toEqual([]);
    await expect(
      readFile(path.join(outDir, "media/personal/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([4, 5, 6]));
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://instance.example/api/formless/app-installs",
      "GET https://instance.example/api/app-installs/site/personal/snapshot",
      "GET https://instance.example/api/app-installs/tasks/work/snapshot",
      "GET https://instance.example/api/app-installs/estii/rates/snapshot",
      "GET https://instance.example/api/formless/media/media/images/cover.png",
    ]);
    expect(logs.at(-1)).toContain("Instance archive exported.");

    responses.queueJson({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "rates", "work"],
          mediaCountsByApp: { personal: 1, rates: 0, work: 0 },
          recordCountsByApp: {
            personal: { total: sourceRecords.length },
            rates: { total: rateSeedRecords.length },
            work: { total: taskSeedRecords.length },
          },
          replacedInstalls: [],
        },
      },
    });

    await runFormlessCli(
      [
        "archive",
        "restore",
        "--target",
        "https://instance.example",
        "--archive",
        outDir,
        "--apply",
        "--admin-token",
        "secret",
      ],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
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
      restoreBody.archive.apps.find((app) => app.app.installId === "rates")?.media.objects,
    ).toEqual([]);
    expect(
      restoreBody.archive.apps.find((app) => app.app.installId === "work")?.media.objects,
    ).toEqual([]);
    expect(restoreBody.mediaFiles).toHaveLength(1);
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(logs.at(-1)).toContain("Archive restore applied ok.");
  });

  it("imports a standalone Site project into an app archive directory", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const outDir = path.join(tempDir, "site-archive");
    const logs: string[] = [];

    await writeFileTree(projectRoot, mediaRecords());
    await mkdir(path.join(projectRoot, "media/media/images"), { recursive: true });
    await writeFile(path.join(projectRoot, "media/media/images/cover.png"), Buffer.from([7, 8]));

    await runFormlessCli(
      [
        "archive",
        "import-site",
        "--project",
        projectRoot,
        "--install",
        "personal",
        "--out",
        outDir,
      ],
      cliDeps(tempDir, { logs }),
    );

    const archive = parsePortableArchive(
      JSON.parse(
        await readFile(path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE), "utf8"),
      ) as unknown,
    );

    if (archive.kind !== APP_ARCHIVE_KIND) {
      throw new Error("Expected app archive.");
    }

    expect(archive.app.installId).toBe("personal");
    expect(archive.data.kind).toBe("sourceRecords");
    expect(archive.media.objects[0]).toMatchObject({
      archivePath: "media/personal/media/images/cover.png",
      deliveryHref: "/api/formless/media/media/images/cover.png",
      storageKey: "media/images/cover.png",
    });
    await expect(
      readFile(path.join(outDir, "media/personal/media/images/cover.png")),
    ).resolves.toEqual(Buffer.from([7, 8]));
    expect(logs).toEqual([
      [
        "Site project archive written for personal.",
        `Archive: ${path.relative(tempDir, path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE))}.`,
        `Records: ${mediaRecords().length}.`,
        "Media files: 1.",
        "Rewritten media hrefs: 0.",
      ].join("\n"),
    ]);
  });

  it("sets up project deploy config, ignored local secret env, and optional Wrangler calls", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const commands: CapturedCommand[] = [];

    await writeFileTree(projectRoot, mediaRecords());
    await writeFile(path.join(projectRoot, ".gitignore"), "dist\n");

    const result = await setupSiteProjectDeploy(
      {
        accountId: "account-123",
        adminToken: "admin-secret",
        createBucket: true,
        mediaBucket: "brother-site-media",
        projectPath: projectRoot,
        publishUrl: "https://live.example/path?draft=1",
        workerName: "brother-site",
      },
      cliDeps(tempDir, {
        commands,
        packageRoot: "/package",
      }),
    );
    const config = parseSiteProjectConfigJson(
      await readFile(path.join(projectRoot, "formless.config.json"), "utf8"),
    );

    expect(config.deploy).toEqual({
      workerName: "brother-site",
      accountId: "account-123",
      publishUrl: "https://live.example/path",
      mediaBucket: "brother-site-media",
    });
    await expect(readFile(path.join(projectRoot, ".formless/deploy.env"), "utf8")).resolves.toBe(
      "FORMLESS_ADMIN_TOKEN=admin-secret\n",
    );
    await expect(readFile(path.join(projectRoot, ".gitignore"), "utf8")).resolves.toBe(
      "dist\n.formless/\n",
    );
    expect(result).toMatchObject({
      bucketCreated: true,
      projectRoot,
      secretUploaded: true,
    });
    expect(commands.map((command) => [command.command, ...command.args].join(" "))).toEqual([
      "npm exec -- wrangler r2 bucket create brother-site-media",
      `npm exec -- wrangler secret bulk ${path.join(projectRoot, ".formless/deploy.env")} --name brother-site`,
    ]);
    expect(commands.every((command) => command.cwd === "/package")).toBe(true);
    expect(commands.every((command) => command.env?.CLOUDFLARE_ACCOUNT_ID === "account-123")).toBe(
      true,
    );
  });

  it("accepts existing .formless gitignore entries without adding duplicates", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const commands: CapturedCommand[] = [];

    await writeFileTree(projectRoot, mediaRecords());
    await writeFile(path.join(projectRoot, ".gitignore"), ".formless\nnode_modules\n");

    await setupSiteProjectDeploy(
      {
        createBucket: false,
        mediaBucket: "brother-site-media",
        projectPath: projectRoot,
        publishUrl: "https://live.example",
        uploadSecret: false,
        workerName: "brother-site",
      },
      cliDeps(tempDir, { commands, packageRoot: "/package" }),
    );

    await expect(readFile(path.join(projectRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless\nnode_modules\n",
    );
    expect(commands).toEqual([]);
  });

  it("publishes project code, media, and records from project config", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const sourceRecords = publishRecords();
    const config = {
      ...defaultSiteProjectConfig(),
      deploy: {
        workerName: "brother-site",
        accountId: "account-123",
        publishUrl: "https://live.example",
        mediaBucket: "brother-site-media",
      },
    };
    const commands: CapturedCommand[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    await writeFileTree(projectRoot, sourceRecords, config);

    const projectRecords = parseSiteProjectRecordsJson(
      await readFile(path.join(projectRoot, "site.records.json"), "utf8"),
    );
    const mediaAsset = siteProjectMediaAssetsFromRecords(projectRecords)[0];

    if (!mediaAsset) {
      throw new Error("Expected a project media asset.");
    }

    await mkdir(path.join(projectRoot, path.dirname(mediaAsset.sourcePath)), { recursive: true });
    await writeFile(path.join(projectRoot, mediaAsset.sourcePath), Buffer.from([1, 2, 3]));
    await mkdir(path.join(projectRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".formless/deploy.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    responses.queueJson(snapshot(projectRecords));
    responses.queueJson({
      contentType: mediaAsset.contentType,
      href: mediaAsset.href,
      key: mediaAsset.key,
      size: 3,
    });
    responses.queueJson({
      cursor: 8,
      records: projectRecords,
      schema: siteSourceSchema,
      schemaUpdatedAt: "2026-05-12T04:00:00.000Z",
    });
    responses.queueText("<!doctype html><title>Home</title>");
    responses.queueText("<!doctype html><title>About</title>");

    const result = await publishSiteProject(
      { projectPath: projectRoot, yes: true },
      cliDeps(tempDir, {
        commands,
        fetch: responses.fetcher(requests),
        packageRoot: "/package",
      }),
    );

    expect(commands.map((command) => [command.command, ...command.args].join(" "))).toEqual([
      "npm run build",
      `npm exec -- wrangler deploy --name brother-site --var FORMLESS_RUNTIME_PROFILE:publishedSite --var FORMLESS_DEPLOY_VERSION:${packageJson.version}`,
    ]);
    expect(commands.every((command) => command.cwd === "/package")).toBe(true);
    expect(commands[0]?.env).toMatchObject({
      FORMLESS_RUNTIME_PROFILE: "publishedSite",
      FORMLESS_DEPLOY_VERSION: packageJson.version,
      VITE_FORMLESS_RUNTIME_PROFILE: "publishedSite",
      CLOUDFLARE_ACCOUNT_ID: "account-123",
    });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/site/snapshot",
      "PUT https://live.example/api/formless/media/media/images/cover.png",
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/",
      "GET https://live.example/about",
    ]);
    expect(requests[1]?.headers).toMatchObject({
      authorization: "Bearer local-token",
      "content-type": "image/png",
    });
    expect(result).toMatchObject({
      mode: "apply",
      projectRoot,
      sourceRecordCount: projectRecords.length,
      target: "https://live.example",
    });
    expect(result.backupPath).toContain(
      ".formless/backups/site-2026-05-12T02-00-00-000Z.snapshot.json",
    );
  });

  it("brokers local admin publish through save and data-only publish when deploy is current", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const sourceRecords = publishRecords();
    const config = {
      ...defaultSiteProjectConfig(),
      deploy: {
        workerName: "brother-site",
        publishUrl: "https://live.example",
        mediaBucket: "brother-site-media",
      },
    };
    const commands: CapturedCommand[] = [];
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();

    await writeFileTree(projectRoot, sourceRecords.slice(0, 1), config);
    await mkdir(path.join(projectRoot, ".formless"), { recursive: true });
    await writeFile(
      path.join(projectRoot, ".formless/deploy.env"),
      "FORMLESS_ADMIN_TOKEN=local-token\n",
    );

    const mediaAsset = siteProjectMediaAssetsFromRecords(sourceRecords)[0];

    if (!mediaAsset) {
      throw new Error("Expected a project media asset.");
    }

    responses.queueJson(snapshot(sourceRecords));
    responses.queueBinary(Buffer.from([7, 8, 9]), mediaAsset.contentType);
    responses.queueJson({ version: packageJson.version });
    responses.queueJson(snapshot(sourceRecords));
    responses.queueJson({
      contentType: mediaAsset.contentType,
      href: mediaAsset.href,
      key: mediaAsset.key,
      size: 3,
    });
    responses.queueJson({
      cursor: 8,
      records: sourceRecords,
      schema: siteSourceSchema,
      schemaUpdatedAt: "2026-05-12T04:00:00.000Z",
    });
    responses.queueText("<!doctype html><title>Home</title>");
    responses.queueText("<!doctype html><title>About</title>");

    const broker = await startSiteProjectLocalPublishBroker(
      {
        projectPath: projectRoot,
        source: () => "http://localhost:5173",
      },
      cliDeps(tempDir, {
        commands,
        fetch: responses.fetcher(requests),
        packageRoot: "/package",
      }),
    );

    try {
      await expect(fetch(broker.endpoint, { method: "POST" })).resolves.toMatchObject({
        status: 401,
      });

      const response = await fetch(broker.endpoint, {
        headers: {
          Authorization: `Bearer ${broker.token}`,
          Origin: "http://localhost:5173",
        },
        method: "POST",
      });
      const body = (await response.json()) as {
        ok: true;
        result: { publish: { target: string }; save: { recordCount: number } };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(body).toMatchObject({
        ok: true,
        result: {
          publish: { target: "https://live.example" },
          save: { recordCount: sourceRecords.length },
        },
      });
    } finally {
      await broker.close();
    }

    await expect(readFile(path.join(projectRoot, "site.records.json"), "utf8")).resolves.toBe(
      formatSiteProjectRecords(sourceRecords),
    );
    await expect(readFile(path.join(projectRoot, "media/media/images/cover.png"))).resolves.toEqual(
      Buffer.from([7, 8, 9]),
    );
    expect(commands).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/site/snapshot",
      "GET http://localhost:5173/api/formless/media/media/images/cover.png",
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/site/snapshot",
      "PUT https://live.example/api/formless/media/media/images/cover.png",
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/",
      "GET https://live.example/about",
    ]);
    expect(requests[4]?.headers.authorization).toBe("Bearer local-token");
  });

  it("normalizes local source URLs", () => {
    expect(normalizeSourceUrl("http://localhost:5173/pages/home?x=1#top")).toBe(
      "http://localhost:5173/pages/home",
    );
    expect(() => normalizeSourceUrl("not a url")).toThrow("Source URL is invalid: not a url");
  });

  it("points Site project dev Wrangler state at the project .formless directory", () => {
    const projectRoot = path.resolve("/tmp/site");
    const persistPath = siteProjectWranglerPersistPath(projectRoot);

    expect(persistPath).toBe(path.join(projectRoot, ".formless/wrangler"));
    expect(
      siteProjectDevEnv({ FORMLESS_ADMIN_TOKEN: "secret", KEEP: "value" }, projectRoot, "abc123"),
    ).toMatchObject({
      FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
      FORMLESS_SITE_PROJECT_ID: "abc123",
      FORMLESS_SITE_PROJECT_ROOT: projectRoot,
      FORMLESS_WRANGLER_PERSIST: persistPath,
      KEEP: "value",
      VITE_FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
      VITE_FORMLESS_SITE_PROJECT_ID: "abc123",
    });
    expect(
      siteProjectDevEnv({ FORMLESS_ADMIN_TOKEN: "secret" }, projectRoot, "abc123"),
    ).not.toHaveProperty("FORMLESS_ADMIN_TOKEN");
  });
});

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.resolve(".site-cli-test-"));

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

function capturedRequestJson<T>(request: CapturedFetchRequest | undefined): T {
  if (!request || typeof request.body !== "string") {
    throw new Error("Expected captured request body to be a JSON string.");
  }

  return JSON.parse(request.body) as T;
}

class FakeCliDevChild extends EventEmitter {
  exitCode: number | null = null;
  killed = false;
  stderr = new EventEmitter();
  stdout = new EventEmitter();

  kill() {
    this.killed = true;
    return true;
  }

  close(code: number, signal: NodeJS.Signals | null = null) {
    this.exitCode = code;
    this.emit("close", code, signal);
  }
}

async function writeFileTree(
  projectRoot: string,
  records: StoredRecord[],
  config = defaultSiteProjectConfig(),
) {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, "formless.config.json"), formatSiteProjectConfig(config));
  await writeFile(path.join(projectRoot, "site.records.json"), formatSiteProjectRecords(records));
}

async function writeWorkspaceManifest(
  workspaceRoot: string,
  options: {
    apps?: ReturnType<typeof workspaceApp>[];
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
      archives: { instance: "archives/instance", apps: "archives/apps" },
      local: { stateRoot: ".formless/local" },
      defaultAppPolicy: "declared-installs",
      apps: options.apps ?? [workspaceApp("david", "David Peek")],
      deploy: {
        accountId: "account-123",
        mediaBucket: "personal-media",
        workerName: "personal",
        migrationPolicy: "existing",
      },
    }),
  );
}

function workspaceApp(installId: string, label: string) {
  return {
    installId,
    packageAppKey: "site",
    label,
    archivePath: `archives/apps/${installId}`,
  };
}

function installedSite(installId: string, label: string) {
  return installedApp(installId, label, "site");
}

function installedApp(installId: string, label: string, packageAppKey: "site" | "tasks") {
  return {
    adminRoute: `/apps/${installId}` as `/apps/${string}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    installId,
    label,
    packageAppKey,
    ...(packageAppKey === "site"
      ? {
          publicRoute: `/sites/${installId}` as `/sites/${string}`,
          publicRoutePrefix: `/sites/${installId}/` as `/sites/${string}/`,
        }
      : {}),
    schemaRoute: `/apps/${installId}/schema` as `/apps/${string}/schema`,
    status: "installed" as const,
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

function instanceArchive(apps: AppArchive[]): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: [
      "installed-app-registry",
      "app-store-snapshots",
      "app-scoped-media",
      "core-media-assets",
    ],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps,
  };
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
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "app-scoped-media", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: {
      installId,
      packageAppKey: options.packageAppKey ?? "site",
      sourceSchemaKey: "site",
      label,
      status: "installed",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    data: {
      kind: "storeSnapshot",
      snapshot: snapshot(options.records ?? []),
    },
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

async function writeArchiveDirectory(
  archiveRoot: string,
  archive: InstanceArchive | AppArchive,
  mediaByInstall: Record<string, Uint8Array> = {},
) {
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(
    path.join(archiveRoot, PORTABLE_ARCHIVE_MANIFEST_FILE),
    archive.kind === INSTANCE_ARCHIVE_KIND
      ? formatInstanceArchive(archive)
      : formatAppArchive(archive),
  );

  for (const app of archive.kind === INSTANCE_ARCHIVE_KIND ? archive.apps : [archive]) {
    const bytes = mediaByInstall[app.app.installId];

    if (!bytes) {
      continue;
    }

    const object = app.media.objects[0];

    if (!object) {
      throw new Error(`Expected media object for ${app.app.installId}.`);
    }

    const mediaPath = path.join(archiveRoot, object.archivePath);

    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, Buffer.from(bytes));
  }
}

function archiveFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  extraPackages: BundledAppPackage[] = [],
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

    if (parsedUrl.pathname === "/api/formless/app-installs") {
      return Response.json({
        packages: [...listBundledAppPackages(), ...extraPackages],
        installs,
      });
    }

    const snapshotMatch = parsedUrl.pathname.match(
      /^\/api\/app-installs\/([^/]+)\/([^/]+)\/snapshot$/,
    );

    if (snapshotMatch) {
      const packageAppKey = snapshotMatch[1] ?? "";
      const installId = snapshotMatch[2] ?? "";

      return Response.json(
        snapshotForPackage(packageAppKey, dataByInstall[installId]?.records ?? []),
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

function pushArchiveFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  restoreResponses: unknown[],
  extraPackages: BundledAppPackage[] = [],
): typeof fetch {
  const readFetch = archiveFetch(requests, installs, dataByInstall, extraPackages);

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
        packages: listBundledAppPackages(),
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

function cliDeps(
  cwd: string,
  options: {
    commands?: CapturedCommand[];
    deploy?: (input: DeployFormlessInstanceInput) => Promise<{ url: string }>;
    env?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    healthInputs?: CheckFormlessInstanceDeployMetadataInput[];
    logs?: string[];
    openedUrls?: string[];
    packageRoot?: string;
    setupInputs?: CreateFormlessInstanceOwnerSetupCapabilityInput[];
    spawn?: typeof spawn;
    stateRoot?: string;
    stateWrites?: WriteFormlessInstanceStateInput[];
  } = {},
): FormlessCliDependencies {
  const randomToken = randomTokenSequence("generated-token", setupToken);

  return {
    accountDiscovery: {
      listAccounts: async () => [
        {
          id: "account-123",
          name: "Personal",
          workersDevSubdomain: "dpeek",
        },
      ],
    },
    cwd,
    deploymentAdapter: {
      deploy:
        options.deploy ??
        (async (input) => ({
          url: input.plan.expectedUrl.url,
        })),
    },
    env: options.env ?? {},
    fetch: options.fetch ?? fetch,
    healthCheck: {
      check: async (input) => {
        options.healthInputs?.push(input);

        return {
          cacheControl: "no-store",
          metadataUrl: new URL("/api/formless/deploy", `${input.url}/`).toString(),
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
    spawn: options.spawn ?? spawn,
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
    queueJson: (value: unknown, status = 200) => responses.push(Response.json(value, { status })),
    queueText: (value: string, status = 200) => responses.push(new Response(value, { status })),
  };
}

function fakeSaveFetch(snapshotValue: StoreSnapshot, mediaBytes: Uint8Array): typeof fetch {
  return async (url) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (requestUrl === "https://local.test/api/site/snapshot") {
      return Response.json(snapshotValue);
    }

    if (requestUrl === "https://local.test/api/formless/media/media/images/cover.png") {
      return new Response(Buffer.from(mediaBytes), {
        headers: {
          "content-type": "image/png",
        },
      });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  };
}

function snapshot(records: StoredRecord[]): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "site",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: 1,
    schema: siteSourceSchema,
    records,
  };
}

function taskSnapshot(records: StoredRecord[]): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "tasks",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: records.length,
    schema: taskSourceSchema,
    records,
  };
}

function rateSnapshot(records: StoredRecord[]): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "estii",
    exportedAt: "2026-05-12T00:00:00.000Z",
    schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
    sourceCursor: records.length,
    schema: rateSourceSchema,
    records,
  };
}

function snapshotForPackage(packageAppKey: string, records: StoredRecord[]): StoreSnapshot {
  if (packageAppKey === "site") {
    return snapshot(records);
  }

  if (packageAppKey === "tasks") {
    return taskSnapshot(records);
  }

  if (packageAppKey === "estii") {
    return rateSnapshot(records);
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
