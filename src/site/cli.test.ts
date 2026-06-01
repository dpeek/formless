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
import { planDomainProviderResources } from "../shared/domain-provider-planner.ts";
import type {
  CloudflareDnsRecord,
  CloudflareDomainClient,
  CloudflareWorkerDomain,
  CloudflareWorkerRoute,
  CloudflareZone,
} from "./cloudflare-domain-client.ts";
import {
  listBundledAppPackages,
  packageAppFactsForKey,
  type BundledAppPackage,
} from "../shared/app-installs.ts";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
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
      "  instance domains remote-plan|run-apply|run-delete|forget-route|forget-redirect",
      "       |mark-manually-removed|plan|apply [--workspace <path>] [--target <alias>]",
      "       [--policy <create-only|adopt|override>] [--host <hostname>]",
      "       [--profile <instance|app|publicSite>] [--kind <provider-kind>]",
      "       [--logical-id <id>] [--from-host <hostname>] [--admin-token <token>]",
      "       [--runner-id <id>]",
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
        "domains",
        "remote-plan",
        "--target",
        "remote",
        "--policy",
        "adopt",
      ]),
    ).toEqual({
      host: null,
      kind: "instanceDomainsRemotePlan",
      policy: "adopt",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "plan",
        "--target",
        "remote",
        "--policy",
        "adopt",
      ]),
    ).toEqual({
      host: null,
      kind: "instanceDomainsPlan",
      policy: "adopt",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "apply",
        "--target",
        "remote",
        "--policy",
        "override",
        "--host",
        "dpeek.com",
        "--admin-token",
        "secret",
      ]),
    ).toEqual({
      adminToken: "secret",
      host: "dpeek.com",
      kind: "instanceDomainsApply",
      policy: "override",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "run-apply",
        "--target",
        "remote",
        "--policy",
        "adopt",
        "--host",
        "app.dpeek.com",
        "--runner-id",
        "runner-1",
      ]),
    ).toEqual({
      adminToken: null,
      host: "app.dpeek.com",
      kind: "instanceDomainsRunApply",
      policy: "adopt",
      runnerId: "runner-1",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "run-delete",
        "--target",
        "remote",
        "--host",
        "app.dpeek.com",
        "--kind",
        "cloudflare-worker-custom-domain",
        "--logical-id",
        "primary-custom-domain-app-dpeek-com-app-app",
        "--runner-id",
        "runner-delete",
      ]),
    ).toEqual({
      adminToken: null,
      host: "app.dpeek.com",
      kind: "instanceDomainsRunDelete",
      logicalId: "primary-custom-domain-app-dpeek-com-app-app",
      resourceKind: "cloudflare-worker-custom-domain",
      runnerId: "runner-delete",
      targetAlias: "remote",
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "forget-route",
        "--host",
        "draft.dpeek.com",
        "--profile",
        "publicSite",
        "--admin-token",
        "secret",
      ]),
    ).toEqual({
      adminToken: "secret",
      host: "draft.dpeek.com",
      kind: "instanceDomainsForgetRoute",
      profile: "publicSite",
      targetAlias: null,
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "forget-redirect",
        "--from-host",
        "old.dpeek.com",
      ]),
    ).toEqual({
      adminToken: null,
      fromHost: "old.dpeek.com",
      kind: "instanceDomainsForgetRedirect",
      targetAlias: null,
      workspacePath: ".",
    });
    expect(
      parseFormlessCliArgs([
        "instance",
        "domains",
        "mark-manually-removed",
        "--host",
        "old.dpeek.com",
        "--kind",
        "cloudflare-redirect-rule",
        "--logical-id",
        "primary-redirect-old-dpeek-com",
      ]),
    ).toEqual({
      adminToken: null,
      host: "old.dpeek.com",
      kind: "instanceDomainsMarkManuallyRemoved",
      logicalId: "primary-redirect-old-dpeek-com",
      resourceKind: "cloudflare-redirect-rule",
      targetAlias: null,
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
      "Usage: formless instance <init-workspace|status|pull|check|push|dev|reset-local|deploy|domains|token>",
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
    expect(() => parseFormlessCliArgs(["instance", "domains", "forget"])).toThrow(
      "Usage: formless instance domains <remote-plan|run-apply|run-delete|forget-route|forget-redirect|mark-manually-removed|plan|apply>",
    );
    expect(() =>
      parseFormlessCliArgs(["instance", "domains", "plan", "--policy", "force"]),
    ).toThrow(
      'formless instance domains plan --policy must be "create-only", "adopt", or "override".',
    );
    expect(() =>
      parseFormlessCliArgs(["instance", "domains", "apply", "--policy", "override"]),
    ).toThrow("formless instance domains apply --policy override requires --host <hostname>.");
    expect(() =>
      parseFormlessCliArgs(["instance", "domains", "run-apply", "--policy", "override"]),
    ).toThrow("formless instance domains run-apply --policy override requires --host <hostname>.");
    expect(() => parseFormlessCliArgs(["instance", "domains", "run-delete"])).toThrow(
      "Missing required option for formless instance domains run-delete: --host.",
    );
    expect(() =>
      parseFormlessCliArgs(["instance", "domains", "run-delete", "--host", "dpeek.com"]),
    ).toThrow("Missing required option for formless instance domains run-delete: --logical-id.");
    expect(() =>
      parseFormlessCliArgs([
        "instance",
        "domains",
        "mark-manually-removed",
        "--host",
        "dpeek.com",
        "--logical-id",
        "resource",
        "--kind",
        "cloudflare-pages-domain",
      ]),
    ).toThrow(
      'formless instance domains mark-manually-removed --kind must be "cloudflare-worker-custom-domain", "cloudflare-redirect-rule", or "cloudflare-dns-records".',
    );
    expect(() =>
      parseFormlessCliArgs(["instance", "domains", "forget-route", "--host", "draft.dpeek.com"]),
    ).toThrow("Missing required option for formless instance domains forget-route: --profile.");
    expect(() => parseFormlessCliArgs(["instance", "domains", "forget-redirect"])).toThrow(
      "Missing required option for formless instance domains forget-redirect: --from-host.",
    );
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
    responses.queueJson({
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
        "Deployment: Deployed; Revision 2 deployed at 2026-05-28T00:00:00.000Z.",
      ].join("\n"),
    ]);
  });

  it("pulls instance workspace archives into deterministic local layout", async () => {
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

    const pulledManifest = parseFormlessInstanceWorkspaceManifestJson(
      await readFile(path.join(workspaceRoot, FORMLESS_INSTANCE_WORKSPACE_MANIFEST_FILE), "utf8"),
    );

    expect(pulledInstance.apps.map((app) => app.app.installId)).toEqual(["david", "james"]);
    expect(pulledInstance.capabilities).toContain("schema-owned-control-plane");
    expect(
      pulledInstance.controlPlane?.records
        .map((record) => `${record.entity}:${record.id}`)
        .sort((left, right) => left.localeCompare(right)),
    ).toEqual(
      [
        "appInstall:david",
        "appRoute:app-route:david:admin",
        "appRoute:app-route:david:publicSite",
        "appRoute:app-route:david:schema",
        "deployDesiredResource:deploy-resource:instance.primary:custom-domain:dpeek.com",
        "deployDriftReport:deploy-drift:instance.primary",
        "deployTarget:instance.primary",
        "domainMapping:domain-mapping:publicSite:dpeek.com",
        "providerConfigRef:provider-config:cloudflare:personal",
      ].sort((left, right) => left.localeCompare(right)),
    );
    expect(JSON.stringify(pulledInstance.controlPlane)).not.toContain("CF_API_TOKEN");
    expect(JSON.stringify(pulledInstance.controlPlane)).not.toContain("rec_site");
    expect(pulledManifest.domains).toEqual([
      { enabled: true, host: "dpeek.com", profile: "publicSite", targetInstallId: "david" },
      {
        enabled: true,
        host: "www.dpeek.com",
        profile: "publicSite",
        targetInstallId: "david",
      },
    ]);
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
      "GET https://personal.dpeek.workers.dev/api/formless/control-plane/bootstrap?actorKind=cliDeployer",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/david/snapshot",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/james/snapshot",
      "GET https://personal.dpeek.workers.dev/api/formless/media/media/images/cover.png",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/david/snapshot",
      "GET https://personal.dpeek.workers.dev/api/formless/media/media/images/cover.png",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/app-installs/site/james/snapshot",
      "GET https://personal.dpeek.workers.dev/api/formless/domain-mappings",
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
        "Domain mappings: dpeek.com -> publicSite:david, www.dpeek.com -> publicSite:david.",
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
        "Local domains: 0. Remote domains: 0.",
        "Missing remote installs: none.",
        "Extra remote installs: none.",
        "Package mismatches: none.",
        "Changed records: none.",
        "Changed control-plane records: none.",
        "Changed media: none.",
        "Changed domain mappings: none.",
        "Changed archive paths: none.",
      ].join("\n"),
    ]);
  });

  it("keeps provider drift reports separate from desired control-plane drift", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localApp = appArchive("david", "David Peek");
    const fetcher = archiveFetch(
      requests,
      [installedSite("david", "David Peek")],
      {
        david: { records: [] },
      },
      [],
      [domainMapping("dpeek.com", "david")],
      controlPlaneRecords({ driftStatus: "drifted" }),
    );

    await writeWorkspaceManifest(workspaceRoot, {
      domains: [
        { enabled: true, host: "dpeek.com", profile: "publicSite", targetInstallId: "david" },
      ],
    });
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/instance"), {
      ...instanceArchive([localApp]),
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: {
        schemaKey: "instance-control-plane",
        schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
        records: controlPlaneRecords({ driftStatus: "in-sync" }),
      },
    });
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
        "Local domains: 1. Remote domains: 1.",
        "Missing remote installs: none.",
        "Extra remote installs: none.",
        "Package mismatches: none.",
        "Changed records: none.",
        "Changed control-plane records: none.",
        "Changed media: none.",
        "Changed domain mappings: none.",
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
        "Local domains: 0. Remote domains: 0.",
        "Missing remote installs: dom.",
        "Extra remote installs: extra.",
        "Package mismatches: james (local site, remote tasks).",
        "Changed records: david.",
        "Changed control-plane records: none.",
        "Changed media: david.",
        "Changed domain mappings: none.",
        "Changed archive paths: archives/apps/david, archives/apps/dom, archives/apps/james, archives/instance.",
      ].join("\n"),
    ]);
  });

  it("reports workspace desired domain mapping drift without provider mutation", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];
    const localDavid = appArchive("david", "David Peek");
    const localJames = appArchive("james", "James Peek");
    const fetcher = archiveFetch(
      requests,
      [installedSite("david", "David Peek"), installedSite("james", "James Peek")],
      {
        david: { records: [] },
        james: { records: [] },
      },
      [],
      [
        domainMapping("dpeek.com", "james"),
        domainMapping("www.dpeek.com", "david"),
        { ...domainMapping("disabled.dpeek.com", "david"), enabled: false },
      ],
    );

    await writeWorkspaceManifest(workspaceRoot, {
      apps: [workspaceApp("david", "David Peek"), workspaceApp("james", "James Peek")],
      domains: [
        { enabled: true, host: "dpeek.com", profile: "publicSite", targetInstallId: "david" },
        {
          enabled: true,
          host: "local.dpeek.com",
          profile: "publicSite",
          targetInstallId: "david",
        },
      ],
    });
    await writeArchiveDirectory(
      path.join(workspaceRoot, "archives/instance"),
      instanceArchive([localDavid, localJames]),
    );
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/david"), localDavid);
    await writeArchiveDirectory(path.join(workspaceRoot, "archives/apps/james"), localJames);

    await runFormlessCli(
      ["instance", "check", "--workspace", workspaceRoot],
      cliDeps(tempDir, { fetch: fetcher, logs }),
    );

    expect(requests.some((request) => request.method === "POST")).toBe(false);
    expect(logs).toEqual([
      [
        "Instance workspace check.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Drift: detected.",
        "Local apps: 2. Remote apps: 2.",
        "Local records: 0. Remote records: 0.",
        "Local media files: 0. Remote media files: 0.",
        "Local domains: 2. Remote domains: 3.",
        "Missing remote installs: none.",
        "Extra remote installs: none.",
        "Package mismatches: none.",
        "Changed records: none.",
        "Changed control-plane records: none.",
        "Changed media: none.",
        "Changed domain mappings: disabled.dpeek.com live-only (publicSite:david:disabled), dpeek.com mismatch (workspace publicSite:david, live publicSite:james), local.dpeek.com local-only (publicSite:david), www.dpeek.com live-only (publicSite:david).",
        "Changed archive paths: none.",
      ].join("\n"),
    ]);
  });

  it("plans instance domains from workspace and live desired mappings without mutations", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot, {
      domains: [
        {
          enabled: false,
          host: "disabled.dpeek.com",
          profile: "publicSite",
          targetInstallId: "david",
        },
        { enabled: true, host: "dpeek.com", profile: "publicSite", targetInstallId: "david" },
        {
          enabled: true,
          host: "www.dpeek.com",
          profile: "publicSite",
          targetInstallId: "david",
        },
      ],
    });

    await runFormlessCli(
      ["instance", "domains", "plan", "--workspace", workspaceRoot, "--policy", "adopt"],
      cliDeps(tempDir, {
        cloudflareDomainClient: fakeCloudflareDomainClient({
          dnsRecords: {
            "dpeek.com": [
              {
                content: "192.0.2.10",
                id: "dns-1",
                name: "dpeek.com",
                proxied: true,
                type: "A",
              },
            ],
          },
          workerDomains: [
            {
              hostname: "www.dpeek.com",
              id: "domain-1",
              service: "personal",
              zoneId: "zone-1",
              zoneName: "dpeek.com",
            },
          ],
          workerRoutes: {
            "zone-1": [
              {
                id: "route-1",
                pattern: "dpeek.com/*",
                script: "old-worker",
              },
            ],
          },
          zonesByName: {
            "dpeek.com": [{ id: "zone-1", name: "dpeek.com", status: "active" }],
          },
        }),
        fetch: domainMappingFetch(requests),
        logs,
      }),
    );

    expect(requests).toEqual([
      {
        body: undefined,
        headers: { accept: "application/json" },
        method: "GET",
        url: "https://personal.dpeek.workers.dev/api/formless/domain-mappings",
      },
    ]);
    expect(requests.some((request) => request.url.includes("/api/formless/deployments/"))).toBe(
      false,
    );
    expect(logs).toEqual([
      [
        "Instance domain direct Cloudflare fallback plan dry run.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Account: account-123.",
        "Worker: personal.",
        "Policy: adopt.",
        "Desired source: workspace (3 workspace, 2 live enabled).",
        "Desired drift: none.",
        "Domains: dpeek.com, www.dpeek.com.",
        "dpeek.com: blocked; profile publicSite:david; zone dpeek.com (zone-1); apex yes; custom domains none; routes dpeek.com/* -> old-worker; dns A 192.0.2.10; actions none; issues worker-route-conflict, dns-record-conflict, apex-domain",
        "www.dpeek.com: ready; profile publicSite:david; zone dpeek.com (zone-1); apex no; custom domains www.dpeek.com -> personal; routes none; dns none; actions adopt-existing-worker-custom-domain; issues none",
      ].join("\n"),
    ]);
  });

  it("requests a remote domain provider plan through the instance control plane", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot);

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson({
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
        planReady: true,
        workerName: "personal",
        zones: [{ id: "zone-1", name: "dpeek.com" }],
      },
      plan: {
        blockers: [],
        instanceId: "primary",
        policy: "adopt",
        resources: [
          {
            host: "www.dpeek.com",
            kind: "cloudflare-worker-custom-domain",
            logicalId: "primary-custom-domain-www-dpeek-com-publicsite-david",
            profile: "publicSite",
            props: {
              adopt: true,
              name: "www.dpeek.com",
              overrideExistingOrigin: false,
              workerName: "personal",
              zoneId: "zone-1",
            },
            targetInstallId: "david",
            zone: { id: "zone-1", name: "dpeek.com" },
          },
        ],
        workerName: "personal",
      },
      redirectIntents: [],
    });

    await runFormlessCli(
      [
        "instance",
        "domains",
        "remote-plan",
        "--workspace",
        workspaceRoot,
        "--policy",
        "adopt",
        "--host",
        "www.dpeek.com",
      ],
      cliDeps(tempDir, { fetch: responses.fetcher(requests), logs }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "GET https://personal.dpeek.workers.dev/api/formless/domain-provider?host=www.dpeek.com&policy=adopt",
    ]);
    expect(logs).toEqual([
      [
        "Instance domain remote provider plan.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Provider config: plan ready, apply ready.",
        "Account: account-123.",
        "Worker: personal.",
        "Policy: adopt.",
        "Zones: dpeek.com (zone-1).",
        "Config issues: none.",
        "Resources: 1 (custom domains 1, redirect rules 0, DNS records 0).",
        "Blockers: none.",
        "www.dpeek.com: cloudflare-worker-custom-domain; profile publicSite:david; zone dpeek.com (zone-1); alchemy primary-custom-domain-www-dpeek-com-publicsite-david",
      ].join("\n"),
    ]);
  });

  it("reports deployment-aware remote provider apply output", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [{ enabled: true, host: "www.dpeek.com", profile: "instance" }],
      workerName: "personal",
      zones: [{ id: "zone-1", name: "dpeek.com" }],
    });
    const desiredState = {
      hash: `sha256:${"a".repeat(64)}`,
      revision: 3,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.3",
    };
    const attemptId = "attempt.11111111-1111-4111-8111-111111111111";
    const leaseId = "lease.11111111-1111-4111-8111-111111111111";
    const leaseToken = "lease:cli-success";

    await writeWorkspaceManifest(workspaceRoot);

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(
      {
        code: "domain-provider-apply-job-ready",
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
          planReady: true,
          workerName: "personal",
          zones: [{ id: "zone-1", name: "dpeek.com" }],
        },
        job: {
          createdAt: "2026-05-27T00:00:00.000Z",
          jobId: "job-deployment-cli",
          plan,
          runnerId: "runner-deploy",
          status: "ready",
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
        plan,
        status: "ready",
      },
      202,
    );
    responses.queueJson({
      cursor: 9,
      records: [
        { entity: "appInstall", id: "site", values: { installId: "site" } },
        {
          entity: "appRoute",
          id: "app-route:site:publicSite",
          values: { appInstall: "site", path: "/sites/site" },
        },
        {
          entity: "domainMapping",
          id: "domain:www.dpeek.com",
          values: { appRoute: "app-route:site:publicSite", host: "www.dpeek.com" },
        },
        {
          entity: "deployTarget",
          id: desiredState.targetId,
          values: { targetId: desiredState.targetId },
        },
        {
          entity: "deployDesiredResource",
          id: "desired:www.dpeek.com",
          values: { deployTarget: desiredState.targetId, logicalId: "custom-domain:www" },
        },
      ],
      schema: {},
    });
    responses.queueJson({
      desiredState: {
        ...desiredState,
        createdAt: "2026-05-27T00:00:00.000Z",
        display: {
          resourceCount: 1,
          resourcesByKind: { "cloudflare-worker-custom-domain": 1 },
          title: "Primary instance target",
        },
        resourceGraph: { resources: [], targetId: desiredState.targetId },
        schemaVersion: 1,
        source: { fingerprint: "source-1", intentRevision: 1 },
      },
      target: { kind: "instance", targetId: desiredState.targetId },
    });
    responses.queueJson({
      status: {
        checkedAt: "2026-05-27T00:00:00.000Z",
        state: "no-target",
        targetId: desiredState.targetId,
      },
      target: { kind: "instance", targetId: desiredState.targetId },
    });
    responses.queueJson(
      {
        attempt: {
          ...desiredState,
          actor: {
            actorId: "domain-provider.apply",
            displayName: "Domain provider apply",
            kind: "runner",
            runnerId: "runner-deploy",
          },
          attemptId,
          idempotencyKey: "domain-provider-runner:job-deployment-cli",
          leaseId,
          mode: "apply",
          startedAt: "2026-05-27T00:00:00.000Z",
          status: "started",
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
        lease: {
          actor: {
            actorId: "domain-provider.apply",
            displayName: "Domain provider apply",
            kind: "runner",
            runnerId: "runner-deploy",
          },
          acquiredAt: "2026-05-27T00:00:00.000Z",
          attemptId,
          expiresAt: "2026-05-27T00:16:00.000Z",
          leaseId,
          mode: "apply",
          status: "active",
          targetId: desiredState.targetId,
          token: leaseToken,
        },
        replayed: false,
      },
      201,
    );
    responses.queueJson({
      attempt: {
        ...desiredState,
        attemptId,
        mode: "apply",
        status: "started",
      },
      plan: {
        ...desiredState,
        attemptId,
        kind: "plan",
        recordedAt: "2026-05-27T00:00:00.000Z",
        summary: {
          blockers: [],
          changes: { create: 1, delete: 0, noChange: 0, update: 0 },
          warnings: [],
        },
      },
    });
    responses.queueJson({
      job: {
        createdAt: "2026-05-27T00:00:00.000Z",
        jobId: "job-deployment-cli",
        plan,
        result: { evidenceCount: 1 },
        runnerId: "runner-deploy",
        status: "succeeded",
        updatedAt: "2026-05-27T00:00:01.000Z",
      },
    });
    responses.queueJson({
      attempt: {
        ...desiredState,
        attemptId,
        completedAt: "2026-05-27T00:00:01.000Z",
        mode: "apply",
        status: "succeeded",
      },
      lease: {
        attemptId,
        leaseId,
        status: "released",
        targetId: desiredState.targetId,
        token: leaseToken,
      },
      result: {
        ...desiredState,
        alchemy: { app: "formless-domain-primary", scope: "instance.primary", stage: "production" },
        attemptId,
        completedAt: "2026-05-27T00:00:01.000Z",
        evidence: [],
        kind: "success",
        runnerId: "runner-deploy",
      },
    });

    await runFormlessCli(
      [
        "instance",
        "domains",
        "run-apply",
        "--workspace",
        workspaceRoot,
        "--policy",
        "create-only",
        "--host",
        "www.dpeek.com",
        "--runner-id",
        "runner-deploy",
        "--admin-token",
        "admin-token",
      ],
      cliDeps(tempDir, {
        domainProviderApplyRuntime: async () => ({
          factories: {
            CustomDomain: async (_id, props) => ({
              ...props,
              createdAt: 1,
              id: "custom-domain-cli",
              updatedAt: 2,
            }),
            DnsRecords: async () => {
              throw new Error("DNS records are outside this test.");
            },
            RedirectRule: async () => {
              throw new Error("Redirect rules are outside this test.");
            },
          },
          password: "alchemy-password",
          runner: async (_appName, _options, apply) => apply(),
          stateStore: () => {
            throw new Error("state store is passed to Alchemy, not called by this test.");
          },
        }),
        fetch: responses.fetcher(requests),
        logs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/apply",
      "GET https://personal.dpeek.workers.dev/api/formless/control-plane/bootstrap?actorKind=runner",
      "GET https://personal.dpeek.workers.dev/api/formless/deployments/desired-state",
      "GET https://personal.dpeek.workers.dev/api/formless/deployments/status",
      "POST https://personal.dpeek.workers.dev/api/formless/deployments/attempts/start",
      "POST https://personal.dpeek.workers.dev/api/formless/deployments/attempts/plan",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/apply-jobs/job-deployment-cli/result",
      "POST https://personal.dpeek.workers.dev/api/formless/deployments/attempts/success",
    ]);
    expect(requests[4]?.headers["X-Formless-Control-Plane-Actor"]).toBe("runner");
    expect(requests[7]?.headers.authorization).toBe("Bearer admin-token");
    expect(
      capturedRequestJson<{ desiredState: typeof desiredState; mode: string }>(requests[7]),
    ).toMatchObject({
      desiredState,
      mode: "apply",
    });
    expect(
      capturedRequestJson<{ attemptId: string; desiredState: typeof desiredState }>(requests[8]),
    ).toMatchObject({
      attemptId,
      desiredState,
    });
    expect(
      capturedRequestJson<{
        attemptId: string;
        desiredState: typeof desiredState;
        leaseToken: string;
      }>(requests[10]),
    ).toMatchObject({
      attemptId,
      desiredState,
      leaseToken,
    });
    expect(logs).toEqual([
      [
        "Instance domain Alchemy apply complete.",
        "Target: https://personal.dpeek.workers.dev.",
        "Job: job-deployment-cli.",
        "Desired-state version: desired.instance.primary.3 (revision 3).",
        "Deployment attempt: attempt.11111111-1111-4111-8111-111111111111.",
        "Deployment target: instance.primary.",
        "Deployment resources: 1 (custom domains 1, redirect rules 0, DNS records 0).",
        "Deployment writeback: succeeded.",
        "Job status: succeeded.",
        "Runner: runner-deploy.",
        "Policy: create-only.",
        "Resources: 1.",
        "Evidence writes: 1.",
      ].join("\n"),
    ]);
  });

  it("writes deployment failure facts when remote provider apply fails after attempt start", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [{ enabled: true, host: "fail.dpeek.com", profile: "instance" }],
      workerName: "personal",
      zones: [{ id: "zone-1", name: "dpeek.com" }],
    });
    const desiredState = {
      hash: `sha256:${"b".repeat(64)}`,
      revision: 4,
      targetId: "instance.primary",
      versionId: "desired.instance.primary.4",
    };
    const attemptId = "attempt.22222222-2222-4222-8222-222222222222";
    const leaseId = "lease.22222222-2222-4222-8222-222222222222";
    const leaseToken = "lease:cli-failure";

    await writeWorkspaceManifest(workspaceRoot);

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(
      {
        code: "domain-provider-apply-job-ready",
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
          planReady: true,
          workerName: "personal",
          zones: [{ id: "zone-1", name: "dpeek.com" }],
        },
        job: {
          createdAt: "2026-05-27T00:00:00.000Z",
          jobId: "job-deployment-failure",
          plan,
          runnerId: "runner-fail",
          status: "ready",
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
        plan,
        status: "ready",
      },
      202,
    );
    responses.queueJson({
      cursor: 10,
      records: [
        { entity: "appInstall", id: "site", values: { installId: "site" } },
        {
          entity: "appRoute",
          id: "app-route:site:publicSite",
          values: { appInstall: "site", path: "/sites/site" },
        },
        {
          entity: "domainMapping",
          id: "domain:fail.dpeek.com",
          values: { appRoute: "app-route:site:publicSite", host: "fail.dpeek.com" },
        },
        {
          entity: "deployTarget",
          id: desiredState.targetId,
          values: { targetId: desiredState.targetId },
        },
        {
          entity: "deployDesiredResource",
          id: "desired:fail.dpeek.com",
          values: { deployTarget: desiredState.targetId, logicalId: "custom-domain:fail" },
        },
      ],
      schema: {},
    });
    responses.queueJson({
      desiredState: {
        ...desiredState,
        createdAt: "2026-05-27T00:00:00.000Z",
        display: {
          resourceCount: 1,
          resourcesByKind: { "cloudflare-worker-custom-domain": 1 },
          title: "Primary instance target",
        },
        resourceGraph: { resources: [], targetId: desiredState.targetId },
        schemaVersion: 1,
        source: { fingerprint: "source-failure", intentRevision: 2 },
      },
      target: { kind: "instance", targetId: desiredState.targetId },
    });
    responses.queueJson({
      status: {
        checkedAt: "2026-05-27T00:00:00.000Z",
        state: "no-target",
        targetId: desiredState.targetId,
      },
      target: { kind: "instance", targetId: desiredState.targetId },
    });
    responses.queueJson(
      {
        attempt: {
          ...desiredState,
          actor: {
            actorId: "domain-provider.apply",
            displayName: "Domain provider apply",
            kind: "runner",
            runnerId: "runner-fail",
          },
          attemptId,
          idempotencyKey: "domain-provider-runner:job-deployment-failure",
          leaseId,
          mode: "apply",
          startedAt: "2026-05-27T00:00:00.000Z",
          status: "started",
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
        lease: {
          actor: {
            actorId: "domain-provider.apply",
            displayName: "Domain provider apply",
            kind: "runner",
            runnerId: "runner-fail",
          },
          acquiredAt: "2026-05-27T00:00:00.000Z",
          attemptId,
          expiresAt: "2026-05-27T00:16:00.000Z",
          leaseId,
          mode: "apply",
          status: "active",
          targetId: desiredState.targetId,
          token: leaseToken,
        },
        replayed: false,
      },
      201,
    );
    responses.queueJson({
      attempt: {
        ...desiredState,
        attemptId,
        mode: "apply",
        status: "started",
      },
      plan: {
        ...desiredState,
        attemptId,
        kind: "plan",
        recordedAt: "2026-05-27T00:00:00.000Z",
        summary: {
          blockers: [],
          changes: { create: 1, delete: 0, noChange: 0, update: 0 },
          warnings: [],
        },
      },
    });
    responses.queueJson({
      job: {
        createdAt: "2026-05-27T00:00:00.000Z",
        jobId: "job-deployment-failure",
        plan,
        result: { error: "Alchemy apply failed.", evidenceCount: 0 },
        runnerId: "runner-fail",
        status: "failed",
        updatedAt: "2026-05-27T00:00:01.000Z",
      },
    });
    responses.queueJson({
      attempt: {
        ...desiredState,
        attemptId,
        completedAt: "2026-05-27T00:00:01.000Z",
        mode: "apply",
        status: "failed",
      },
      lease: {
        attemptId,
        leaseId,
        status: "released",
        targetId: desiredState.targetId,
        token: leaseToken,
      },
      result: {
        ...desiredState,
        actor: {
          actorId: "domain-provider.apply",
          displayName: "Domain provider apply",
          kind: "runner",
          runnerId: "runner-fail",
        },
        attemptId,
        completedAt: "2026-05-27T00:00:01.000Z",
        kind: "failure",
        runnerId: "runner-fail",
        summary: {
          code: "domain-provider-apply-failed",
          displayMessage: "Alchemy apply failed.",
        },
      },
    });

    await expect(
      runFormlessCli(
        [
          "instance",
          "domains",
          "run-apply",
          "--workspace",
          workspaceRoot,
          "--policy",
          "create-only",
          "--host",
          "fail.dpeek.com",
          "--runner-id",
          "runner-fail",
          "--admin-token",
          "admin-token",
        ],
        cliDeps(tempDir, {
          domainProviderApplyRuntime: async () => ({
            factories: {
              CustomDomain: async () => {
                throw new Error("CustomDomain is outside this test.");
              },
              DnsRecords: async () => {
                throw new Error("DNS records are outside this test.");
              },
              RedirectRule: async () => {
                throw new Error("Redirect rules are outside this test.");
              },
            },
            password: "alchemy-password",
            runner: async () => {
              throw new Error("Alchemy apply failed.");
            },
            stateStore: () => {
              throw new Error("state store is passed to Alchemy, not called by this test.");
            },
          }),
          fetch: responses.fetcher(requests),
        }),
      ),
    ).rejects.toThrow("Alchemy apply failed.");

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/apply",
      "GET https://personal.dpeek.workers.dev/api/formless/control-plane/bootstrap?actorKind=runner",
      "GET https://personal.dpeek.workers.dev/api/formless/deployments/desired-state",
      "GET https://personal.dpeek.workers.dev/api/formless/deployments/status",
      "POST https://personal.dpeek.workers.dev/api/formless/deployments/attempts/start",
      "POST https://personal.dpeek.workers.dev/api/formless/deployments/attempts/plan",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/apply-jobs/job-deployment-failure/result",
      "POST https://personal.dpeek.workers.dev/api/formless/deployments/attempts/failure",
    ]);
    expect(requests[4]?.headers["X-Formless-Control-Plane-Actor"]).toBe("runner");
    expect(
      capturedRequestJson<{ error: string; runnerId: string; status: string }>(requests[9]),
    ).toEqual({
      error: "Alchemy apply failed.",
      runnerId: "runner-fail",
      status: "failed",
    });
    expect(
      capturedRequestJson<{
        attemptId: string;
        desiredState: typeof desiredState;
        leaseToken: string;
        summary: { code: string; displayMessage: string };
      }>(requests[10]),
    ).toMatchObject({
      attemptId,
      desiredState,
      leaseToken,
      summary: {
        code: "domain-provider-apply-failed",
        displayMessage: "Alchemy apply failed.",
      },
    });
  });

  it("starts remote provider delete jobs before requiring runner secrets", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const plan = planDomainProviderResources({
      instanceId: "primary",
      mappings: [
        {
          enabled: true,
          host: "old.dpeek.com",
          profile: "instance",
        },
      ],
      workerName: "personal",
      zones: [{ id: "zone-1", name: "dpeek.com" }],
    });
    const target = {
      accountId: "account-123",
      action: "created" as const,
      alchemyResourceId: "primary-custom-domain-old-dpeek-com-instance",
      host: "old.dpeek.com",
      kind: "cloudflare-worker-custom-domain" as const,
      logicalId: "primary-custom-domain-old-dpeek-com-instance",
      profile: "instance" as const,
      resourceId: "custom-domain-old",
      resourceJson: "{}",
      workerName: "personal",
      zoneId: "zone-1",
      zoneName: "dpeek.com",
    };

    await writeWorkspaceManifest(workspaceRoot);

    responses.queueJson({ version: packageJson.version });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(
      {
        code: "domain-provider-delete-job-ready",
        config: {
          accountId: "account-123",
          alchemyPassword: { configured: false, envNames: ["ALCHEMY_PASSWORD"] },
          applyReady: true,
          cloudflareApiToken: {
            configured: false,
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
          zones: [{ id: "zone-1", name: "dpeek.com" }],
        },
        job: {
          createdAt: "2026-05-27T00:00:00.000Z",
          jobId: "delete-job-1",
          plan,
          runnerId: "runner-delete",
          status: "ready",
          targets: [target],
          updatedAt: "2026-05-27T00:00:00.000Z",
        },
        plan,
        status: "ready",
        targets: [target],
      },
      202,
    );
    responses.queueJson({
      job: {
        createdAt: "2026-05-27T00:00:00.000Z",
        jobId: "delete-job-1",
        plan,
        result: {
          error: "Domain provider runner requires ALCHEMY_PASSWORD.",
          evidenceCount: 0,
        },
        runnerId: "runner-delete",
        status: "failed",
        targets: [target],
        updatedAt: "2026-05-27T00:00:01.000Z",
      },
    });

    await expect(
      runFormlessCli(
        [
          "instance",
          "domains",
          "run-delete",
          "--workspace",
          workspaceRoot,
          "--host",
          "old.dpeek.com",
          "--kind",
          "cloudflare-worker-custom-domain",
          "--logical-id",
          "primary-custom-domain-old-dpeek-com-instance",
          "--runner-id",
          "runner-delete",
          "--admin-token",
          "admin-token",
        ],
        cliDeps(tempDir, { env: {}, fetch: responses.fetcher(requests) }),
      ),
    ).rejects.toThrow("Domain provider runner requires ALCHEMY_PASSWORD.");

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/delete",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/delete-jobs/delete-job-1/result",
    ]);
    expect(requests[3]?.headers.authorization).toBe("Bearer admin-token");
    expect(requests[4]?.headers.authorization).toBe("Bearer admin-token");
    expect(
      capturedRequestJson<{ host: string; kind: string; logicalId: string; runnerId: string }>(
        requests[3],
      ),
    ).toEqual({
      host: "old.dpeek.com",
      kind: "cloudflare-worker-custom-domain",
      logicalId: "primary-custom-domain-old-dpeek-com-instance",
      runnerId: "runner-delete",
    });
    expect(
      capturedRequestJson<{ error: string; runnerId: string; status: string }>(requests[4]),
    ).toEqual({
      error: "Domain provider runner requires ALCHEMY_PASSWORD.",
      runnerId: "runner-delete",
      status: "failed",
    });
  });

  it("runs route forget and manual provider cleanup through remote instance APIs", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
    const now = "2026-05-27T00:00:00.000Z";
    const mapping = { ...domainMapping("draft.dpeek.com", "david"), enabled: false };
    const desiredCleanupEvent = {
      ...mapping,
      action: "forgotten",
      eventId: 1,
      reason: "disabled-unapplied",
      recordedAt: now,
    };
    const redirectIntent = {
      createdAt: now,
      enabled: false,
      fromHost: "old.dpeek.com",
      preservePath: true,
      preserveQueryString: true,
      statusCode: 308,
      toHost: "new.dpeek.com",
      updatedAt: now,
    };
    const redirectCleanupEvent = {
      ...redirectIntent,
      action: "forgotten",
      eventId: 2,
      reason: "disabled-unapplied",
      recordedAt: now,
    };
    const cleanupTarget = {
      accountId: "account-123",
      action: "created",
      alchemyResourceId: "primary-redirect-old-dpeek-com",
      host: "old.dpeek.com",
      kind: "cloudflare-redirect-rule",
      logicalId: "primary-redirect-old-dpeek-com",
      resourceId: "redirect-rule-old",
      resourceJson: "{}",
      runnerId: "runner-1",
      zoneId: "zone-1",
      zoneName: "dpeek.com",
    };
    const queueStatus = () => {
      responses.queueJson({ version: packageJson.version });
      responses.queueJson({ setupComplete: true });
      responses.queueJson({
        packages: listBundledAppPackages(),
        installs: [installedSite("david", "David Peek")],
      });
    };

    await writeWorkspaceManifest(workspaceRoot);

    queueStatus();
    responses.queueJson({
      desiredCleanupEvent,
      desiredCleanupEvents: [desiredCleanupEvent],
      mapping,
      mappings: [],
    });
    queueStatus();
    responses.queueJson({
      redirectIntent,
      redirectIntentCleanupEvent: redirectCleanupEvent,
      redirectIntentCleanupEvents: [redirectCleanupEvent],
      redirectIntents: [],
    });
    queueStatus();
    responses.queueJson({
      action: "manually-removed",
      status: "cleaned",
      target: cleanupTarget,
    });

    await runFormlessCli(
      [
        "instance",
        "domains",
        "forget-route",
        "--workspace",
        workspaceRoot,
        "--host",
        "draft.dpeek.com",
        "--profile",
        "publicSite",
        "--admin-token",
        "admin-token",
      ],
      cliDeps(tempDir, { fetch: responses.fetcher(requests), logs }),
    );
    await runFormlessCli(
      [
        "instance",
        "domains",
        "forget-redirect",
        "--workspace",
        workspaceRoot,
        "--from-host",
        "old.dpeek.com",
        "--admin-token",
        "admin-token",
      ],
      cliDeps(tempDir, { fetch: responses.fetcher(requests), logs }),
    );
    await runFormlessCli(
      [
        "instance",
        "domains",
        "mark-manually-removed",
        "--workspace",
        workspaceRoot,
        "--host",
        "old.dpeek.com",
        "--kind",
        "cloudflare-redirect-rule",
        "--logical-id",
        "primary-redirect-old-dpeek-com",
        "--admin-token",
        "admin-token",
      ],
      cliDeps(tempDir, { fetch: responses.fetcher(requests), logs }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "DELETE https://personal.dpeek.workers.dev/api/formless/domain-mappings/forget?host=draft.dpeek.com&profile=publicSite",
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "DELETE https://personal.dpeek.workers.dev/api/formless/domain-provider/redirects/forget?fromHost=old.dpeek.com",
      "GET https://personal.dpeek.workers.dev/api/formless/deploy",
      "GET https://personal.dpeek.workers.dev/api/formless/setup",
      "GET https://personal.dpeek.workers.dev/api/formless/app-installs",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-provider/manual-cleanup",
    ]);
    expect(requests[3]?.headers.authorization).toBe("Bearer admin-token");
    expect(requests[7]?.headers.authorization).toBe("Bearer admin-token");
    expect(requests[11]?.headers.authorization).toBe("Bearer admin-token");
    expect(
      capturedRequestJson<{ host: string; kind: string; logicalId: string }>(requests[11]),
    ).toEqual({
      host: "old.dpeek.com",
      kind: "cloudflare-redirect-rule",
      logicalId: "primary-redirect-old-dpeek-com",
    });
    expect(logs).toEqual([
      [
        "Instance domain route forgotten.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Route: draft.dpeek.com (publicSite).",
        "Reason: disabled-unapplied.",
        "Remaining desired routes: 0.",
      ].join("\n"),
      [
        "Instance domain redirect forgotten.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Redirect: old.dpeek.com.",
        "Reason: disabled-unapplied.",
        "Remaining desired redirects: 0.",
      ].join("\n"),
      [
        "Instance domain provider evidence marked manually removed.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Resource: old.dpeek.com cloudflare-redirect-rule primary-redirect-old-dpeek-com.",
        "Action: manually-removed.",
      ].join("\n"),
    ]);
  });

  it("applies instance domains and records Cloudflare evidence", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");
    const requests: CapturedFetchRequest[] = [];
    const logs: string[] = [];

    await writeWorkspaceManifest(workspaceRoot, {
      domains: [
        { enabled: true, host: "admin.dpeek.com", profile: "instance" },
        {
          enabled: false,
          host: "disabled.dpeek.com",
          profile: "publicSite",
          targetInstallId: "david",
        },
        { enabled: true, host: "dpeek.com", profile: "publicSite", targetInstallId: "david" },
        {
          enabled: true,
          host: "www.dpeek.com",
          profile: "publicSite",
          targetInstallId: "david",
        },
      ],
    });

    await runFormlessCli(
      [
        "instance",
        "domains",
        "apply",
        "--workspace",
        workspaceRoot,
        "--policy",
        "create-only",
        "--admin-token",
        "admin-token",
      ],
      cliDeps(tempDir, {
        cloudflareDomainClient: fakeCloudflareDomainClient({
          dnsRecords: {},
          workerDomains: [],
          workerRoutes: {},
          zonesByName: {
            "dpeek.com": [{ id: "zone-1", name: "dpeek.com", status: "active" }],
          },
        }),
        fetch: domainMappingFetch(requests, [
          instanceDomainMapping("admin.dpeek.com"),
          domainMapping("dpeek.com", "david"),
          domainMapping("www.dpeek.com", "david"),
          { ...domainMapping("disabled.dpeek.com", "david"), enabled: false },
        ]),
        logs,
      }),
    );

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://personal.dpeek.workers.dev/api/formless/domain-mappings",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-mappings/apply-evidence",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-mappings/apply-evidence",
      "POST https://personal.dpeek.workers.dev/api/formless/domain-mappings/apply-evidence",
    ]);
    expect(requests.some((request) => request.url.includes("/api/formless/deployments/"))).toBe(
      false,
    );
    expect(requests[1]?.headers.authorization).toBe("Bearer admin-token");
    expect(
      capturedRequestJson<{
        action: string;
        host: string;
        profile: string;
        workerDomainId: string;
      }>(requests[1]),
    ).toMatchObject({
      action: "created",
      host: "admin.dpeek.com",
      profile: "instance",
      workerDomainId: "domain-admin.dpeek.com",
    });
    expect(logs).toEqual([
      [
        "Instance domain direct Cloudflare fallback apply complete.",
        `Workspace: ${path.relative(tempDir, workspaceRoot)}.`,
        "Target: remote (https://personal.dpeek.workers.dev).",
        "Account: account-123.",
        "Worker: personal.",
        "Policy: create-only.",
        "Domains: admin.dpeek.com, dpeek.com, www.dpeek.com.",
        "Evidence writes: 3.",
        "admin.dpeek.com: created; profile instance; custom domain domain-admin.dpeek.com; worker personal; zone dpeek.com (zone-1)",
        "dpeek.com: created; profile publicSite:david; custom domain domain-dpeek.com; worker personal; zone dpeek.com (zone-1)",
        "www.dpeek.com: created; profile publicSite:david; custom domain domain-www.dpeek.com; worker personal; zone dpeek.com (zone-1)",
      ].join("\n"),
    ]);
  });

  it("requires explicit host selection for domain override apply", async () => {
    const tempDir = await makeTempDir();
    const workspaceRoot = path.join(tempDir, "personal-sites");

    await writeWorkspaceManifest(workspaceRoot, {
      domains: [
        { enabled: true, host: "www.dpeek.com", profile: "publicSite", targetInstallId: "david" },
      ],
    });

    await expect(
      runFormlessCli(
        ["instance", "domains", "apply", "--workspace", workspaceRoot, "--policy", "override"],
        cliDeps(tempDir, {
          fetch: domainMappingFetch([]),
        }),
      ),
    ).rejects.toThrow("formless instance domains apply --policy override requires --host");
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
      "schema-owned-control-plane",
      "app-store-snapshots",
      "core-media-assets",
    ]);
    expect(restoreBody.archive.apps.map((app) => app.app.installId)).toEqual(["david"]);
    expect(restoreBody.archive.controlPlane?.records.map((record) => record.entity)).toEqual([
      "appInstall",
      "appRoute",
      "appRoute",
      "appRoute",
      "deployTarget",
      "providerConfigRef",
    ]);
    expect(logs).toHaveLength(1);
    const lines = logs[0]?.split("\n") ?? [];

    expect(lines.slice(0, 17)).toEqual([
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
      "Changed control-plane records: none.",
      "Changed media: david.",
      "Changed domain mappings: none.",
    ]);
    expect(logs[0]).toContain("Upgrade target facts.");
    expect(logs[0]).toContain(
      "Archive input: kind=formless.instanceArchive; version=2; readable=yes; archivePath=",
    );
    expect(logs[0]).toContain(
      "Upgrade plan.\nTarget: label=remote, url=https://personal.dpeek.workers.dev, archivePath=",
    );
    expect(lines.slice(-2)).toEqual([
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
      "Changed control-plane records: none.",
      "Changed media: none.",
      "Changed domain mappings: none.",
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
        FORMLESS_DOMAIN_PROVIDER_CLOUDFLARE_ACCOUNT_ID: "account-123",
        FORMLESS_DOMAIN_PROVIDER_INSTANCE_ID: "personal",
        FORMLESS_DOMAIN_PROVIDER_WORKER_NAME: "personal",
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

  it("does not retarget old Site media keys or hrefs during app archive restore", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "legacy-site-media-backup");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];
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

    expect(restoreBody.archive.app.installId).toBe("personal-copy");
    expect(restoreBody.archive.media.objects[0]).toMatchObject({
      deliveryHref: legacyHref,
      storageKey: legacyStorageKey,
    });
    expect(
      restoreBody.archive.data.kind === "storeSnapshot"
        ? restoreBody.archive.data.snapshot.records[0]?.values.href
        : undefined,
    ).toBe(legacyHref);
    expect(restoreBody.mediaFiles[0]?.bytesBase64).toBe(Buffer.from([4, 5, 6]).toString("base64"));
    expect(JSON.stringify(restoreBody.archive)).not.toContain("personal-copy/site/images");
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
          ...packageAppFactsForKey("tasks")!,
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
      packageRevision: packageAppFactsForKey("tasks")!.packageRevision,
      sourceSchemaKey: "tasks",
      sourceSchemaHash: packageAppFactsForKey("tasks")!.sourceSchemaHash,
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
          ...packageAppFactsForKey("site")!,
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
          ...packageAppFactsForKey("tasks")!,
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
          ...packageAppFactsForKey("estii")!,
          schemaRoute: "/apps/rates/schema",
          status: "installed",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
    });
    responses.queueJson({ error: "not found" }, 404);
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
        packageAppFactsForKey("site")!.packageRevision,
        packageAppFactsForKey("site")!.sourceSchemaHash,
      ],
      [
        "rates",
        "estii",
        packageAppFactsForKey("estii")!.packageRevision,
        packageAppFactsForKey("estii")!.sourceSchemaHash,
      ],
      [
        "work",
        "tasks",
        packageAppFactsForKey("tasks")!.packageRevision,
        packageAppFactsForKey("tasks")!.sourceSchemaHash,
      ],
    ]);
    expect(archive.capabilities).toEqual([
      "installed-app-registry",
      "app-store-snapshots",
      "core-media-assets",
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
      "GET https://instance.example/api/formless/control-plane/bootstrap?actorKind=cliDeployer",
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

  it("adds upgrade planning to archive restore dry-run without mutating target", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "instance-restore");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];

    await writeArchiveDirectory(outDir, instanceArchive([appArchive("david", "David Peek")]));
    responses.queueJson(
      {
        packageApps: listBundledAppPackages().map((appPackage) => ({
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
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(restorePlan({ replacedInstalls: ["david"] }));

    await runFormlessCli(
      ["archive", "restore", "--target", "https://instance.example", "--archive", outDir],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
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
    expect(logs.at(-1)).toContain("Upgrade target facts.");
    expect(logs.at(-1)).toContain(
      `Archive input: kind=formless.instanceArchive; version=2; readable=yes; archivePath=${path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE)}.`,
    );
    expect(logs.at(-1)).toContain(`packageVersion=0.1.7->${packageJson.version}`);
    expect(logs.at(-1)).toContain("Archive restore dry run ok.");
  });

  it("normalizes older supported archive restore dry-runs before posting to the target", async () => {
    const tempDir = await makeTempDir();
    const outDir = path.join(tempDir, "legacy-instance-restore");
    const requests: CapturedFetchRequest[] = [];
    const responses = responseQueue();
    const logs: string[] = [];

    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE),
      `${JSON.stringify(legacyV1Archive(instanceArchive([appArchive("david", "David Peek")])), null, 2)}\n`,
    );
    responses.queueJson(currentDeployMetadata(), 200, { "Cache-Control": "no-store" });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("david", "David Peek")],
    });
    responses.queueJson(restorePlan({ replacedInstalls: ["david"] }));

    await runFormlessCli(
      ["archive", "restore", "--target", "https://instance.example", "--archive", outDir],
      cliDeps(tempDir, {
        fetch: responses.fetcher(requests),
        logs,
      }),
    );

    const restoreRequest = requests.at(-1);
    const restoreBody = capturedRequestJson<{ archive: InstanceArchive }>(restoreRequest);

    expect(restoreBody.archive.version).toBe(ARCHIVE_VERSION);
    expect(restoreBody.archive.apps[0]?.app).toMatchObject({
      packageRevision: packageAppFactsForKey("site")!.packageRevision,
      sourceSchemaHash: packageAppFactsForKey("site")!.sourceSchemaHash,
    });
    expect(logs.at(-1)).toContain(
      `Archive input: kind=formless.instanceArchive; version=1; readable=yes; archivePath=${path.join(outDir, PORTABLE_ARCHIVE_MANIFEST_FILE)}.`,
    );
    expect(logs.at(-1)).toContain("archive-normalization [ready] safety=auto-with-backup");
    expect(logs.at(-1)).toContain(
      "Archive normalization: archive.instance.v1-to-v2.package-facts formless.instanceArchive version 1->2.",
    );
    expect(logs.at(-1)).toContain("Archive restore dry run ok.");
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
      runFormlessCli(
        [
          "archive",
          "restore",
          "--target",
          "https://instance.example",
          "--archive",
          outDir,
          "--apply",
        ],
        cliDeps(tempDir, {
          fetch: responseQueue().fetcher(requests),
        }),
      ),
    ).rejects.toThrow(
      "Archive version 0 has no registered normalizer for formless.instanceArchive.",
    );
    expect(requests).toEqual([]);
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

    responses.queueJson(currentDeployMetadata(), 200, { "Cache-Control": "no-store" });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("site", "Site")],
    });
    responses.queueJson(upgradeStatusResponse("site", "site"));
    responses.queueJson(upgradeStatusResponse("site", "site"));
    responses.queueJson(packageMigrationApplyResponse("site"));
    responses.queueJson(upgradeStatusResponse("site", "site"));
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
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
      "POST https://live.example/api/formless/upgrade/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "POST https://live.example/api/formless/app-installs/site/site/package-migrations/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "GET https://live.example/api/site/snapshot",
      "PUT https://live.example/api/formless/media/media/images/cover.png",
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/",
      "GET https://live.example/about",
    ]);
    expect(requests[3]?.headers.authorization).toBe("Bearer local-token");
    expect(requests[5]?.headers.authorization).toBe("Bearer local-token");
    expect(requests[8]?.headers).toMatchObject({
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

  it("adds upgrade planning to Site project publish dry-run without mutating target", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
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
    const logs: string[] = [];

    await writeFileTree(projectRoot, publishRecords(), config);
    responses.queueJson(
      {
        packageApps: listBundledAppPackages().map((appPackage) => ({
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
      packages: listBundledAppPackages(),
      installs: [
        {
          adminRoute: "/apps/site",
          createdAt: "2026-05-28T00:00:00.000Z",
          installId: "site",
          label: "Site",
          packageAppKey: "site",
          packageRevision: 1,
          publicRoute: "/sites/site",
          publicRoutePrefix: "/sites/site/",
          schemaRoute: "/apps/site/schema",
          sourceSchemaHash: listBundledAppPackages()[0]?.sourceSchemaHash,
          status: "installed",
          updatedAt: "2026-05-28T00:00:00.000Z",
        },
      ],
    });

    await runFormlessCli(
      ["publish", "--project", projectRoot, "--dry-run"],
      cliDeps(tempDir, {
        commands,
        fetch: responses.fetcher(requests),
        logs,
        packageRoot: "/package",
      }),
    );

    expect(commands).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
    ]);
    expect(requests.some((request) => request.url.includes("/api/site/snapshot"))).toBe(false);
    expect(logs.some((log) => log.includes("Upgrade target facts."))).toBe(true);
    expect(logs.some((log) => log.includes(`packageVersion=0.1.7->${packageJson.version}`))).toBe(
      true,
    );
    expect(logs.at(-1)).toBe(
      `Site project publish dry run: ${publishRecords().length} records for https://live.example.`,
    );
  });

  it("stops Site project publish dry-run on upgrade metadata verification failure", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
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
    const logs: string[] = [];

    await writeFileTree(projectRoot, publishRecords(), config);
    responses.queueJson({ version: "0.1.7" });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [
        {
          adminRoute: "/apps/site",
          createdAt: "2026-05-28T00:00:00.000Z",
          installId: "site",
          label: "Site",
          packageAppKey: "site",
          publicRoute: "/sites/site",
          publicRoutePrefix: "/sites/site/",
          schemaRoute: "/apps/site/schema",
          status: "installed",
          updatedAt: "2026-05-28T00:00:00.000Z",
        },
      ],
    });

    await expect(
      runFormlessCli(
        ["publish", "--project", projectRoot, "--dry-run"],
        cliDeps(tempDir, {
          commands,
          fetch: responses.fetcher(requests),
          logs,
          packageRoot: "/package",
        }),
      ),
    ).rejects.toThrow("Upgrade planning blocked: deploy-metadata-cacheable");

    expect(commands).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
    ]);
    expect(requests.some((request) => request.url.includes("/api/site/snapshot"))).toBe(false);
    expect(logs.at(-1)).toContain("Blockers: deploy-metadata-cacheable");
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
    responses.queueJson(currentDeployMetadata(), 200, { "Cache-Control": "no-store" });
    responses.queueJson({ setupComplete: true });
    responses.queueJson({
      packages: listBundledAppPackages(),
      installs: [installedSite("site", "Site")],
    });
    responses.queueJson(upgradeStatusResponse("site", "site"));
    responses.queueJson(upgradeStatusResponse("site", "site"));
    responses.queueJson(packageMigrationApplyResponse("site"));
    responses.queueJson(upgradeStatusResponse("site", "site"));
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
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
      "POST https://live.example/api/formless/upgrade/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "POST https://live.example/api/formless/app-installs/site/site/package-migrations/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "GET https://live.example/api/site/snapshot",
      "PUT https://live.example/api/formless/media/media/images/cover.png",
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/",
      "GET https://live.example/about",
    ]);
    expect(requests[6]?.headers.authorization).toBe("Bearer local-token");
    expect(requests[8]?.headers.authorization).toBe("Bearer local-token");
    expect(requests[11]?.headers.authorization).toBe("Bearer local-token");
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
  const tempDir = await mkdtemp(path.resolve("tmp/test/site-cli-test-"));

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
      ...(options.domains === undefined ? {} : { domains: options.domains }),
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
  const facts = packageAppFactsForKey(packageAppKey);

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

