import { describe, expect, it } from "vite-plus/test";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
} from "../shared/archive.ts";
import type { AppInstall } from "../shared/app-installs.ts";
import { installedAppStorageIdentity } from "../shared/app-storage-identity.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type BootstrapResponse,
  type StoreSnapshot,
  type StoredRecord,
} from "../shared/protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import {
  applyPortableArchiveRestore,
  dryRunPortableArchiveRestore,
  restoreArchiveMediaObjectToStore,
  type ArchiveRestoreApplyTarget,
  type ArchiveRestoreMediaRead,
} from "./archive-restore.ts";

const now = "2026-05-23T00:00:00.000Z";
const pngBytes = new Uint8Array([1, 2, 3, 4]);

describe("archive restore execution", () => {
  it("dry-runs restore plans without mutating the target", async () => {
    const archive = instanceArchive({
      restorePolicy: { dryRun: false, installCollisions: "reject" },
    });
    const events: string[] = [];
    const target = memoryRestoreTarget({ events });
    const result = await dryRunPortableArchiveRestore(archive, target);

    expect(result.ok).toBe(true);
    expect(events).toEqual([]);

    if (!result.ok) {
      throw new Error(result.errors.map((error) => error.message).join("\n"));
    }

    expect(result.report.applied).toBe(false);
    expect(result.report.steps.map((step) => step.kind)).toEqual(["install", "appData"]);
    expect(result.report.summary.createdInstalls).toEqual(["personal"]);
  });

  it("applies registry, media, and app data steps in validated plan order", async () => {
    const archive = instanceArchive({
      restorePolicy: { dryRun: false, installCollisions: "reject" },
      apps: [
        appArchive({
          app: archivedInstall("personal", "Personal"),
          data: {
            kind: "storeSnapshot",
            snapshot: storeSnapshot({
              records: [siteRecord("rec_site_settings_personal", "personal")],
            }),
          },
          media: { objects: [mediaObject("personal", "hero")] },
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
    const events: string[] = [];
    const target = memoryRestoreTarget({
      events,
      mediaFiles: [mediaFile("personal", "hero")],
    });
    const result = await applyPortableArchiveRestore(archive, target);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.errors.map((error) => error.message).join("\n"));
    }

    expect(events).toEqual([
      "install:create:docs",
      "app-data:app:docs:docs:storeSnapshot",
      "install:create:personal",
      "media:app:personal:app-installs/personal/site/images/hero.png",
      "app-data:app:personal:personal:storeSnapshot",
    ]);
    expect(result.report.applied).toBe(true);
    expect(result.report.summary.createdInstalls).toEqual(["docs", "personal"]);
    expect(result.report.steps.map((step) => step.kind)).toEqual([
      "install",
      "appData",
      "install",
      "media",
      "appData",
    ]);
  });

  it("refuses apply when the archive restore policy is dry-run", async () => {
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(appArchive(), memoryRestoreTarget({ events }));

    expect(result.ok).toBe(false);
    expect(events).toEqual([]);

    if (result.ok) {
      throw new Error("Expected dry-run policy to fail apply.");
    }

    expect(result.errors).toEqual([
      {
        code: "dry-run-policy",
        message: "Archive restore policy is dry-run; apply requires dryRun false.",
      },
    ]);
  });

  it("returns planner errors without mutating the target", async () => {
    const events: string[] = [];
    const result = await applyPortableArchiveRestore(
      appArchive({
        restorePolicy: { dryRun: false, installCollisions: "reject" },
      }),
      memoryRestoreTarget({
        events,
        installedApps: [siteInstall("personal")],
      }),
    );

    expect(result.ok).toBe(false);
    expect(events).toEqual([]);

    if (result.ok) {
      throw new Error("Expected collision to fail planning.");
    }

    expect(result.errors.map((error) => error.code)).toEqual(["install-collision"]);
  });

  it("restores app media objects through the media core", async () => {
    const identity = installedAppStorageIdentity({
      installId: "personal",
      packageAppKey: "site",
    });
    const writes: unknown[] = [];

    if (!identity) {
      throw new Error("Expected installed app identity.");
    }

    const response = await restoreArchiveMediaObjectToStore(
      {
        getObject: async () => undefined,
        putObject: async (write) => {
          writes.push(write);
        },
      },
      identity,
      mediaObject("personal", "hero"),
      pngBytes,
    );

    expect(response).toEqual({
      contentType: "image/png",
      href: "/api/app-installs/site/personal/media/app-installs/personal/site/images/hero.png",
      key: "app-installs/personal/site/images/hero.png",
      size: pngBytes.byteLength,
    });
    expect(writes).toEqual([
      expect.objectContaining({
        bytes: pngBytes,
        contentType: "image/png",
        key: "app-installs/personal/site/images/hero.png",
      }),
    ]);
  });
});

function memoryRestoreTarget(input: {
  events: string[];
  installedApps?: AppInstall[];
  mediaFiles?: ArchiveRestoreMediaRead[];
}): ArchiveRestoreApplyTarget {
  return {
    listInstalledApps: () => input.installedApps ?? [],
    media: {
      listFiles: async () => input.mediaFiles ?? [],
      readFile: async (archivePath) =>
        input.mediaFiles?.find((file) => file.archivePath === archivePath),
      restoreObject: async ({ identity, object }) => {
        input.events.push(`media:${identity.authorityName}:${object.storageKey}`);

        return {
          contentType: object.contentType,
          href: object.deliveryHref,
          key: object.storageKey,
          size: object.byteSize,
        };
      },
    },
    restoreAppData: ({ data, identity, app }) => {
      input.events.push(`app-data:${identity.authorityName}:${app.installId}:${data.kind}`);

      return bootstrapResponse(data);
    },
    restoreInstall: ({ action, install }) => {
      input.events.push(`install:${action}:${install.installId}`);
    },
  };
}

function bootstrapResponse(data: AppArchive["data"]): BootstrapResponse {
  const schema = data.kind === "storeSnapshot" ? data.snapshot.schema : data.schema;
  const schemaUpdatedAt =
    data.kind === "storeSnapshot" ? data.snapshot.schemaUpdatedAt : data.schemaUpdatedAt;

  return {
    cursor: 0,
    records: [],
    schema,
    schemaUpdatedAt,
  };
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
        records: [siteRecord("rec_site_settings_personal", "personal")],
      }),
    },
    media: { objects: [] },
    ...overrides,
  };
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
    records: [siteRecord("rec_site_settings_personal", "personal")],
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

function mediaObject(installId: string, name: string): AppArchiveMediaObject {
  const storageKey = `app-installs/${installId}/site/images/${name}.png`;

  return {
    storageKey,
    archivePath: `media/${installId}/${name}.png`,
    contentType: "image/png",
    byteSize: pngBytes.byteLength,
    deliveryHref: `/api/app-installs/site/${installId}/media/${storageKey}`,
  };
}

function mediaFile(installId: string, name: string): ArchiveRestoreMediaRead {
  return {
    archivePath: `media/${installId}/${name}.png`,
    byteSize: pngBytes.byteLength,
    bytes: pngBytes,
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
