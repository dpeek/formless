import { describe, expect, it } from "vite-plus/test";
import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  formatAppArchive,
  formatInstanceArchive,
  parseAppArchive,
  parseInstanceArchive,
  parsePortableArchive,
  type AppArchive,
  type AppArchiveMediaObject,
  type InstanceArchive,
} from "./archive.ts";
import {
  STORE_SNAPSHOT_KIND,
  STORE_SNAPSHOT_VERSION,
  type StoreSnapshot,
  type StoredRecord,
} from "./protocol.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";

const now = "2026-05-23T00:00:00.000Z";

describe("portable archive protocol", () => {
  it("parses the supported version 1 app archive envelope", () => {
    const archive = appArchive({
      data: {
        kind: "storeSnapshot",
        snapshot: storeSnapshot({
          records: [
            activeSiteRecord("rec_site_settings_primary"),
            {
              ...activeSiteRecord("rec_site_settings_old"),
              deletedAt: "2026-05-23T00:03:00.000Z",
            },
          ],
        }),
      },
    });

    expect(parseAppArchive(archive)).toEqual(archive);
    expect(parsePortableArchive(archive)).toEqual(archive);
  });

  it("parses source-record app archives and rejects tombstones there", () => {
    const sourceArchive = appArchive({
      capabilities: ["source-records", "core-media-assets"],
      data: {
        kind: "sourceRecords",
        schemaKey: "site",
        schemaUpdatedAt: now,
        schema: siteSourceSchema,
        records: [activeSiteRecord("rec_site_settings_primary")],
      },
    });

    expect(parseAppArchive(sourceArchive)).toEqual(sourceArchive);
    expect(() =>
      parseAppArchive({
        ...sourceArchive,
        data: {
          ...sourceArchive.data,
          records: [
            {
              ...activeSiteRecord("rec_site_settings_primary"),
              deletedAt: "2026-05-23T00:03:00.000Z",
            },
          ],
        },
      }),
    ).toThrow('App archive data records[0] has unsupported key "deletedAt".');
  });

  it("parses instance archives as app archive collections", () => {
    const archive = instanceArchive({
      apps: [
        appArchive({ app: archivedInstall("docs", "Docs") }),
        appArchive({ app: archivedInstall("personal", "Personal") }),
      ],
    });

    expect(parseInstanceArchive(archive)).toEqual(archive);
    expect(parsePortableArchive(archive)).toEqual(archive);
  });

  it("rejects unknown kinds, unsupported versions, and missing sections", () => {
    expect(() => parsePortableArchive({ kind: "formless.futureArchive", version: 1 })).toThrow(
      'Archive kind "formless.futureArchive" is unsupported.',
    );

    expect(() => parseAppArchive({ ...appArchive(), version: 2 })).toThrow(
      "App archive version must be 1.",
    );

    expect(() => parseInstanceArchive({ ...instanceArchive(), kind: APP_ARCHIVE_KIND })).toThrow(
      'Instance archive kind must be "formless.instanceArchive".',
    );

    const missingData = { ...appArchive() } as Record<string, unknown>;
    delete missingData.data;

    expect(() => parseAppArchive(missingData)).toThrow('App archive must include "data".');
  });

  it("rejects precise invalid archive fields", () => {
    expect(() =>
      parseAppArchive({
        ...appArchive(),
        capabilities: ["app-media"],
      }),
    ).toThrow('App archive capabilities[0] "app-media" is unsupported.');

    expect(() =>
      parseAppArchive({
        ...appArchive(),
        restorePolicy: { dryRun: true, installCollisions: "overwrite" },
      }),
    ).toThrow('App archive restorePolicy installCollisions must be "reject" or "replace".');

    expect(() =>
      parseAppArchive({
        ...appArchive(),
        media: {
          objects: [{ ...mediaObject("hero"), byteSize: 1.5 }],
        },
      }),
    ).toThrow("App archive media objects[0] byteSize must be a non-negative integer.");

    expect(() =>
      parseAppArchive({
        ...appArchive(),
        app: { ...archivedInstall("api", "API") },
      }),
    ).toThrow('App archive app installId is invalid: Install id "api" is reserved.');
  });

  it("formats app archives deterministically", () => {
    const archive = appArchive({
      capabilities: ["core-media-assets", "app-store-snapshots"],
      data: {
        kind: "storeSnapshot",
        snapshot: storeSnapshot({
          records: [
            activeSiteRecord("rec_site_settings_zeta", {
              label: "Zeta",
              key: "zeta",
            }),
            activeSiteRecord("rec_site_settings_alpha", {
              label: "Alpha",
              key: "alpha",
            }),
          ],
        }),
      },
      media: {
        objects: [mediaObject("zeta"), mediaObject("alpha")],
      },
    });
    const formatted = formatAppArchive(archive);
    const reparsed = parseAppArchive(JSON.parse(formatted));

    expect(formatAppArchive(reparsed)).toBe(formatted);
    expect(formatted.endsWith("\n")).toBe(true);
    expect(reparsed.capabilities).toEqual(["app-store-snapshots", "core-media-assets"]);
    expect(reparsed.media.objects.map((object) => object.storageKey)).toEqual([
      "media/images/alpha.png",
      "media/images/zeta.png",
    ]);
    expect(
      reparsed.data.kind === "storeSnapshot"
        ? reparsed.data.snapshot.records.map((record) => record.id)
        : [],
    ).toEqual(["rec_site_settings_alpha", "rec_site_settings_zeta"]);
  });

  it("formats instance archives deterministically by install id", () => {
    const archive = instanceArchive({
      capabilities: ["core-media-assets", "installed-app-registry"],
      apps: [
        appArchive({ app: archivedInstall("zeta", "Zeta") }),
        appArchive({ app: archivedInstall("alpha", "Alpha") }),
      ],
    });
    const formatted = formatInstanceArchive(archive);
    const reparsed = parseInstanceArchive(JSON.parse(formatted));

    expect(formatInstanceArchive(reparsed)).toBe(formatted);
    expect(reparsed.capabilities).toEqual(["installed-app-registry", "core-media-assets"]);
    expect(reparsed.apps.map((app) => app.app.installId)).toEqual(["alpha", "zeta"]);
  });

  it("parses old app-scoped media capability as restore compatibility input", () => {
    const archive = appArchive({
      capabilities: ["app-scoped-media"],
      media: { objects: [legacySiteMediaObject("hero")] },
    });

    expect(parseAppArchive(archive)).toEqual(archive);
  });
});

