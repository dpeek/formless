import { describe, expect, it } from "vite-plus/test";

import {
  parseSitePublishArgs,
  runSitePublish,
  type SitePublishDependencies,
  type SitePublishHttpResponse,
  type SitePublishOptions,
} from "./publish.ts";
import { buildSiteSourceSnapshot } from "./source-snapshot.ts";
import { siteSourceMediaAssetsFromRecords } from "./source-media.ts";
import type { StoredRecord } from "../shared/protocol.ts";
import { siteSeedRecords, siteSourceSchema } from "../test/schema-apps.ts";

describe("Site publish workflow", () => {
  const sourceMediaAssets = siteSourceMediaAssetsFromRecords(siteSeedRecords);

  it("parses a dry-run command by default and exposes safe apply modes", () => {
    expect(parseSitePublishArgs([], {})).toEqual({
      apply: false,
      backupDir: "tmp/site-publish-backups",
      code: true,
      data: true,
      skipCheck: false,
      target: null,
    });

    expect(
      parseSitePublishArgs(
        ["--apply", "--data-only", "--skip-check", "--target", "https://live.example/path"],
        {},
      ),
    ).toEqual({
      apply: true,
      backupDir: "tmp/site-publish-backups",
      code: false,
      data: true,
      skipCheck: true,
      target: "https://live.example/path",
    });

    expect(() => parseSitePublishArgs(["--code-only", "--data-only"], {})).toThrow(
      "--code-only and --data-only cannot be used together.",
    );
  });

  it("dry-runs without commands, network calls, or backup writes", async () => {
    const harness = publishHarness({
      apply: false,
      target: "https://live.example",
    });

    const result = await runSitePublish(harness.input());

    expect(result).toEqual({
      backupPath: null,
      mode: "dry-run",
      sourceRecordCount: siteSeedRecords.length,
      target: "https://live.example",
    });
    expect(harness.commands).toEqual([]);
    expect(harness.requests).toEqual([]);
    expect(harness.writes).toEqual([]);
    expect(harness.logs).toContain("DRY RUN: Site publish workflow.");
    expect(harness.logs).toContain(
      "Dry run only. Re-run with --apply to mutate code or live data.",
    );
  });

  it("applies the default code and data publish flow", async () => {
    const harness = publishHarness({
      adminToken: "secret-token",
      apply: true,
      target: "https://live.example",
    });
    const backupSnapshot = buildSiteSourceSnapshot(siteSourceSchema, siteSeedRecords, {
      exportedAt: "2026-05-12T03:00:00.000Z",
    });
    harness.queueJson(backupSnapshot);
    for (const asset of sourceMediaAssets) {
      harness.queueJson({
        contentType: asset.contentType,
        href: asset.href,
        key: asset.key,
        size: harness.sourceMediaBytes.byteLength,
      });
    }
    harness.queueJson({
      cursor: 8,
      records: siteSeedRecords,
      schema: siteSourceSchema,
      schemaUpdatedAt: "2026-05-12T04:00:00.000Z",
    });
    harness.queueText("<!doctype html><title>Home</title>");

    const result = await runSitePublish(harness.input());

    expect(harness.commands).toEqual(["devstate check", "bun run deploy"]);
    expect(harness.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/site/snapshot",
      ...sourceMediaAssets.map((asset) => `PUT https://live.example/api/site/media/${asset.key}`),
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/pages/home",
    ]);
    expect(harness.reads).toEqual(
      sourceMediaAssets.map((asset) => `/workspace/${asset.sourcePath}`),
    );
    if (sourceMediaAssets.length > 0) {
      expect(harness.requests[1]?.headers).toMatchObject({
        authorization: "Bearer secret-token",
        "content-type": sourceMediaAssets[0]?.contentType,
      });
    }
    const restoreRequest = harness.requests[1 + sourceMediaAssets.length];

    expect(restoreRequest?.headers).toMatchObject({
      authorization: "Bearer secret-token",
      "content-type": "application/json",
    });
    const restoreBody = restoreRequest?.body;

    if (typeof restoreBody !== "string") {
      throw new Error("Expected restore request body to be JSON text.");
    }

    expect(JSON.parse(restoreBody)).toMatchObject({
      kind: "formless.storeSnapshot",
      schemaKey: "site",
      sourceCursor: 0,
    });
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes[0]?.path).toContain(
      "tmp/site-publish-backups/site-2026-05-12T02-00-00-000Z.snapshot.json",
    );
    expect(result.backupPath).toBe(harness.writes[0]?.path);
  });

  it("keeps the backup artifact path in restore failure errors", async () => {
    const harness = publishHarness({
      apply: true,
      skipCheck: true,
      target: "https://live.example",
    });
    harness.queueJson(
      buildSiteSourceSnapshot(siteSourceSchema, siteSeedRecords, {
        exportedAt: "2026-05-12T03:00:00.000Z",
      }),
    );
    for (const asset of sourceMediaAssets) {
      harness.queueJson({
        contentType: asset.contentType,
        href: asset.href,
        key: asset.key,
        size: harness.sourceMediaBytes.byteLength,
      });
    }
    harness.queueText("restore rejected", 500);

    await expect(runSitePublish(harness.input())).rejects.toThrow(
      "Backup kept at /workspace/tmp/site-publish-backups/site-2026-05-12T02-00-00-000Z.snapshot.json.",
    );

    expect(harness.commands).toEqual(["bun run deploy"]);
    expect(harness.writes).toHaveLength(1);
    expect(harness.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/site/snapshot",
      ...sourceMediaAssets.map((asset) => `PUT https://live.example/api/site/media/${asset.key}`),
      "POST https://live.example/api/site/snapshot/restore",
    ]);
  });

  it("fails before deploy when a referenced source media file is missing", async () => {
    const harness = publishHarness({
      apply: true,
      readFileError: new Error("ENOENT"),
      sourceSeedRecords: [
        {
          id: "source-image",
          entity: "block",
          values: {
            label: "Image",
            mediaAssetId: "missing.png",
            type: "image",
          },
          createdAt: "2026-05-14T00:00:00.000Z",
        },
      ],
      target: "https://live.example",
    });

    await expect(runSitePublish(harness.input())).rejects.toThrow(
      'Missing Site source media file schema/apps/site/media/media/images/missing.png. Run "bun run site:pull-seed" before publishing.',
    );

    expect(harness.commands).toEqual([]);
    expect(harness.requests).toEqual([]);
    expect(harness.writes).toEqual([]);
  });
});

