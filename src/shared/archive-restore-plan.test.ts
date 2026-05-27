import { describe, expect, it } from "vite-plus/test";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
} from "./archive.ts";
import { listBundledAppPackages, type AppInstall } from "./app-installs.ts";
import {
  planAppArchiveRestore,
  planInstanceArchiveRestore,
  planPortableArchiveRestore,
  type ArchiveRestoreMediaFile,
  type ArchiveRestorePlan,
  type ArchiveRestorePlanError,
  type ArchiveRestorePlanResult,
} from "./archive-restore-plan.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "./protocol.ts";
import { cloneTestValue } from "../test/schema-builders.ts";
import {
  rateSeedRecords,
  rateSourceSchema,
  siteSourceSchema,
  taskSeedRecords,
  taskSourceSchema,
} from "../test/schema-apps.ts";

const now = "2026-05-23T00:00:00.000Z";

describe("archive restore planner", () => {
  it("rejects old app-scoped Site media archive input", () => {
    const archive = instanceArchive({
      apps: [
        appArchive({
          app: archivedInstall("personal", "Personal"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [
                legacySiteMediaImageBlock("personal", "hero"),
                siteRecord("rec_site_settings_personal", "personal"),
              ],
            }),
          },
          media: {
            objects: [legacySiteMediaObject("personal", "hero")],
          },
        }),
        appArchive({
          app: archivedInstall("docs", "Docs"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [siteRecord("rec_site_settings_docs", "docs")],
            }),
          },
          media: { objects: [] },
        }),
      ],
    });

    const errors = expectFailure(
      planInstanceArchiveRestore(archive, {
        mediaFiles: [legacySiteMediaFile("personal", "hero")],
        sourceSchemas: { site: siteSourceSchema },
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-media",
          storageKey: "app-installs/personal/site/images/hero.png",
        }),
        expect.objectContaining({
          code: "invalid-media",
          field: "block.href",
          recordId: "rec_block_hero",
        }),
      ]),
    );
  });

  it("plans mixed Site, Tasks, and Estii instance archive restores with current core media", () => {
    const archive = instanceArchive({
      apps: [
        appArchive({
          app: archivedInstall("site", "Site"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [coreImageBlock("hero"), siteRecord("rec_site_settings_site", "site")],
            }),
          },
          media: {
            objects: [coreMediaObject("hero")],
          },
        }),
        appArchive({
          app: archivedInstall("tasks", "Tasks", "tasks"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: taskSeedRecords,
              schema: taskSourceSchema,
              schemaKey: "tasks",
              sourceCursor: taskSeedRecords.length,
            }),
          },
          media: { objects: [] },
        }),
        appArchive({
          app: archivedInstall("estii", "Estii", "estii"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: rateSeedRecords,
              schema: rateSourceSchema,
              schemaKey: "estii",
              sourceCursor: rateSeedRecords.length,
            }),
          },
          media: { objects: [] },
        }),
      ],
    });

    const plan = expectPlan(
      planInstanceArchiveRestore(archive, {
        mediaFiles: [coreMediaFile("hero")],
        sourceSchemas: {
          estii: rateSourceSchema,
          site: siteSourceSchema,
          tasks: taskSourceSchema,
        },
      }),
    );

    expect(plan.summary.appCount).toBe(3);
    expect(plan.summary.createdInstalls).toEqual(["estii", "site", "tasks"]);
    expect(plan.summary.mediaCountsByApp).toEqual({
      estii: 0,
      site: 1,
      tasks: 0,
    });
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.appInstallId),
    ).toEqual(["site"]);
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.storageKey),
    ).toEqual(["media/images/hero.png"]);
  });

  it("rejects install collisions unless replacement is explicit", () => {
    const existing = [siteInstall("personal")];
    const rejected = expectFailure(
      planAppArchiveRestore(appArchive({ app: archivedInstall("personal", "Personal") }), {
        installedApps: existing,
        sourceSchemas: { site: siteSourceSchema },
      }),
    );

    expect(rejected.map((error) => error.code)).toEqual(["install-collision"]);

    const replacementPlan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          app: archivedInstall("personal", "Personal"),
          restorePolicy: { dryRun: true, installCollisions: "replace" },
        }),
        {
          installedApps: existing,
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(replacementPlan.summary.createdInstalls).toEqual([]);
    expect(replacementPlan.summary.replacedInstalls).toEqual(["personal"]);
    expect(replacementPlan.steps[0]).toMatchObject({
      install: expect.objectContaining({ installId: "personal" }),
      kind: "replaceInstall",
    });
  });

  it("validates package availability and source-record schema compatibility", () => {
    const unsupportedPackage = expectFailure(
      planAppArchiveRestore(
        appArchive({
          app: {
            ...archivedInstall("tasks-copy", "Tasks Copy"),
            packageAppKey: "missing",
            sourceSchemaKey: "missing",
          },
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              schemaKey: "missing",
              records: [siteRecord("rec_site_settings_tasks", "tasks")],
            }),
          },
        }),
        {
          packages: listBundledAppPackages(),
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );
    const missingSource = expectFailure(
      planAppArchiveRestore(sourceRecordAppArchive(), {
        sourceSchemas: {},
      }),
    );
    const mismatchedSchema = cloneTestValue(siteSourceSchema);
    mismatchedSchema.entities.site.label = "Different Site";
    const schemaMismatch = expectFailure(
      planAppArchiveRestore(sourceRecordAppArchive(), {
        sourceSchemas: { site: mismatchedSchema },
      }),
    );

    expect(unsupportedPackage.map((error) => error.code)).toContain("unsupported-package");
    expect(missingSource.map((error) => error.code)).toContain("missing-source-schema");
    expect(schemaMismatch.map((error) => error.code)).toContain("schema-mismatch");
  });

  it("validates archive records, references, and unique constraints", () => {
    const errors = expectFailure(
      planAppArchiveRestore(
        appArchive({
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [
                siteRecord("rec_dup", "primary"),
                siteRecord("rec_dup", "secondary"),
                siteRecord("rec_duplicate_key", "primary"),
                {
                  ...siteRecord("rec_unknown_field", "other"),
                  values: {
                    key: "other",
                    label: "Other",
                    missing: "unsupported",
                  },
                },
                blockRecord("rec_block_target", "Target"),
                placementRecord("rec_place_broken", "missing-parent", "rec_block_target"),
              ],
            }),
          },
        }),
        {
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(errors.map((error) => error.code)).toEqual([
      "duplicate-record-id",
      "unique-constraint",
      "broken-reference",
      "invalid-record",
    ]);
    expect(errors.map((error) => error.recordId)).toEqual([
      "rec_dup",
      "rec_duplicate_key",
      "rec_place_broken",
      "rec_unknown_field",
    ]);
  });

  it("rejects legacy Site media href references before restore", () => {
    const errors = expectFailure(
      planAppArchiveRestore(
        appArchive({
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [
                siteRecord("rec_site_settings_media", "media"),
                legacySiteMediaImageBlock("personal", "missing"),
              ],
            }),
          },
          media: { objects: [] },
        }),
        {
          mediaFiles: [],
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(errors).toEqual([
      expect.objectContaining({
        code: "invalid-media",
        field: "block.href",
        recordId: "rec_block_missing",
      }),
    ]);
  });

  it("validates current core media manifests and media files", () => {
    const errors = expectFailure(
      planAppArchiveRestore(
        appArchive({
          capabilities: ["app-store-snapshots", "core-media-assets"],
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [siteRecord("rec_site_settings_media", "media"), coreImageBlock("hero")],
            }),
          },
          media: {
            objects: [coreMediaObject("hero", { contentType: "image/jpeg" })],
          },
        }),
        {
          mediaFiles: [],
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(errors.map((error) => error.code)).toEqual([
      "invalid-media",
      "invalid-media",
      "missing-media-object",
    ]);
    expect(errors.map((error) => error.storageKey)).toEqual([
      "media/images/hero.png",
      "media/images/hero.png",
      "media/images/hero.png",
    ]);
  });

  it("plans core media asset restores before records that store media asset ids", () => {
    const plan = expectPlan(
      planAppArchiveRestore(
        appArchive({
          capabilities: ["app-store-snapshots", "core-media-assets"],
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [siteRecord("rec_site_settings_media", "media"), coreImageBlock("hero")],
            }),
          },
          media: {
            objects: [coreMediaObject("hero")],
          },
        }),
        {
          mediaFiles: [coreMediaFile("hero")],
          sourceSchemas: { site: siteSourceSchema },
        },
      ),
    );

    expect(plan.steps.map((step) => step.kind)).toEqual([
      "createInstall",
      "restoreMedia",
      "restoreAppData",
    ]);
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.storageKey),
    ).toEqual(["media/images/hero.png"]);
  });

  it("reports codec failures as invalid archive planner errors", () => {
    expect(expectFailure(planPortableArchiveRestore({ kind: "formless.futureArchive" }))).toEqual([
      {
        code: "invalid-archive",
        message: 'Archive kind "formless.futureArchive" is unsupported.',
      },
    ]);
  });
});

