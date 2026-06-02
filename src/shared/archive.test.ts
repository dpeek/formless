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
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";
import { siteSourceSchema } from "../test/schema-apps.ts";
import { testSiteSeedRecords } from "../test/site-records.ts";

const now = "2026-05-23T00:00:00.000Z";

describe("portable archive protocol", () => {
  it("parses the supported version 2 app archive envelope", () => {
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

  it("parses reviewable instance control-plane records and rejects secrets", () => {
    const archive = instanceArchive({
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: {
        schemaKey: "instance-control-plane",
        schemaUpdatedAt: now,
        records: controlPlaneRecords(),
      },
    });
    const parsed = parseInstanceArchive(archive);
    const formatted = formatInstanceArchive(parsed);
    const formattedArchive = JSON.parse(formatted) as InstanceArchive;

    expect(parsed.controlPlane?.records.map((record) => record.entity)).toContain(
      "deploy-desired-resource",
    );
    expect(formattedArchive.controlPlane?.records.map((record) => record.entity)).toContain(
      "instance:deploy-desired-resource",
    );
    expect(
      parseInstanceArchive(formattedArchive).controlPlane?.records.map((record) => record.entity),
    ).toContain("deploy-desired-resource");
    expect(JSON.stringify(parsed.controlPlane)).not.toContain("rec_site");
    expect(formatInstanceArchive(parseInstanceArchive(JSON.parse(formatted)))).toBe(formatted);
    const controlPlane = archive.controlPlane;

    if (!controlPlane) {
      throw new Error("Expected control-plane archive records.");
    }

    expect(() =>
      parseInstanceArchive({
        ...archive,
        controlPlane: {
          ...controlPlane,
          records: controlPlaneRecords({
            inputsJson: JSON.stringify({ apiToken: "CF_API_TOKEN" }),
          }),
        },
      }),
    ).toThrow("cannot store control-plane secret");
    expect(() =>
      parseInstanceArchive({
        ...archive,
        controlPlane: {
          ...controlPlane,
          records: controlPlaneRecords().map((record) =>
            record.entity === "route" && record.id === "route:host:publicSite:www.example.com"
              ? {
                  ...record,
                  values: {
                    ...record.values,
                    toUrl: "https://example.com/CF_API_TOKEN",
                  },
                }
              : record,
          ),
        },
      }),
    ).toThrow(
      'Instance archive controlPlane records record "route:host:publicSite:www.example.com" field "instance:route.toUrl" cannot store control-plane secret values.',
    );
    expect(() =>
      parseInstanceArchive({
        ...archive,
        controlPlane: {
          ...controlPlane,
          records: controlPlaneRecords().map((record) =>
            record.entity === "route" && record.id === "route:site:public-site"
              ? {
                  ...record,
                  values: {
                    ...record.values,
                    appInstall: "missing",
                  },
                }
              : record,
          ),
        },
      }),
    ).toThrow(
      'Instance archive controlPlane records record "route:site:public-site" field "instance:route.appInstall" references unknown instance:app-install record "missing".',
    );
  });

  it("rejects deployment execution history as instance control-plane source", () => {
    const archive = instanceArchive({
      capabilities: [
        "installed-app-registry",
        "schema-owned-control-plane",
        "app-store-snapshots",
        "core-media-assets",
      ],
      controlPlane: {
        schemaKey: "instance-control-plane",
        schemaUpdatedAt: now,
        records: [
          ...controlPlaneRecords(),
          {
            id: "deploy-drift:instance.primary",
            entity: "deploy-drift-report",
            values: {
              deployTarget: "instance.primary",
              versionId: "version-1",
              desiredStateHash: "hash-1",
              revision: 1,
              status: "in-sync",
              actorKind: "runner",
              actorId: "runner",
              affectedLogicalIdsJson: "[]",
              createCount: 0,
              updateCount: 0,
              deleteCount: 0,
              reportedAt: now,
            },
            createdAt: now,
          },
        ],
      },
    });

    expect(() => parseInstanceArchive(archive)).toThrow(
      'Instance archive controlPlane records record "deploy-drift:instance.primary" references unknown entity "deploy-drift-report".',
    );
  });

  it("rejects unknown kinds, unsupported versions, and missing sections", () => {
    expect(() => parsePortableArchive({ kind: "formless.futureArchive", version: 1 })).toThrow(
      'Archive kind "formless.futureArchive" is unsupported.',
    );

    expect(() => parseAppArchive({ ...appArchive(), version: 3 })).toThrow(
      "App archive version must be 2.",
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

  it("rejects old app-scoped media capability", () => {
    expect(() =>
      parseAppArchive({
        ...appArchive(),
        capabilities: ["app-scoped-media"],
      }),
    ).toThrow('App archive capabilities[0] "app-scoped-media" is unsupported.');
  });

  it("rejects old app-scoped media capability in instance archives", () => {
    expect(() =>
      parseInstanceArchive({
        ...instanceArchive(),
        capabilities: ["app-scoped-media"],
      }),
    ).toThrow('Instance archive capabilities[0] "app-scoped-media" is unsupported.');
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
    packageRevision: 1,
    sourceSchemaKey: "site",
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    label,
    status: "installed",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:01:00.000Z",
  };
}

function controlPlaneRecords(options: { inputsJson?: string } = {}): StoredRecord[] {
  return [
    {
      id: "site",
      entity: "app-install",
      values: {
        installId: "site",
        packageAppKey: "site",
        label: "Site",
        status: "installed",
        storageIdentity: "app:site",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "route:site:public-site",
      entity: "route",
      values: {
        enabled: true,
        matchPath: "/sites/site",
        matchPrefix: "/sites/site/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "route:host:publicSite:www.example.com",
      entity: "route",
      values: {
        enabled: true,
        matchHost: "www.example.com",
        matchPath: "/",
        matchPrefix: "/",
        kind: "mount",
        targetProfile: "public-site",
        appInstall: "site",
        surface: "public-site",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "instance.primary",
      entity: "deploy-target",
      values: {
        targetId: "instance.primary",
        targetKind: "instance",
        label: "instance.primary",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
    {
      id: "deploy-resource:instance.primary:site-domain",
      entity: "deploy-desired-resource",
      values: {
        deployTarget: "instance.primary",
        route: "route:host:publicSite:www.example.com",
        logicalId: "site-domain",
        kind: "cloudflare-worker-custom-domain",
        providerFamily: "cloudflare",
        inputsJson: options.inputsJson ?? JSON.stringify({ host: "www.example.com" }),
        enabled: true,
        sourceFingerprint: "source",
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
    },
  ];
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
