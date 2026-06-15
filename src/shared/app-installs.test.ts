import { describe, expect, it } from "vite-plus/test";
import {
  appInstallRegistryError,
  createAppInstall,
  findAppInstall,
  listAppInstalls,
  listInstallableAppPackages,
  validateAppInstallId,
  type AppInstall,
  type CreateAppInstallResult,
} from "./app-installs.ts";
import {
  appPackageManifestKind,
  appPackageManifestVersion,
  bundledAppPackageManifests,
  createAppPackageResolver,
} from "./app-packages.ts";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";

const now = "2026-05-22T08:00:00.000Z";
const privateSourceSchemaHash =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222";

type CreateAppInstallSuccess = Extract<CreateAppInstallResult, { ok: true }>;
type CreateAppInstallFailure = Extract<CreateAppInstallResult, { ok: false }>;

describe("app install registry", () => {
  it("declares Site, Tasks, and CRM as default installable app packages", () => {
    const packages = listInstallableAppPackages();

    expect(packages).toEqual([
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "site",
        label: "Site",
        packageAppKey: "site",
        packageRevision: 1,
        publicRouteBase: "/sites",
        seedRecordsKey: "site",
        sourceSchemaKey: "site",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
        supportsMultipleInstalls: true,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "tasks",
        label: "Tasks",
        packageAppKey: "tasks",
        packageRevision: 1,
        seedRecordsKey: "tasks",
        sourceSchemaKey: "tasks",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
        supportsMultipleInstalls: true,
      }),
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "crm",
        label: "CRM",
        packageAppKey: "crm",
        packageRevision: 1,
        seedRecordsKey: "crm",
        sourceSchemaKey: "crm",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
        supportsMultipleInstalls: true,
      }),
    ]);
    expect(packages.find((appPackage) => appPackage.packageAppKey === "site")?.label).toBe("Site");
    expect(packages.find((appPackage) => appPackage.packageAppKey === "tasks")?.label).toBe(
      "Tasks",
    );
    expect(packages.find((appPackage) => appPackage.packageAppKey === "crm")?.label).toBe("CRM");
    expect(
      packages.find((appPackage) => appPackage.packageAppKey === "cleartrace"),
    ).toBeUndefined();
  });

  it("validates route-safe install ids", () => {
    expect(validateAppInstallId(" docs-site ")).toEqual({
      ok: true,
      installId: "docs-site",
    });
    expect(validateAppInstallId("d1")).toEqual({
      ok: true,
      installId: "d1",
    });
    expect(validateAppInstallId("project-site-2026")).toEqual({
      ok: true,
      installId: "project-site-2026",
    });
    expect(validateAppInstallId("site")).toEqual({
      ok: true,
      installId: "site",
    });
    expect(validateAppInstallId("tasks")).toEqual({
      ok: true,
      installId: "tasks",
    });

    for (const value of [
      "",
      "a",
      "Docs",
      "-docs",
      "docs-",
      "docs--site",
      "docs/site",
      "api",
      "apps",
      "setup",
      "sites",
      "x".repeat(49),
    ]) {
      expect(validateAppInstallId(value).ok).toBe(false);
    }
  });

  it("creates a flat Site install with route metadata and bundled source initialization", () => {
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "personal",
        label: " Personal Site ",
        now,
        packageAppKey: "site",
      }),
    );

    expect(result.install).toEqual({
      adminRoute: "/apps/personal",
      createdAt: now,
      installId: "personal",
      label: "Personal Site",
      packageAppKey: "site",
      packageRevision: 1,
      publicRoute: "/sites/personal",
      publicRoutePrefix: "/sites/personal/",
      schemaRoute: "/apps/personal/schema",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
      status: "installed",
      updatedAt: now,
    });
    expect(result.initialization).toEqual({
      installId: "personal",
      packageAppKey: "site",
      seedRecordsKey: "site",
      sourceSchemaKey: "site",
    });
    expect(result.installs).toEqual([result.install]);
  });

  it("creates a flat Tasks install without Site public route metadata", () => {
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "tasks",
        label: " Tasks ",
        now,
        packageAppKey: "tasks",
      }),
    );

    expect(result.install).toEqual({
      adminRoute: "/apps/tasks",
      createdAt: now,
      installId: "tasks",
      label: "Tasks",
      packageAppKey: "tasks",
      packageRevision: 1,
      schemaRoute: "/apps/tasks/schema",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.tasks,
      status: "installed",
      updatedAt: now,
    });
    expect(result.initialization).toEqual({
      installId: "tasks",
      packageAppKey: "tasks",
      seedRecordsKey: "tasks",
      sourceSchemaKey: "tasks",
    });
  });

  it("creates a flat CRM install without Site public route metadata", () => {
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "crm",
        label: " CRM ",
        now,
        packageAppKey: "crm",
      }),
    );

    expect(result.install).toEqual({
      adminRoute: "/apps/crm",
      createdAt: now,
      installId: "crm",
      label: "CRM",
      packageAppKey: "crm",
      packageRevision: 1,
      schemaRoute: "/apps/crm/schema",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.crm,
      status: "installed",
      updatedAt: now,
    });
    expect(result.initialization).toEqual({
      installId: "crm",
      packageAppKey: "crm",
      seedRecordsKey: "crm",
      sourceSchemaKey: "crm",
    });
  });

  it("creates a flat ClearTrace install only through the active resolver", () => {
    const resolver = createAppPackageResolver([
      ...bundledAppPackageManifests,
      cleartracePackageManifest(),
    ]);
    const unavailable = expectFailure(
      createAppInstall({
        existingInstalls: [],
        installId: "cleartrace",
        label: "ClearTrace",
        now,
        packageAppKey: "cleartrace",
      }),
    );
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "cleartrace",
        label: " ClearTrace ",
        now,
        packageAppKey: "cleartrace",
        packageResolver: resolver,
      }),
    );

    expect(unavailable.error.code).toBe("unsupported-package");
    expect(result.install).toEqual({
      adminRoute: "/apps/cleartrace",
      createdAt: now,
      installId: "cleartrace",
      label: "ClearTrace",
      packageAppKey: "cleartrace",
      packageRevision: 1,
      schemaRoute: "/apps/cleartrace/schema",
      sourceSchemaHash: privateSourceSchemaHash,
      status: "installed",
      updatedAt: now,
    });
    expect(result.initialization).toEqual({
      installId: "cleartrace",
      packageAppKey: "cleartrace",
      seedRecordsKey: "cleartrace",
      sourceSchemaKey: "cleartrace",
    });
  });

  it("passes bundled resolved source metadata to initial source validation", () => {
    for (const appPackage of listInstallableAppPackages()) {
      const result = expectSuccess(
        createAppInstall({
          existingInstalls: [],
          installId: appPackage.defaultInstallId,
          label: appPackage.label,
          now,
          packageAppKey: appPackage.packageAppKey,
          validateInitialSource: (context) => {
            expect(context.packageApp).toMatchObject({
              packageAppKey: appPackage.packageAppKey,
              seedRecordsKey: appPackage.seedRecordsKey,
              sourceSchemaKey: appPackage.sourceSchemaKey,
            });
            expect(context.initialization).toEqual({
              installId: appPackage.defaultInstallId,
              packageAppKey: appPackage.packageAppKey,
              seedRecordsKey: appPackage.seedRecordsKey,
              sourceSchemaKey: appPackage.sourceSchemaKey,
            });

            return undefined;
          },
        }),
      );

      expect(result.initialization.sourceSchemaKey).toBe(appPackage.sourceSchemaKey);
      expect(result.initialization.seedRecordsKey).toBe(appPackage.seedRecordsKey);
    }
  });

  it("creates a private package install only through the active resolver", () => {
    const resolver = createAppPackageResolver([
      ...bundledAppPackageManifests,
      privatePackageManifest(),
    ]);
    const unavailable = expectFailure(
      createAppInstall({
        existingInstalls: [],
        installId: "labs",
        label: "Private Labs",
        now,
        packageAppKey: "private-labs",
      }),
    );
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "labs",
        label: " Private Labs ",
        now,
        packageAppKey: "private-labs",
        packageResolver: resolver,
        validateInitialSource: (context) => {
          expect(context.packageApp.sourceSchemaLocation).toEqual({
            kind: "workspace",
            key: "private-labs",
            path: "packages/private-labs/schema.json",
          });
          expect(context.packageApp.seedRecordsLocation).toEqual({
            kind: "workspace",
            key: "private-labs",
            path: "packages/private-labs/seed-records.json",
          });
          expect(context.initialization).toEqual({
            installId: "labs",
            packageAppKey: "private-labs",
            seedRecordsKey: "private-labs",
            sourceSchemaKey: "private-labs",
          });

          return undefined;
        },
      }),
    );

    expect(unavailable.error.code).toBe("unsupported-package");
    expect(result.install).toEqual({
      adminRoute: "/apps/labs",
      createdAt: now,
      installId: "labs",
      label: "Private Labs",
      packageAppKey: "private-labs",
      packageRevision: 7,
      publicRoute: "/sites/labs",
      publicRoutePrefix: "/sites/labs/",
      schemaRoute: "/apps/labs/schema",
      sourceSchemaHash: privateSourceSchemaHash,
      status: "installed",
      updatedAt: now,
    });
    expect(JSON.stringify(result.install)).not.toContain("packages/private-labs");
    expect(JSON.stringify(result.install)).not.toContain("workspace");
  });

  it("lists and finds installed apps without mutating registry state", () => {
    const docs = siteInstallFixture({
      createdAt: "2026-05-22T08:02:00.000Z",
      installId: "docs",
      label: "Docs",
    });
    const personal = siteInstallFixture({
      createdAt: "2026-05-22T08:01:00.000Z",
      installId: "personal",
      label: "Personal",
    });
    const installs = [docs, personal] as const;

    expect(listAppInstalls(installs).map((install) => install.installId)).toEqual([
      "personal",
      "docs",
    ]);
    expect(findAppInstall(installs, "docs")).toBe(docs);
    expect(findAppInstall(installs, "missing")).toBeUndefined();
  });

  it("rejects unsupported packages, invalid labels, and duplicate install ids", () => {
    const existing = [siteInstallFixture({ installId: "personal", label: "Personal" })] as const;

    const unsupportedPackage = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "tasks",
        label: "Tasks",
        now,
        packageAppKey: "missing",
      }),
    );
    const invalidLabel = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "docs",
        label: " ",
        now,
        packageAppKey: "site",
      }),
    );
    const duplicateInstallId = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "personal",
        label: "Personal Tasks",
        now,
        packageAppKey: "tasks",
      }),
    );

    expect(unsupportedPackage.error.code).toBe("unsupported-package");
    expect(invalidLabel.error.code).toBe("invalid-label");
    expect(duplicateInstallId.error.code).toBe("duplicate-install-id");
    expect(unsupportedPackage.installs).toBe(existing);
    expect(invalidLabel.installs).toBe(existing);
    expect(duplicateInstallId.installs).toBe(existing);
  });

  it("keeps existing installs unchanged when initial source validation fails", () => {
    const existing = Object.freeze([
      siteInstallFixture({
        installId: "personal",
        label: "Personal",
      }),
    ]);
    const sourceError = appInstallRegistryError(
      "source-validation-failed",
      "source",
      "Bundled Site seed records are invalid.",
    );
    const result = expectFailure(
      createAppInstall({
        existingInstalls: existing,
        installId: "docs",
        label: "Docs",
        now,
        packageAppKey: "site",
        validateInitialSource: (context) => {
          expect(context.initialization).toEqual({
            installId: "docs",
            packageAppKey: "site",
            seedRecordsKey: "site",
            sourceSchemaKey: "site",
          });

          return sourceError;
        },
      }),
    );

    expect(result.error).toEqual(sourceError);
    expect(result.installs).toBe(existing);
    expect(existing).toHaveLength(1);
  });
});

