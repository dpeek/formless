import { describe, expect, it } from "vite-plus/test";

import {
  APP_ARCHIVE_KIND,
  ARCHIVE_VERSION,
  INSTANCE_ARCHIVE_KIND,
  type AppArchive,
  type InstanceArchive,
} from "./archive.ts";
import {
  findArchiveNormalizer,
  listArchiveNormalizers,
  normalizePortableArchive,
} from "./archive-normalizers.ts";
import { planPortableArchiveRestore } from "./archive-restore-plan.ts";
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

describe("portable archive normalizers", () => {
  it("registers version-specific app and instance normalizers", () => {
    expect(listArchiveNormalizers().map((normalizer) => normalizer.normalizerId)).toEqual([
      "archive.app.v1-to-v2.package-facts",
      "archive.instance.v1-to-v2.package-facts",
    ]);
    expect(findArchiveNormalizer({ archiveKind: APP_ARCHIVE_KIND, version: 1 })).toMatchObject({
      fromVersion: 1,
      toVersion: ARCHIVE_VERSION,
    });
  });

  it("normalizes older app archives by adding package facts before current parsing", () => {
    const normalized = normalizePortableArchive(legacyV1Archive(appArchive()));

    expect(normalized.evidence).toEqual([
      {
        archiveKind: APP_ARCHIVE_KIND,
        fromVersion: 1,
        normalizerId: "archive.app.v1-to-v2.package-facts",
        summary: "Add package revision and source schema hash facts to app archive installs.",
        toVersion: ARCHIVE_VERSION,
      },
    ]);
    expect(normalized.archive).toMatchObject({
      kind: APP_ARCHIVE_KIND,
      version: ARCHIVE_VERSION,
      app: {
        packageRevision: 1,
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      },
    });
  });

  it("normalizes older instance archives before restore planning validates records", () => {
    const result = planPortableArchiveRestore(legacyV1Archive(instanceArchive()), {
      sourceSchemas: { site: siteSourceSchema },
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(result.errors.map((error) => error.message).join("\n"));
    }

    expect(result.plan.summary.createdInstalls).toEqual(["personal"]);
    expect(result.plan.steps.map((step) => step.kind)).toEqual(["createInstall", "restoreAppData"]);
  });

  it("normalizes legacy control-plane entity names before current instance archive parsing", () => {
    const normalized = normalizePortableArchive(
      instanceArchive({
        capabilities: [
          "installed-app-registry",
          "schema-owned-control-plane",
          "app-store-snapshots",
        ],
        controlPlane: {
          schemaKey: "instance-control-plane",
          schemaUpdatedAt: now,
          records: [
            controlPlaneAppInstallRecord({ entity: "appInstall" }),
            controlPlaneAppInstallRecord({
              entity: "instance:appInstall",
              id: "docs",
              installId: "docs",
              label: "Docs",
            }),
          ],
        },
      }),
    );

    expect(normalized.evidence).toEqual([
      {
        archiveKind: INSTANCE_ARCHIVE_KIND,
        details: [
          "appInstall -> instance:app-install (1 record)",
          "instance:appInstall -> instance:app-install (1 record)",
        ],
        fromVersion: ARCHIVE_VERSION,
        normalizerId: "archive.instance.control-plane-entity-names",
        summary:
          "Normalize legacy instance control-plane entity names to qualified kebab-case names.",
        toVersion: ARCHIVE_VERSION,
      },
    ]);
    expect(
      normalized.archive.kind === INSTANCE_ARCHIVE_KIND
        ? normalized.archive.controlPlane?.records.map((record) => record.entity)
        : [],
    ).toEqual(["app-install", "app-install"]);
  });

  it("rejects mixed legacy and canonical control-plane entity spellings", () => {
    expect(() =>
      normalizePortableArchive(
        instanceArchive({
          capabilities: [
            "installed-app-registry",
            "schema-owned-control-plane",
            "app-store-snapshots",
          ],
          controlPlane: {
            schemaKey: "instance-control-plane",
            schemaUpdatedAt: now,
            records: [
              controlPlaneAppInstallRecord({ entity: "appInstall", id: "personal" }),
              controlPlaneAppInstallRecord({
                entity: "instance:app-install",
                id: "docs",
                installId: "docs",
                label: "Docs",
              }),
            ],
          },
        }),
      ),
    ).toThrow(
      'Instance archive controlPlane records mix legacy and canonical entity names for "instance:app-install".',
    );
  });

  it("rejects unsupported control-plane entity spelling during normalization", () => {
    expect(() =>
      normalizePortableArchive(
        instanceArchive({
          capabilities: [
            "installed-app-registry",
            "schema-owned-control-plane",
            "app-store-snapshots",
          ],
          controlPlane: {
            schemaKey: "instance-control-plane",
            schemaUpdatedAt: now,
            records: [controlPlaneAppInstallRecord({ entity: "instance:app_install" })],
          },
        }),
      ),
    ).toThrow(
      'Instance archive controlPlane records[0] record "personal" entity must be a qualified entity name in "<schema-key>:<entity-key>" format with kebab-case schema and entity keys.',
    );
  });

  it("rejects unsupported archive versions without a registered normalizer", () => {
    expect(() =>
      normalizePortableArchive({
        ...(legacyV1Archive(instanceArchive()) as Record<string, unknown>),
        version: 0,
      }),
    ).toThrow("Archive version 0 has no registered normalizer for formless.instanceArchive.");
  });
});

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
    app: {
      installId: "personal",
      packageAppKey: "site",
      packageRevision: 1,
      sourceSchemaKey: "site",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      label: "Personal",
      status: "installed",
      createdAt: "2026-05-23T00:00:00.000Z",
      updatedAt: "2026-05-23T00:01:00.000Z",
    },
    data: {
      kind: "storeSnapshot",
      snapshot: storeSnapshot(),
    },
    media: { objects: [] },
    ...overrides,
  };
}

function legacyV1Archive(archive: InstanceArchive | AppArchive): unknown {
  const copy = JSON.parse(JSON.stringify(archive)) as {
    app?: Record<string, unknown>;
    apps?: unknown[];
    kind: string;
    version: number;
  };

  copy.version = 1;

  if (copy.kind === INSTANCE_ARCHIVE_KIND) {
    copy.apps = (copy.apps ?? []).map((app) =>
      legacyV1Archive(app as InstanceArchive | AppArchive),
    );
    return copy;
  }

  if (copy.app) {
    delete copy.app.packageRevision;
    delete copy.app.sourceSchemaHash;
  }

  return copy;
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

function activeSiteRecord(id: string): StoredRecord {
  const fixture = testSiteSeedRecords[0] as StoredRecord;

  return {
    id,
    entity: fixture.entity,
    values: {
      ...fixture.values,
    },
    createdAt: "2026-05-23T00:00:02.000Z",
  };
}

function controlPlaneAppInstallRecord(input: {
  entity: string;
  id?: string;
  installId?: string;
  label?: string;
}): StoredRecord {
  const installId = input.installId ?? input.id ?? "personal";

  return {
    id: input.id ?? installId,
    entity: input.entity,
    values: {
      installId,
      packageAppKey: "site",
      label: input.label ?? "Personal",
      status: "installed",
      storageIdentity: `app:${installId}`,
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
  };
}