type PublishHarnessOptions = Partial<SitePublishOptions> & {
  adminToken?: string;
  readFileError?: Error;
  sourceSeedRecords?: StoredRecord[];
};

type CapturedRequest = {
  body: BodyInit | null | undefined;
  headers: Record<string, string>;
  method: string;
  url: string;
};

function publishHarness(options: PublishHarnessOptions) {
  const responses: SitePublishHttpResponse[] = [];
  const commands: string[] = [];
  const logs: string[] = [];
  const requests: CapturedRequest[] = [];
  const reads: string[] = [];
  const sourceMediaBytes = new Uint8Array([1, 2, 3]);
  const writes: Array<{ contents: string; path: string }> = [];
  const mkdirs: string[] = [];
  const dependencies: SitePublishDependencies = {
    fetch: async (url, init) => {
      requests.push({
        body: init?.body,
        headers: normalizeHeaders(init?.headers),
        method: init?.method ?? "GET",
        url,
      });

      const response = responses.shift();

      if (!response) {
        throw new Error(`Unexpected request: ${url}`);
      }

      return response;
    },
    log: (message) => logs.push(message),
    mkdir: async (directoryPath) => {
      mkdirs.push(directoryPath);
    },
    now: () => "2026-05-12T02:00:00.000Z",
    readFile: async (filePath) => {
      reads.push(filePath);

      if (options.readFileError) {
        throw options.readFileError;
      }

      return sourceMediaBytes;
    },
    runCommand: async (command, args) => {
      commands.push([command, ...args].join(" "));
    },
    writeFile: async (filePath, contents) => {
      writes.push({ contents, path: filePath });
    },
  };

  return {
    commands,
    input: () => ({
      adminToken: options.adminToken,
      cwd: "/workspace",
      dependencies,
      options: {
        apply: options.apply ?? false,
        backupDir: options.backupDir ?? "tmp/site-publish-backups",
        code: options.code ?? true,
        data: options.data ?? true,
        skipCheck: options.skipCheck ?? false,
        target: options.target ?? null,
      },
      sourceSchema: siteSourceSchema,
      sourceSeedRecords: options.sourceSeedRecords ?? siteSeedRecords,
    }),
    logs,
    mkdirs,
    queueJson: (value: unknown, status = 200) =>
      responses.push(textResponse(JSON.stringify(value), status)),
    queueText: (value: string, status = 200) => responses.push(textResponse(value, status)),
    reads,
    requests,
    sourceMediaBytes,
    writes,
  };
}

function textResponse(body: string, status = 200): SitePublishHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
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