function expectSuccess(result: CreateAppInstallResult): CreateAppInstallSuccess {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return result;
}

function expectFailure(result: CreateAppInstallResult): CreateAppInstallFailure {
  expect(result.ok).toBe(false);

  if (result.ok) {
    throw new Error(`Expected install creation to fail for ${result.install.installId}.`);
  }

  return result;
}

function siteInstallFixture(input: {
  createdAt?: string;
  installId: string;
  label: string;
}): AppInstall {
  const createdAt = input.createdAt ?? now;

  return {
    adminRoute: `/apps/${input.installId}`,
    createdAt,
    installId: input.installId,
    label: input.label,
    packageAppKey: "site",
    packageRevision: 1,
    publicRoute: `/sites/${input.installId}`,
    publicRoutePrefix: `/sites/${input.installId}/`,
    schemaRoute: `/apps/${input.installId}/schema`,
    sourceSchemaHash: bundledSourceSchemaHashFixtures.site,
    status: "installed",
    updatedAt: createdAt,
  };
}

function privatePackageManifest(): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "private-labs",
    label: "Private Labs",
    description: "Private lab package fixture.",
    defaultInstallId: "labs",
    supportsMultipleInstalls: false,
    packageRevision: 7,
    sourceSchema: {
      kind: "workspace",
      key: "private-labs",
      path: "packages/private-labs/schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "private-labs",
      path: "packages/private-labs/seed-records.json",
    },
    sourceSchemaHash: privateSourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
      {
        kind: "publicSite",
        routeBase: "/sites",
      },
    ],
  };
}

function cleartracePackageManifest(): Record<string, unknown> {
  return {
    kind: appPackageManifestKind,
    version: appPackageManifestVersion,
    packageAppKey: "cleartrace",
    label: "ClearTrace",
    description: "Private ClearTrace package fixture.",
    defaultInstallId: "cleartrace",
    supportsMultipleInstalls: true,
    packageRevision: 1,
    sourceSchema: {
      kind: "workspace",
      key: "cleartrace",
      path: "schema.json",
    },
    seedRecords: {
      kind: "workspace",
      key: "cleartrace",
      path: "seed-records.json",
    },
    sourceSchemaHash: privateSourceSchemaHash,
    capabilities: [
      {
        kind: "generatedAdmin",
        routeBase: "/apps",
      },
    ],
  };
}
