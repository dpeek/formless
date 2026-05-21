import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
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
  SITE_PROJECT_CONFIG_FILE,
  SITE_PROJECT_RECORDS_FILE,
} from "./project-config.ts";
import { formatSiteProjectRecords } from "./project-source.ts";
import {
  readSiteProjectDevStateSource,
  runSiteProjectDev,
  siteProjectStorageId,
  type SiteProjectDevDependencies,
} from "./project-dev.ts";
import type { SiteProjectSource } from "./project-files.ts";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => rm(tempDir, { force: true, recursive: true })),
  );
});

describe("Site project dev loop", () => {
  it("orchestrates process env, readiness, authority restore, and dev state", async () => {
    const tempDir = await makeTempDir();
    const projectRoot = path.join(tempDir, "site");
    const records = mediaRecords();
    const projectId = siteProjectStorageId(projectRoot);
    const child = new FakeDevChild();
    const logs: string[] = [];
    const requests: CapturedFetchRequest[] = [];
    const spawnCalls: CapturedSpawn[] = [];
    let brokerClosed = false;
    const broker = {
      source: null as (() => string | null) | null,
    };
    let configuredProject: SiteProjectSource | null = null;

    await writeFileTree(projectRoot, records);
    await mkdir(path.join(projectRoot, "media/site/images"), { recursive: true });
    await writeFile(path.join(projectRoot, "media/site/images/cover.png"), Buffer.from([1, 2, 3]));

    const run = runSiteProjectDev(
      { projectPath: "site" },
      {
        cwd: tempDir,
        env: { FORMLESS_ADMIN_TOKEN: "secret", KEEP: "value", PORT: "4444" },
        fetch: devFetch(requests),
        log: (message) => {
          logs.push(message);
        },
        now: () => "2026-05-12T02:00:00.000Z",
        packageRoot: "/package",
        spawn: ((command: string, args: string[], options: CapturedSpawnOptions) => {
          spawnCalls.push({
            args,
            command,
            cwd: options.cwd,
            env: options.env,
          });
          return child as unknown as ChildProcessWithoutNullStreams;
        }) as typeof nodeSpawn,
      } satisfies SiteProjectDevDependencies,
      {
        devCommand: {
          args: ["run", "dev"],
          command: "npm",
          label: "npm run dev",
        },
        isPublishConfigured: async (project) => {
          configuredProject = project;
          return true;
        },
        startLocalPublishBroker: async (input) => {
          broker.source = input.source;

          return {
            close: async () => {
              brokerClosed = true;
            },
            endpoint: "http://127.0.0.1:12345/publish",
            token: "broker-token",
          };
        },
      },
    );

    await waitUntil(() => logs.includes("Admin: http://localhost:4444/admin"));

    const brokerSource = broker.source;

    if (!brokerSource) {
      throw new Error("Expected local publish broker source callback.");
    }

    expect(brokerSource()).toBe("http://localhost:4444");
    child.close(0);
    await run;

    expect(configuredProject).toMatchObject({ projectRoot });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toMatchObject({
      args: ["run", "dev"],
      command: "npm",
      cwd: "/package",
    });
    expect(spawnCalls[0]?.env).toMatchObject({
      FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
      FORMLESS_SITE_PROJECT_ID: projectId,
      FORMLESS_SITE_PROJECT_ROOT: projectRoot,
      FORMLESS_WRANGLER_PERSIST: path.join(projectRoot, ".formless/wrangler"),
      KEEP: "value",
      VITE_FORMLESS_LOCAL_PUBLISH_BROKER_TOKEN: "broker-token",
      VITE_FORMLESS_LOCAL_PUBLISH_BROKER_URL: "http://127.0.0.1:12345/publish",
      VITE_FORMLESS_RUNTIME_PROFILE: "siteAuthoring",
      VITE_FORMLESS_SITE_PROJECT_ID: projectId,
    });
    expect(spawnCalls[0]?.env).not.toHaveProperty("FORMLESS_ADMIN_TOKEN");
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET http://localhost:4444/api/site/bootstrap",
      "PUT http://localhost:4444/api/site/media/site/images/cover.png",
      "POST http://localhost:4444/api/site/snapshot/restore",
    ]);
    expect(Buffer.from(requests[1]?.body as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));

    const restoredSnapshot = JSON.parse(requestBodyText(requests[2]?.body)) as StoreSnapshot;

    expect(restoredSnapshot).toMatchObject({
      exportedAt: "2026-05-12T02:00:00.000Z",
      kind: STORE_SNAPSHOT_KIND,
      records,
      schema: siteSourceSchema,
      schemaKey: "site",
      sourceCursor: 0,
      version: STORE_SNAPSHOT_VERSION,
    });
    await expect(readFile(path.join(projectRoot, ".formless/dev.json"), "utf8")).resolves.toBe(
      `${JSON.stringify(
        {
          adminUrl: "http://localhost:4444/admin",
          projectId,
          publicUrl: "http://localhost:4444/",
          sourceUrl: "http://localhost:4444",
          startedAt: "2026-05-12T02:00:00.000Z",
        },
        null,
        2,
      )}\n`,
    );
    await expect(readSiteProjectDevStateSource(projectRoot)).resolves.toBe("http://localhost:4444");
    await expect(readFile(path.join(projectRoot, ".gitignore"), "utf8")).resolves.toBe(
      ".formless/\n",
    );
    expect(logs).toEqual([
      "Public preview: http://localhost:4444/",
      "Admin: http://localhost:4444/admin",
    ]);
    expect(brokerClosed).toBe(true);
    expect(child.killed).toBe(false);
  });
});

class FakeDevChild extends EventEmitter {
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

async function makeTempDir(): Promise<string> {
  const tempDir = await mkdtemp(path.resolve(".site-project-dev-test-"));

  tempDirs.push(tempDir);
  return tempDir;
}

async function writeFileTree(projectRoot: string, records: StoredRecord[]) {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    path.join(projectRoot, SITE_PROJECT_CONFIG_FILE),
    formatSiteProjectConfig(defaultSiteProjectConfig()),
  );
  await writeFile(
    path.join(projectRoot, SITE_PROJECT_RECORDS_FILE),
    formatSiteProjectRecords(records),
  );
}

function devFetch(requests: CapturedFetchRequest[]): typeof fetch {
  return async (url, init) => {
    const requestUrl =
      typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    requests.push({
      body: init?.body,
      headers: normalizeHeaders(init?.headers),
      method: init?.method ?? "GET",
      url: requestUrl,
    });

    if (requestUrl === "http://localhost:4444/api/site/bootstrap") {
      return Response.json({ ok: true });
    }

    if (
      requestUrl === "http://localhost:4444/api/site/media/site/images/cover.png" &&
      init?.method === "PUT"
    ) {
      return Response.json({ ok: true });
    }

    if (
      requestUrl === "http://localhost:4444/api/site/snapshot/restore" &&
      init?.method === "POST"
    ) {
      return Response.json({ ok: true });
    }

    return Response.json({ error: "not found" }, { status: 404 });
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

function requestBodyText(body: BodyInit | null | undefined): string {
  if (typeof body === "string") {
    return body;
  }

  throw new Error("Expected request body text.");
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