function currentDeployMetadata() {
  return {
    packageApps: listBundledAppPackages().map((appPackage) => ({
      packageAppKey: appPackage.packageAppKey,
      packageRevision: appPackage.packageRevision,
      sourceSchemaHash: appPackage.sourceSchemaHash,
    })),
    packageVersion: packageJson.version,
    runtimeProtocolVersion: FORMLESS_RUNTIME_PROTOCOL_VERSION,
    storageMigrationSet: FORMLESS_STORAGE_MIGRATION_SET_ID,
    version: packageJson.version,
  };
}

function packageMigrationApplyResponse(packageAppKey: "site" | "tasks") {
  const facts = packageAppFactsForKey(packageAppKey);

  if (!facts) {
    throw new Error(`Missing bundled package facts for ${packageAppKey}.`);
  }

  return {
    applied: [],
    changes: [],
    cursor: 0,
    packageAppKey,
    packageRevision: facts.packageRevision,
    schemaUpdatedAt: "2026-05-12T02:00:00.000Z",
    skipped: [],
    sourceSchemaHash: facts.sourceSchemaHash,
  };
}

function upgradeStatusResponse(installId: string, packageAppKey: "site" | "tasks") {
  const facts = packageAppFactsForKey(packageAppKey);

  if (!facts) {
    throw new Error(`Missing bundled package facts for ${packageAppKey}.`);
  }

  return {
    storageIdentities: [
      {
        identity: {
          authorityName: "__formless_instance__",
          kind: "instance",
        },
        sqlMigrations: [
          {
            appliedAt: "2026-05-12T02:00:00.000Z",
            checksum: "sha256:0d3e904259214f8c83da95033fc8be3ca8f1502b44471fb47fa6f11000102f12",
            migrationId: "2026-05-28-instance-app-installs-package-facts",
            packageVersion: packageJson.version,
            storageFamily: "instance-app-installs",
          },
        ],
      },
      {
        identity: {
          authorityName: `app:${installId}`,
          installId,
          kind: "appInstall",
          packageAppKey,
        },
        packageAppMigrations: {
          applied: [],
          state: {
            packageAppKey,
            packageRevision: facts.packageRevision,
            sourceSchemaHash: facts.sourceSchemaHash,
            updatedAt: "2026-05-12T02:00:00.000Z",
          },
        },
        sqlMigrations: [],
      },
    ],
  };
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
  const packageFacts = packageAppFactsForKey(packageAppKey);

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
          packageApps: listBundledAppPackages().map((appPackage) => ({
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
        packages: [...listBundledAppPackages(), ...extraPackages],
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

function domainMappingFetch(
  requests: CapturedFetchRequest[],
  domainMappings: Array<
    ReturnType<typeof domainMapping> | ReturnType<typeof instanceDomainMapping>
  > = [
    domainMapping("dpeek.com", "david"),
    domainMapping("www.dpeek.com", "david"),
    { ...domainMapping("disabled.dpeek.com", "david"), enabled: false },
  ],
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

    if (parsedUrl.pathname === "/api/formless/domain-mappings") {
      return Response.json({
        appliedStates: [],
        auditEvents: [],
        mappings: domainMappings,
      });
    }

    if (parsedUrl.pathname === "/api/formless/domain-mappings/apply-evidence") {
      const evidence =
        typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      const appliedState = {
        ...evidence,
        appliedAt: "2026-05-26T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
      };
      const auditEvent = { eventId: 1, ...appliedState };

      return Response.json({
        appliedState,
        appliedStates: [appliedState],
        auditEvent,
        auditEvents: [auditEvent],
      });
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
  } = {},
): StoredRecord[] {
  const host = options.host ?? "dpeek.com";
  const installId = options.installId ?? "david";
  const adminRouteId = `app-route:${installId}:admin`;
  const publicRouteId = `app-route:${installId}:publicSite`;
  const schemaRouteId = `app-route:${installId}:schema`;
  const domainMappingId = `domain-mapping:publicSite:${host}`;
  const deployTargetId = "instance.primary";
  const now = "2026-05-26T00:00:00.000Z";

  return [
    {
      id: installId,
      entity: "appInstall",
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
      entity: "appRoute",
      values: {
        appInstall: installId,
        routeKind: "admin",
        path: `/apps/${installId}`,
        surface: "admin",
        packageCapability: "generatedApp",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: publicRouteId,
      entity: "appRoute",
      values: {
        appInstall: installId,
        routeKind: "publicSite",
        path: `/sites/${installId}`,
        prefix: `/sites/${installId}/`,
        surface: "publicSite",
        packageCapability: "publicSite",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: schemaRouteId,
      entity: "appRoute",
      values: {
        appInstall: installId,
        routeKind: "schema",
        path: `/apps/${installId}/schema`,
        surface: "schema",
        packageCapability: "schema",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: domainMappingId,
      entity: "domainMapping",
      values: {
        host,
        profile: "publicSite",
        appInstall: installId,
        appRoute: publicRouteId,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: deployTargetId,
      entity: "deployTarget",
      values: {
        targetId: deployTargetId,
        targetKind: "instance",
        label: deployTargetId,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "provider-config:cloudflare:personal",
      entity: "providerConfigRef",
      values: {
        providerFamily: "cloudflare",
        configRef: "provider-config:cloudflare:personal",
        label: "Cloudflare",
        accountId: "account-123",
        workerName: "personal",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: `deploy-resource:${deployTargetId}:custom-domain:${host}`,
      entity: "deployDesiredResource",
      values: {
        deployTarget: deployTargetId,
        domainMapping: domainMappingId,
        logicalId: `custom-domain:${host}`,
        kind: "cloudflare-worker-custom-domain",
        providerFamily: "cloudflare",
        inputsJson: JSON.stringify({ host, routePath: `/sites/${installId}` }),
        enabled: true,
        sourceFingerprint: "workspace",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: `deploy-drift:${deployTargetId}`,
      entity: "deployDriftReport",
      values: {
        deployTarget: deployTargetId,
        versionId: "version-1",
        desiredStateHash: "hash-1",
        revision: 1,
        status: options.driftStatus ?? "in-sync",
        actorKind: "runner",
        actorId: "runner",
        affectedLogicalIdsJson: "[]",
        createCount: 0,
        updateCount: 0,
        deleteCount: 0,
        reportedAt: now,
      },
      createdAt: now,
    },
  ];
}

function instanceDomainMapping(host: string) {
  return {
    createdAt: "2026-05-26T00:00:00.000Z",
    enabled: true,
    host,
    profile: "instance",
    updatedAt: "2026-05-26T00:00:00.000Z",
  };
}

function pushArchiveFetch(
  requests: CapturedFetchRequest[],
  installs: ReturnType<typeof installedApp>[],
  dataByInstall: Record<string, { mediaBytes?: Uint8Array; records: StoredRecord[] }>,
  restoreResponses: unknown[],
  extraPackages: BundledAppPackage[] = [],
  domainMappings: ReturnType<typeof domainMapping>[] = [],
  controlPlaneRecords?: StoredRecord[],
): typeof fetch {
  const readFetch = archiveFetch(
    requests,
    installs,
    dataByInstall,
    extraPackages,
    domainMappings,
    controlPlaneRecords,
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

function fakeCloudflareDomainClient(input: {
  dnsRecords: Record<string, CloudflareDnsRecord[]>;
  workerDomains: CloudflareWorkerDomain[];
  workerRoutes: Record<string, CloudflareWorkerRoute[]>;
  zonesByName: Record<string, CloudflareZone[]>;
}): CloudflareDomainClient {
  return {
    attachWorkerDomain: async ({ hostname, service, zoneId }) => ({
      hostname,
      id: `domain-${hostname}`,
      service,
      zoneId,
      zoneName: "dpeek.com",
    }),
    listActiveZonesForName: async ({ name }) => input.zonesByName[name] ?? [],
    listDnsRecords: async ({ name }) => input.dnsRecords[name] ?? [],
    listRedirectRules: async () => [],
    listWorkerDomains: async () => input.workerDomains,
    listWorkerRoutes: async ({ zoneId }) => input.workerRoutes[zoneId] ?? [],
  };
}

function cliDeps(
  cwd: string,
  options: {
    cloudflareDomainClient?: CloudflareDomainClient;
    commands?: CapturedCommand[];
    deploy?: (input: DeployFormlessInstanceInput) => Promise<{ url: string }>;
    domainProviderApplyRuntime?: FormlessCliDependencies["domainProviderApplyRuntime"];
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
    },
    ...(options.domainProviderApplyRuntime === undefined
      ? {}
      : { domainProviderApplyRuntime: options.domainProviderApplyRuntime }),
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
    queueJson: (value: unknown, status = 200, headers?: HeadersInit) =>
      responses.push(Response.json(value, { headers, status })),
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