function instanceArchive(overrides: Partial<InstanceArchive> = {}): InstanceArchive {
  return {
    kind: INSTANCE_ARCHIVE_KIND,
    version: ARCHIVE_VERSION,
    exportedAt: now,
    capabilities: ["installed-app-registry", "app-store-snapshots", "core-media-assets"],
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
    capabilities: ["app-store-snapshots", "core-media-assets"],
    restorePolicy: { dryRun: true, installCollisions: "reject" },
    app: archivedInstall("personal", "Personal"),
    data: { kind: "storeSnapshot", snapshot: storeSnapshot() },
    media: { objects: [mediaObject("hero")] },
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
    records: [activeSiteRecord("rec_site_settings_primary")],
    ...overrides,
  };
}

function activeSiteRecord(id: string, values: StoredRecord["values"] = {}): StoredRecord {
  const fixture = testSiteSeedRecords[0] as StoredRecord;

  return {
    id,
    entity: fixture.entity,
    values: {
      ...fixture.values,
      ...values,
    },
    createdAt: id.endsWith("alpha") ? "2026-05-23T00:00:01.000Z" : "2026-05-23T00:00:02.000Z",
  };
}

function mediaObject(name: string): AppArchiveMediaObject {
  const storageKey = `media/images/${name}.png`;
  const deliveryHref = `/api/formless/media/${storageKey}`;

  return {
    storageKey,
    archivePath: `media/personal/media/images/${name}.png`,
    asset: {
      byteSize: name.length,
      contentType: "image/png",
      deliveryHref,
      id: `${name}.png`,
      kind: "image",
      label: `${name}.png`,
      provider: "r2",
      status: "ready",
      storageKey,
    },
    contentType: "image/png",
    byteSize: name.length,
    deliveryHref,
  };
}

function legacySiteMediaObject(name: string): AppArchiveMediaObject {
  return {
    storageKey: `app-installs/personal/site/images/${name}.png`,
    archivePath: `compat/legacy-site-media/${name}.png`,
    contentType: "image/png",
    byteSize: name.length,
    deliveryHref: `/api/app-installs/site/personal/media/app-installs/personal/site/images/${name}.png`,
  };
}
