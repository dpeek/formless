import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
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
    await expect(readFile(path.join(projectRoot, "media/site/images/cover.png"))).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );

    await expect(
      saveSiteProject(
        { check: true, projectPath: projectRoot, source: "https://local.test" },
        { cwd: tempDir, fetch: fetcher },
      ),
    ).resolves.toMatchObject({ mode: "check" });

    await writeFile(path.join(projectRoot, "media/site/images/cover.png"), Buffer.from([9]));
    await expect(
      saveSiteProject(
        { check: true, projectPath: projectRoot, source: "https://local.test" },
        { cwd: tempDir, fetch: fetcher },
      ),
    ).rejects.toThrow("Site project source is stale: media/site/images/cover.png.");
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
      "PUT https://live.example/api/site/media/site/images/cover.png",
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
    await expect(readFile(path.join(projectRoot, "media/site/images/cover.png"))).resolves.toEqual(
      Buffer.from([7, 8, 9]),
    );
    expect(commands).toEqual([]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/site/snapshot",
      "GET http://localhost:5173/api/site/media/site/images/cover.png",
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/site/snapshot",
      "PUT https://live.example/api/site/media/site/images/cover.png",
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

type CapturedFetchRequest = {
  body: BodyInit | null | undefined;
  headers: Record<string, string>;
  method: string;
  url: string;
};

async function writeFileTree(
  projectRoot: string,
  records: StoredRecord[],
  config = defaultSiteProjectConfig(),
) {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(path.join(projectRoot, "formless.config.json"), formatSiteProjectConfig(config));
  await writeFile(path.join(projectRoot, "site.records.json"), formatSiteProjectRecords(records));
}

function cliDeps(
  cwd: string,
  options: {
    commands?: CapturedCommand[];
    deploy?: (input: DeployFormlessInstanceInput) => Promise<{ url: string }>;
    fetch?: typeof fetch;
    healthInputs?: CheckFormlessInstanceDeployMetadataInput[];
    logs?: string[];
    openedUrls?: string[];
    packageRoot?: string;
    setupInputs?: CreateFormlessInstanceOwnerSetupCapabilityInput[];
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
    env: {},
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
    spawn,
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

    if (requestUrl === "https://local.test/api/site/media/site/images/cover.png") {
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
