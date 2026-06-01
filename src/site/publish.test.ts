import { describe, expect, it } from "vite-plus/test";

import packageJson from "../../package.json";
import {
  FORMLESS_RUNTIME_PROTOCOL_VERSION,
  FORMLESS_STORAGE_MIGRATION_SET_ID,
} from "../shared/deploy-metadata.ts";
import { listBundledAppPackages } from "../shared/app-installs.ts";
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
  const coreMediaSeedRecords: StoredRecord[] = [
    {
      id: "site-primary",
      entity: "site",
      values: {
        key: "primary",
        label: "Personal Site",
      },
      createdAt: "2026-05-14T00:00:00.000Z",
    },
    {
      id: "source-image",
      entity: "block",
      values: {
        label: "Image",
        mediaAssetId: "cover.png",
        type: "image",
      },
      createdAt: "2026-05-14T00:00:01.000Z",
    },
  ];
  const sourceMediaAssets = siteSourceMediaAssetsFromRecords(coreMediaSeedRecords);

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

  it("dry-runs with upgrade planning reads and without mutation", async () => {
    const harness = publishHarness({
      apply: false,
      target: "https://live.example",
    });
    harness.queueJson(
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
    harness.queueJson({ setupComplete: true });
    harness.queueJson({
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

    const result = await runSitePublish(harness.input());

    expect(result).toEqual({
      backupPath: null,
      mode: "dry-run",
      sourceRecordCount: siteSeedRecords.length,
      target: "https://live.example",
    });
    expect(harness.commands).toEqual([]);
    expect(harness.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
    ]);
    expect(harness.writes).toEqual([]);
    expect(harness.logs).toContain("DRY RUN: Site publish workflow.");
    expect(harness.logs).toContain(
      "Dry run only. Re-run with --apply to mutate code or live data.",
    );
    expect(harness.logs.at(-1)).toContain("Upgrade target facts.");
    expect(harness.logs.at(-1)).toContain(`packageVersion=0.1.7->${packageJson.version}`);
    expect(harness.logs.at(-1)).toContain("Required evidence: deploy-metadata:");
  });

  it("blocks dry-run upgrade planning on target metadata verification failures", async () => {
    const harness = publishHarness({
      apply: false,
      target: "https://live.example",
    });
    harness.queueJson({ version: "0.1.7" });
    harness.queueJson({ setupComplete: true });
    harness.queueJson({
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

    await expect(runSitePublish(harness.input())).rejects.toThrow(
      "Upgrade planning blocked: deploy-metadata-cacheable, deploy-metadata-package-version-missing",
    );

    expect(harness.commands).toEqual([]);
    expect(harness.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
    ]);
    expect(harness.writes).toEqual([]);
    expect(harness.logs.at(-1)).toContain("Blockers: deploy-metadata-cacheable");
  });

  it("applies the default code and data publish flow", async () => {
    const harness = publishHarness({
      adminToken: "secret-token",
      apply: true,
      sourceSeedRecords: coreMediaSeedRecords,
      target: "https://live.example",
    });
    const backupSnapshot = buildSiteSourceSnapshot(siteSourceSchema, coreMediaSeedRecords, {
      exportedAt: "2026-05-12T03:00:00.000Z",
    });
    harness.queueJson(currentDeployMetadata(), 200, { "Cache-Control": "no-store" });
    harness.queueJson({ setupComplete: true });
    harness.queueJson(currentAppRegistry());
    harness.queueJson(upgradeStatusResponse());
    harness.queueJson(upgradeStatusResponse());
    harness.queueJson(packageMigrationApplyResponse());
    harness.queueJson(upgradeStatusResponse());
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
      records: coreMediaSeedRecords,
      schema: siteSourceSchema,
      schemaUpdatedAt: "2026-05-12T04:00:00.000Z",
    });
    harness.queueText("<!doctype html><title>Home</title>");

    const result = await runSitePublish(harness.input());

    expect(harness.commands).toEqual(["devstate check", "bun run deploy"]);
    expect(harness.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
      "POST https://live.example/api/formless/upgrade/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "POST https://live.example/api/formless/app-installs/site/site/package-migrations/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "GET https://live.example/api/site/snapshot",
      ...sourceMediaAssets.map(
        (asset) => `PUT https://live.example/api/formless/media/${asset.key}`,
      ),
      "POST https://live.example/api/site/snapshot/restore",
      "GET https://live.example/pages/home",
    ]);
    expect(harness.requests[3]?.headers.authorization).toBe("Bearer secret-token");
    expect(harness.requests[5]?.headers.authorization).toBe("Bearer secret-token");
    expect(harness.logs.some((log) => log.includes("Upgrade apply evidence."))).toBe(true);
    expect(harness.reads).toEqual(
      sourceMediaAssets.map((asset) => `/workspace/${asset.sourcePath}`),
    );
    if (sourceMediaAssets.length > 0) {
      expect(harness.requests[8]?.headers).toMatchObject({
        authorization: "Bearer secret-token",
        "content-type": sourceMediaAssets[0]?.contentType,
      });
    }
    const restoreRequest = harness.requests[8 + sourceMediaAssets.length];

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
      adminToken: "secret-token",
      apply: true,
      sourceSeedRecords: coreMediaSeedRecords,
      skipCheck: true,
      target: "https://live.example",
    });
    harness.queueJson(currentDeployMetadata(), 200, { "Cache-Control": "no-store" });
    harness.queueJson({ setupComplete: true });
    harness.queueJson(currentAppRegistry());
    harness.queueJson(upgradeStatusResponse());
    harness.queueJson(upgradeStatusResponse());
    harness.queueJson(packageMigrationApplyResponse());
    harness.queueJson(upgradeStatusResponse());
    harness.queueJson(
      buildSiteSourceSnapshot(siteSourceSchema, coreMediaSeedRecords, {
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
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
      "POST https://live.example/api/formless/upgrade/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "POST https://live.example/api/formless/app-installs/site/site/package-migrations/apply",
      "GET https://live.example/api/formless/upgrade/status",
      "GET https://live.example/api/site/snapshot",
      ...sourceMediaAssets.map(
        (asset) => `PUT https://live.example/api/formless/media/${asset.key}`,
      ),
      "POST https://live.example/api/site/snapshot/restore",
    ]);
  });

  it("stops apply before data migration on target metadata verification failure", async () => {
    const harness = publishHarness({
      adminToken: "secret-token",
      apply: true,
      code: false,
      skipCheck: true,
      target: "https://live.example",
    });

    harness.queueJson({ version: "0.1.7" });
    harness.queueJson({ setupComplete: true });
    harness.queueJson({
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

    await expect(runSitePublish(harness.input())).rejects.toThrow(
      "Upgrade planning blocked: deploy-metadata-cacheable",
    );

    expect(harness.commands).toEqual([]);
    expect(harness.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "GET https://live.example/api/formless/deploy",
      "GET https://live.example/api/formless/setup",
      "GET https://live.example/api/formless/app-installs",
    ]);
    expect(harness.writes).toEqual([]);
    expect(harness.logs.at(-1)).toContain("Blockers: deploy-metadata-cacheable");
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

  it("fails before deploy when source records reference legacy Site media", async () => {
    const harness = publishHarness({
      apply: true,
      sourceSeedRecords: [
        {
          id: "source-image",
          entity: "block",
          values: {
            href: "/api/site/media/site/images/cover.png",
            label: "Image",
            type: "image",
          },
          createdAt: "2026-05-14T00:00:00.000Z",
        },
      ],
      target: "https://live.example",
    });

    await expect(runSitePublish(harness.input())).rejects.toThrow(
      'Unsupported legacy Site media href "/api/site/media/site/images/cover.png". Use core media before source Site media collection.',
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
    queueJson: (value: unknown, status = 200, headers?: Record<string, string>) =>
      responses.push(textResponse(JSON.stringify(value), status, headers)),
    queueText: (value: string, status = 200) => responses.push(textResponse(value, status)),
    reads,
    requests,
    sourceMediaBytes,
    writes,
  };
}

function textResponse(
  body: string,
  status = 200,
  headers?: Record<string, string>,
): SitePublishHttpResponse {
  return {
    headers: new Headers(headers),
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

function currentAppRegistry() {
  return {
    packages: listBundledAppPackages(),
    installs: [installedSite()],
  };
}

function packageMigrationApplyResponse() {
  const site = sitePackageFacts();

  return {
    applied: [],
    changes: [],
    cursor: 0,
    packageAppKey: "site",
    packageRevision: site.packageRevision,
    schemaUpdatedAt: "2026-05-12T02:00:00.000Z",
    skipped: [],
    sourceSchemaHash: site.sourceSchemaHash,
  };
}

function upgradeStatusResponse() {
  const site = sitePackageFacts();

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
          authorityName: "app:site",
          installId: "site",
          kind: "appInstall",
          packageAppKey: "site",
        },
        packageAppMigrations: {
          applied: [],
          state: {
            packageAppKey: "site",
            packageRevision: site.packageRevision,
            sourceSchemaHash: site.sourceSchemaHash,
            updatedAt: "2026-05-12T02:00:00.000Z",
          },
        },
        sqlMigrations: [],
      },
    ],
  };
}

function installedSite() {
  const site = sitePackageFacts();

  return {
    adminRoute: "/apps/site",
    createdAt: "2026-05-28T00:00:00.000Z",
    installId: "site",
    label: "Site",
    packageAppKey: "site",
    packageRevision: site.packageRevision,
    publicRoute: "/sites/site",
    publicRoutePrefix: "/sites/site/",
    schemaRoute: "/apps/site/schema",
    sourceSchemaHash: site.sourceSchemaHash,
    status: "installed",
    updatedAt: "2026-05-28T00:00:00.000Z",
  };
}

function sitePackageFacts() {
  const site = listBundledAppPackages().find((appPackage) => appPackage.packageAppKey === "site");

  if (!site) {
    throw new Error("Expected bundled Site package facts.");
  }

  return site;
}
