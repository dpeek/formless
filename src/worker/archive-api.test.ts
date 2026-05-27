import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type InstanceArchive,
} from "../shared/archive.ts";
import type {
  AppInstallsResponse,
  BootstrapResponse,
  SitePageTreeResponse,
  StoredRecord,
} from "../shared/protocol.ts";
import { rateSourceSchema, siteSourceSchema, taskSourceSchema } from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";
import { createWorkerHarness } from "./miniflare-test.ts";

type Harness = Awaited<ReturnType<typeof createWorkerHarness>>;

const adminToken = "test-admin-token";

let harness: Harness;

beforeEach(async () => {
  harness = await createWorkerHarness(
    "src/worker/index.ts",
    {
      FORMLESS_AUTHORITY: { className: "FormlessAuthority", useSQLite: true },
    },
    {
      bindings: { FORMLESS_ADMIN_TOKEN: adminToken },
      r2Buckets: ["FORMLESS_MEDIA"],
    },
  );
});

afterEach(async () => {
  await harness.dispose();
});

describe("instance archive restore API", () => {
  it("dry-runs and applies app archive restore through installed app storage", async () => {
    const dryRun = await postArchiveRestore(appArchive({ dryRun: true }));
    const before = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const applied = await postArchiveRestore(appArchive({ dryRun: false }));
    const after = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(before.body.installs).toEqual([]);
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
        },
      },
    });
    expect(after.body.installs.map((install) => install.installId)).toEqual(["personal"]);
    expect(bootstrap.body.records).toContainEqual(siteRecord());
  });

  it("restores installed Tasks app archives without Site media", async () => {
    const dryRun = await postArchiveRestore(tasksAppArchive({ dryRun: true }));
    const applied = await postArchiveRestore(tasksAppArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["work"],
          mediaCountsByApp: { work: 0 },
        },
      },
    });
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["work"],
          mediaCountsByApp: { work: 0 },
        },
      },
    });
    expect(installs.body.installs).toEqual([
      expect.objectContaining({
        adminRoute: "/apps/work",
        installId: "work",
        packageAppKey: "tasks",
        schemaRoute: "/apps/work/schema",
      }),
    ]);
    expect(installs.body.installs[0]).not.toHaveProperty("publicRoute");
    expect(bootstrap.body.schema).toEqual(taskSourceSchema);
    expect(bootstrap.body.records).toEqual([taskRecord()]);
  });

  it("restores installed Estii app archives without Site media", async () => {
    const dryRun = await postArchiveRestore(estiiAppArchive({ dryRun: true }));
    const applied = await postArchiveRestore(estiiAppArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const bootstrap = await getJson<BootstrapResponse>("/api/app-installs/estii/rates/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 1,
          createdInstalls: ["rates"],
          mediaCountsByApp: { rates: 0 },
        },
      },
    });
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["rates"],
          mediaCountsByApp: { rates: 0 },
        },
      },
    });
    expect(installs.body.installs).toEqual([
      expect.objectContaining({
        adminRoute: "/apps/rates",
        installId: "rates",
        packageAppKey: "estii",
        schemaRoute: "/apps/rates/schema",
      }),
    ]);
    expect(installs.body.installs[0]).not.toHaveProperty("publicRoute");
    expect(bootstrap.body.schema).toEqual(rateSourceSchema);
    expect(bootstrap.body.records).toEqual(estiiRecords());
  });

  it("restores mixed Site, Tasks, and Estii instance archives without non-Site media", async () => {
    const dryRun = await postArchiveRestore(mixedInstanceArchive({ dryRun: true }));
    const applied = await postArchiveRestore(mixedInstanceArchive({ dryRun: false }));
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");
    const site = await getJson<BootstrapResponse>("/api/app-installs/site/personal/bootstrap");
    const tasks = await getJson<BootstrapResponse>("/api/app-installs/tasks/work/bootstrap");
    const estii = await getJson<BootstrapResponse>("/api/app-installs/estii/rates/bootstrap");

    expect(dryRun.response.status).toBe(200);
    expect(dryRun.body).toMatchObject({
      ok: true,
      report: {
        applied: false,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "rates", "work"],
          mediaCountsByApp: { personal: 0, rates: 0, work: 0 },
        },
      },
    });
    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 3,
          createdInstalls: ["personal", "rates", "work"],
          mediaCountsByApp: { personal: 0, rates: 0, work: 0 },
        },
      },
    });
    expect(installs.body.installs.map((install) => install.packageAppKey)).toEqual([
      "site",
      "estii",
      "tasks",
    ]);
    expect(
      installs.body.installs.find((install) => install.installId === "work"),
    ).not.toHaveProperty("publicRoute");
    expect(
      installs.body.installs.find((install) => install.installId === "rates"),
    ).not.toHaveProperty("publicRoute");
    expect(site.body.schema).toEqual(siteSourceSchema);
    expect(site.body.records).toEqual([siteRecord()]);
    expect(tasks.body.schema).toEqual(taskSourceSchema);
    expect(tasks.body.records).toEqual([taskRecord()]);
    expect(estii.body.schema).toEqual(rateSourceSchema);
    expect(estii.body.records).toEqual(estiiRecords());
  });

  it("restores core Site media before public tree reads reference it", async () => {
    const applied = await postArchiveRestore(appArchiveWithMedia({ dryRun: false }), [mediaFile()]);
    const tree = await getJson<SitePageTreeResponse>("/api/app-installs/site/personal/tree/home");
    const served = await harness.fetch(coreMediaHref);

    expect(applied.response.status).toBe(200);
    expect(applied.body).toMatchObject({
      ok: true,
      report: {
        applied: true,
        summary: {
          appCount: 1,
          createdInstalls: ["personal"],
          mediaCountsByApp: { personal: 1 },
        },
      },
    });
    expect(JSON.stringify(tree.body)).toContain(coreMediaHref);
    expect(tree.body.page.label).toBe("Home");
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(mediaBytes);
  });

  it("rejects old app-scoped Site media archives before restore mutation", async () => {
    const rejected = await postArchiveRestore(appArchiveWithLegacyMedia({ dryRun: false }), [
      legacyMediaFile(),
    ]);
    const installs = await getJson<AppInstallsResponse>("/api/formless/app-installs");

    expect(rejected.response.status).toBe(400);
    expect(rejected.body).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-media",
          storageKey: legacyStorageKey,
        }),
        expect.objectContaining({
          code: "invalid-media",
          field: "block.href",
          recordId: "rec_site_media_avatar",
        }),
      ]),
    });
    expect(installs.body.installs).toEqual([]);
  });

  it("requires write authorization", async () => {
    const response = await harness.fetch("/api/formless/archive/restore", {
      body: JSON.stringify({ archive: appArchive({ dryRun: true }) }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Owner session or admin authorization is required for this write endpoint.",
    });
  });
});