function expectPlan(result: ArchiveRestorePlanResult): ArchiveRestorePlan {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.errors.map((error) => error.message).join("\n"));
  }

  return result.plan;
}

function expectFailure(result: ArchiveRestorePlanResult): ArchiveRestorePlanError[] {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error("Expected archive restore planning to fail.");
  }

  return result.errors;
}

function instanceArchive(overrides: Partial<InstanceArchive> = {}): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["installed-app-registry", "app-store-snapshots"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    apps: [appArchive()],
    ...overrides,
  };
}

function appArchive(overrides: Partial<AppArchive> = {}): AppArchive {
  return {
    kind: APP_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["app-store-snapshots"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: archivedInstall("personal", "Personal"),
    data: {
      kind: "storeSnapshot",
      snapshot: storeSnapshot({
        records: [siteRecord("rec_site_settings_primary", "primary")],
      }),
    },
    media: { objects: [] },
    ...overrides,
  };
}

function sourceRecordAppArchive(): AppArchive {
  return appArchive({
    capabilities: ["source-records"],
    data: {
      kind: "sourceRecords",
      schemaKey: "site",
      schemaUpdatedAt: now,
      schema: siteSourceSchema,
      records: [siteRecord("rec_site_settings_source", "source")],
    },
  });
}

function archivedInstall(
  installId: string,
  label: string,
  packageAppKey = "site",
): AppArchive["app"] {
  return {
    installId,
    packageAppKey,
    sourceSchemaKey: packageAppKey,
    label,
    status: "installed",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:01:00.000Z",
  };
}

function storeSnapshot(overrides: Partial<StoreSnapshot> = {}): StoreSnapshot {
  return {
    kind: STORE_SNAPSHOT_KIND,
    version: STORE_SNAPSHOT_VERSION,
    schemaKey: "site",
    exportedAt: now,
    schemaUpdatedAt: now,
    sourceCursor: 7,
    schema: siteSourceSchema,
    records: [siteRecord("rec_site_settings_primary", "primary")],
    ...overrides,
  };
}

function siteRecord(id: string, key: string): StoredRecord {
  return {
    id,
    entity: "site",
    values: {
      key,
      label: `${key} Site`,
    },
    createdAt: "2026-05-23T00:00:00.000Z",
  };
}

function blockRecord(id: string, label: string, values: StoredRecord["values"] = {}): StoredRecord {
  return {
    id,
    entity: "block",
    values: {
      type: "image",
      label,
      ...values,
    },
    createdAt: id.endsWith("missing") ? "2026-05-23T00:00:03.000Z" : "2026-05-23T00:00:02.000Z",
  };
}

function legacySiteMediaImageBlock(installId: string, name: string): StoredRecord {
  const object = legacySiteMediaObject(installId, name);

  return blockRecord(`rec_block_${name}`, `${name} image`, {
    href: object.deliveryHref,
    width: 1200,
    height: 800,
  });
}

function coreImageBlock(name: string): StoredRecord {
  return blockRecord(`rec_block_${name}`, `${name} image`, {
    mediaAssetId: `${name}.png`,
    width: 1200,
    height: 800,
  });
}

function placementRecord(id: string, parent: string, block: string): StoredRecord {
  return {
    id,
    entity: "blockPlacement",
    values: {
      parent,
      block,
      order: 1000,
    },
    createdAt: "2026-05-23T00:00:04.000Z",
  };
}

function legacySiteMediaObject(
  installId: string,
  name: string,
  overrides: Partial<AppArchiveMediaObject> = {},
): AppArchiveMediaObject {
  const storageKey = `app-installs/${installId}/site/images/${name}.png`;

  return {
    storageKey,
    archivePath: `media/${installId}/${name}.png`,
    contentType: "image/png",
    byteSize: 8,
    deliveryHref: `/api/app-installs/site/${installId}/media/${storageKey}`,
    ...overrides,
  };
}

function legacySiteMediaFile(installId: string, name: string): ArchiveRestoreMediaFile {
  return {
    archivePath: `media/${installId}/${name}.png`,
    byteSize: 8,
    contentType: "image/png",
  };
}

function coreMediaObject(
  name: string,
  overrides: Partial<AppArchiveMediaObject> = {},
): AppArchiveMediaObject {
  const storageKey = `media/images/${name}.png`;

  return {
    storageKey,
    archivePath: `media/personal/media/images/${name}.png`,
    asset: {
      byteSize: 8,
      contentType: "image/png",
      deliveryHref: `/api/formless/media/${storageKey}`,
      id: `${name}.png`,
      kind: "image",
      label: `${name}.png`,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    contentType: "image/png",
    byteSize: 8,
    deliveryHref: `/api/formless/media/${storageKey}`,
    ...overrides,
  };
}

function coreMediaFile(name: string): ArchiveRestoreMediaFile {
  return {
    archivePath: `media/personal/media/images/${name}.png`,
    byteSize: 8,
    contentType: "image/png",
  };
}

function siteInstall(installId: string): AppInstall {
  return {
    adminRoute: `/apps/${installId}`,
    createdAt: now,
    installId,
    label: "Personal",
    packageAppKey: "site",
    publicRoute: `/sites/${installId}`,
    publicRoutePrefix: `/sites/${installId}/`,
    schemaRoute: `/apps/${installId}/schema`,
    status: "installed",
    updatedAt: now,
  };
}
