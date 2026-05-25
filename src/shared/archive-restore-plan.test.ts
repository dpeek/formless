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
import { siteSourceSchema } from "../test/schema-apps.ts";

const now = "2026-05-23T00:00:00.000Z";

describe("archive restore planner", () => {
  it("plans deterministic instance archive restore steps for new installs", () => {
    const archive = instanceArchive({
      apps: [
        appArchive({
          app: archivedInstall("personal", "Personal"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [
                imageBlock("personal", "hero"),
                siteRecord("rec_site_settings_personal", "personal"),
              ],
            }),
          },
          media: {
            objects: [mediaObject("personal", "hero")],
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

    const plan = expectPlan(
      planInstanceArchiveRestore(archive, {
        mediaFiles: [mediaFile("personal", "hero")],
        sourceSchemas: { site: siteSourceSchema },
      }),
    );

    expect(plan.summary).toEqual({
      appCount: 2,
      createdInstalls: ["docs", "personal"],
      mediaCountsByApp: {
        docs: 0,
        personal: 1,
      },
      recordCountsByApp: {
        docs: {
          active: 1,
          byEntity: { site: 1 },
          tombstoned: 0,
          total: 1,
        },
        personal: {
          active: 2,
          byEntity: { block: 1, site: 1 },
          tombstoned: 0,
          total: 2,
        },
      },
      replacedInstalls: [],
    });
    expect(plan.steps.map((step) => step.kind)).toEqual([
      "createInstall",
      "restoreAppData",
      "createInstall",
      "restoreMedia",
      "restoreAppData",
    ]);
    expect(
      plan.steps.filter((step) => step.kind === "restoreMedia").map((step) => step.storageKey),
    ).toEqual(["app-installs/personal/site/images/hero.png"]);
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

  it("validates media manifests, media files, and app-scoped media references", () => {
    const errors = expectFailure(
      planAppArchiveRestore(
        appArchive({
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [
                siteRecord("rec_site_settings_media", "media"),
                imageBlock("personal", "missing"),
              ],
            }),
          },
          media: {
            objects: [
              mediaObject("personal", "hero", { contentType: "image/jpeg" }),
              mediaObject("personal", "bad-key", {
                deliveryHref:
                  "/api/app-installs/site/personal/media/app-installs/docs/site/images/bad-key.png",
                storageKey: "app-installs/docs/site/images/bad-key.png",
              }),
            ],
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
      "missing-media-object",
      "invalid-media",
      "missing-media-object",
      "missing-media-object",
    ]);
    expect(errors.map((error) => error.storageKey ?? error.recordId)).toEqual([
      "app-installs/docs/site/images/bad-key.png",
      "app-installs/docs/site/images/bad-key.png",
      "app-installs/personal/site/images/hero.png",
      "app-installs/personal/site/images/hero.png",
      "rec_block_missing",
    ]);
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
    capabilities: ["installed-app-registry", "app-store-snapshots", "app-scoped-media"],
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
    capabilities: ["app-store-snapshots", "app-scoped-media"],
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

function archivedInstall(installId: string, label: string): AppArchive["app"] {
  return {
    installId,
    packageAppKey: "site",
    sourceSchemaKey: "site",
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

function imageBlock(installId: string, name: string): StoredRecord {
  const object = mediaObject(installId, name);

  return blockRecord(`rec_block_${name}`, `${name} image`, {
    href: object.deliveryHref,
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

function mediaObject(
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

function mediaFile(installId: string, name: string): ArchiveRestoreMediaFile {
  return {
    archivePath: `media/${installId}/${name}.png`,
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