async function postArchiveRestore(
  archive: AppArchive | InstanceArchive,
  mediaFiles: Array<{
    archivePath: string;
    byteSize: number;
    bytesBase64: string;
    contentType: string;
  }> = [],
) {
  const response = await harness.fetch("/api/formless/archive/restore", {
    body: JSON.stringify({ archive, mediaFiles }),
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return {
    body: (await response.json()) as unknown,
    response,
  };
}

async function getJson<T>(path: string) {
  const response = await harness.fetch(path);

  return {
    body: (await response.json()) as T,
    response,
  };
}

function mixedInstanceArchive(input: { dryRun: boolean }): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    apps: [appArchive(input), tasksAppArchive(input), estiiAppArchive(input)],
  };
}

function appArchive(input: { dryRun: boolean }): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["source-records", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    app: {
      installId: "personal",
      packageAppKey: "site",
      sourceSchemaKey: "site",
      label: "Personal",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: "sourceRecords",
      schemaKey: "site",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      schema: siteSourceSchema,
      records: [siteRecord()],
    },
    media: { objects: [] },
  };
}

function tasksAppArchive(input: { dryRun: boolean }): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    app: {
      installId: "work",
      packageAppKey: "tasks",
      sourceSchemaKey: "tasks",
      label: "Work Tasks",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: "storeSnapshot",
      snapshot: {
        kind: "formless.storeSnapshot",
        version: 1,
        schemaKey: "tasks",
        exportedAt: "2026-05-12T00:00:00.000Z",
        schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
        sourceCursor: 1,
        schema: taskSourceSchema,
        records: [taskRecord()],
      },
    },
    media: { objects: [] },
  };
}

function estiiAppArchive(input: { dryRun: boolean }): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: "2026-05-12T00:00:00.000Z",
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: input.dryRun, installCollisions: "reject" },
    app: {
      installId: "rates",
      packageAppKey: "estii",
      sourceSchemaKey: "estii",
      label: "Rates",
      status: "installed",
      createdAt: "2026-05-12T00:00:00.000Z",
      updatedAt: "2026-05-12T00:00:00.000Z",
    },
    data: {
      kind: "storeSnapshot",
      snapshot: {
        kind: "formless.storeSnapshot",
        version: 1,
        schemaKey: "estii",
        exportedAt: "2026-05-12T00:00:00.000Z",
        schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
        sourceCursor: 3,
        schema: rateSourceSchema,
        records: estiiRecords(),
      },
    },
    media: { objects: [] },
  };
}

const mediaBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const coreMediaStorageKey = "media/images/installed.png";
const coreMediaHref = `/api/formless/media/${coreMediaStorageKey}`;
const legacyStorageKey = "app-installs/personal/site/images/installed.png";
const legacyMediaHref = `/api/app-installs/site/personal/media/${legacyStorageKey}`;

function appArchiveWithMedia(input: { dryRun: boolean }): AppArchive {
  return {
    ...appArchive(input),
    data: {
      kind: "sourceRecords",
      schemaKey: "site",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      schema: siteSourceSchema,
      records: testSiteSeedRecords.map((record) =>
        record.id === "rec_site_media_avatar" ? imageAssetRecord(record) : record,
      ),
    },
    media: {
      objects: [
        {
          archivePath: "media/personal/installed.png",
          asset: {
            byteSize: mediaBytes.byteLength,
            contentType: "image/png",
            deliveryHref: coreMediaHref,
            id: "installed.png",
            kind: "image",
            label: "installed.png",
            provider: "r2",
            status: "ready",
            storageKey: coreMediaStorageKey,
          },
          byteSize: mediaBytes.byteLength,
          contentType: "image/png",
          deliveryHref: coreMediaHref,
          storageKey: coreMediaStorageKey,
        },
      ],
    },
  };
}

function imageAssetRecord(record: StoredRecord): StoredRecord {
  const values = { ...record.values };

  delete values.href;

  return {
    ...record,
    values: {
      ...values,
      mediaAssetId: "installed.png",
    },
  };
}

function appArchiveWithLegacyMedia(input: { dryRun: boolean }): AppArchive {
  return {
    ...appArchive(input),
    capabilities: ["source-records"],
    data: {
      kind: "sourceRecords",
      schemaKey: "site",
      schemaUpdatedAt: "2026-05-12T00:00:00.000Z",
      schema: siteSourceSchema,
      records: testSiteSeedRecords.map((record) =>
        record.id === "rec_site_media_avatar" ? legacyImageHrefRecord(record) : record,
      ),
    },
    media: {
      objects: [
        {
          archivePath: "media/personal/installed.png",
          byteSize: mediaBytes.byteLength,
          contentType: "image/png",
          deliveryHref: legacyMediaHref,
          storageKey: legacyStorageKey,
        },
      ],
    },
  };
}

function legacyImageHrefRecord(record: StoredRecord): StoredRecord {
  const values = { ...record.values };

  delete values.mediaAssetId;

  return {
    ...record,
    values: {
      ...values,
      href: legacyMediaHref,
    },
  };
}

function mediaFile() {
  return {
    archivePath: "media/personal/installed.png",
    byteSize: mediaBytes.byteLength,
    bytesBase64: Buffer.from(mediaBytes).toString("base64"),
    contentType: "image/png",
  };
}

function legacyMediaFile() {
  return {
    archivePath: "media/personal/installed.png",
    byteSize: mediaBytes.byteLength,
    bytesBase64: Buffer.from(mediaBytes).toString("base64"),
    contentType: "image/png",
  };
}

function siteRecord(): StoredRecord {
  return {
    id: "site-main",
    createdAt: "2026-05-12T00:00:00.000Z",
    entity: "site",
    values: {
      key: "personal",
      label: "Personal",
    },
  };
}

function taskRecord(): StoredRecord {
  return {
    id: "task-restored",
    createdAt: "2026-05-12T00:00:00.000Z",
    entity: "task",
    values: {
      title: "Restored task",
      done: false,
      priority: "normal",
    },
  };
}

function estiiRecords(): StoredRecord[] {
  return [
    {
      id: "card-restored",
      createdAt: "2026-05-12T00:00:00.000Z",
      entity: "card",
      values: {
        name: "Restored card",
        isDefault: true,
        marginMin: 0.4,
        marginMed: 0.5,
        marginMax: 0.6,
      },
    },
    {
      id: "resource-restored",
      createdAt: "2026-05-12T00:00:01.000Z",
      entity: "resource",
      values: {
        name: "Restored resource",
        kind: "role",
        unit: "day",
      },
    },
    {
      id: "rate-restored",
      createdAt: "2026-05-12T00:00:02.000Z",
      entity: "rate",
      values: {
        resource: "resource-restored",
        card: "card-restored",
        cost: 500,
        costUnit: "day",
        price: 750,
        priceSet: true,
        currency: "usd",
      },
    },
  ];
}
