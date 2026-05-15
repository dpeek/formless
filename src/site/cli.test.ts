import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
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
  normalizeSourceUrl,
  parseFormlessCliArgs,
  publishSiteProject,
  saveSiteProject,
  setupSiteProjectDeploy,
  startSiteProjectLocalPublishBroker,
  type FormlessCliDependencies,
  type FormlessCliRunCommandOptions,
} from "./cli.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Formless Site CLI", () => {
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

  it("initializes a Site project with config, deterministic records, and starter media", async () => {
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
    expect(result.mediaCount).toBe(mediaAssets.length);

    for (const asset of mediaAssets) {
      await expect(
        readFile(path.join(result.projectRoot, asset.sourcePath)),
      ).resolves.toBeInstanceOf(Buffer);
    }

    await expect(
      initSiteProject({ targetDir: "my-site" }, { cwd: tempDir, packageRoot: process.cwd() }),
    ).rejects.toThrow("target already contains");
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
      "bun x wrangler r2 bucket create brother-site-media",
      `bun x wrangler secret bulk ${path.join(projectRoot, ".formless/deploy.env")} --name brother-site`,
    ]);
    expect(commands.every((command) => command.cwd === "/package")).toBe(true);
    expect(commands.every((command) => command.env?.CLOUDFLARE_ACCOUNT_ID === "account-123")).toBe(
      true,
    );
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
      "bun run build",
      "bun x wrangler deploy --name brother-site --var FORMLESS_RUNTIME_PROFILE:publishedSite",
    ]);
    expect(commands[0]?.env).toMatchObject({
      FORMLESS_RUNTIME_PROFILE: "publishedSite",
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

  it("brokers local admin publish through CLI-owned save and publish steps", async () => {
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
    expect(commands.map((command) => [command.command, ...command.args].join(" "))).toEqual([
      "bun run build",
      "bun x wrangler deploy --name brother-site --var FORMLESS_RUNTIME_PROFILE:publishedSite",
    ]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:5173/api/site/snapshot",
      "GET http://localhost:5173/api/site/media/site/images/cover.png",
      "GET https://live.example/api/site/snapshot",
      "PUT https://live.example/api/site/media/site/images/cover.png",
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/",
      "GET https://live.example/about",
    ]);
    expect(requests[3]?.headers.authorization).toBe("Bearer local-token");
  });

  it("normalizes local source URLs", () => {
    expect(normalizeSourceUrl("http://localhost:5173/pages/home?x=1#top")).toBe(
      "http://localhost:5173/pages/home",
    );
    expect(() => normalizeSourceUrl("not a url")).toThrow("Source URL is invalid: not a url");
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
    fetch?: typeof fetch;
    packageRoot?: string;
  } = {},
): FormlessCliDependencies {
  return {
    cwd,
    env: {},
    fetch: options.fetch ?? fetch,
    log: () => {},
    now: () => "2026-05-12T02:00:00.000Z",
    packageRoot: options.packageRoot ?? process.cwd(),
    randomToken: () => "generated-token",
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
  };
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
      href: "/api/site/media/site/images/cover.png",
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
