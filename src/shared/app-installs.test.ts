import { describe, expect, it } from "vite-plus/test";
import {
  appInstallRegistryError,
  createAppInstall,
  findAppInstall,
  findBundledAppPackage,
  listAppInstalls,
  listBundledAppPackages,
  validateAppInstallId,
  type AppInstall,
  type CreateAppInstallResult,
} from "./app-installs.ts";
import { bundledSourceSchemaHashFixtures } from "./upgrade-migrations.ts";

const now = "2026-05-22T08:00:00.000Z";

type CreateAppInstallSuccess = Extract<CreateAppInstallResult, { ok: true }>;
type CreateAppInstallFailure = Extract<CreateAppInstallResult, { ok: false }>;

describe("app install registry", () => {
  it("declares Site, Tasks, Estii, CRM, and ClearTrace as installable bundled app packages", () => {
    expect(listBundledAppPackages()).toEqual([
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
        defaultInstallId: "estii",
        label: "Estii",
        packageAppKey: "estii",
        packageRevision: 1,
        seedRecordsKey: "estii",
        sourceSchemaKey: "estii",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.estii,
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
      expect.objectContaining({
        adminRouteBase: "/apps",
        defaultInstallId: "cleartrace",
        label: "ClearTrace",
        packageAppKey: "cleartrace",
        packageRevision: 1,
        seedRecordsKey: "cleartrace",
        sourceSchemaKey: "cleartrace",
        sourceSchemaHash: bundledSourceSchemaHashFixtures.cleartrace,
        supportsMultipleInstalls: true,
      }),
    ]);
    expect(findBundledAppPackage("site")?.label).toBe("Site");
    expect(findBundledAppPackage("tasks")?.label).toBe("Tasks");
    expect(findBundledAppPackage("estii")?.label).toBe("Estii");
    expect(findBundledAppPackage("crm")?.label).toBe("CRM");
    expect(findBundledAppPackage("cleartrace")?.label).toBe("ClearTrace");
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

  it("creates a flat Estii install without Site public route metadata", () => {
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "estii",
        label: " Estii ",
        now,
        packageAppKey: "estii",
      }),
    );

    expect(result.install).toEqual({
      adminRoute: "/apps/estii",
      createdAt: now,
      installId: "estii",
      label: "Estii",
      packageAppKey: "estii",
      packageRevision: 1,
      schemaRoute: "/apps/estii/schema",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.estii,
      status: "installed",
      updatedAt: now,
    });
    expect(result.initialization).toEqual({
      installId: "estii",
      packageAppKey: "estii",
      seedRecordsKey: "estii",
      sourceSchemaKey: "estii",
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

  it("creates a flat ClearTrace install without Site public route metadata", () => {
    const result = expectSuccess(
      createAppInstall({
        existingInstalls: [],
        installId: "cleartrace",
        label: " ClearTrace ",
        now,
        packageAppKey: "cleartrace",
      }),
    );

    expect(result.install).toEqual({
      adminRoute: "/apps/cleartrace",
      createdAt: now,
      installId: "cleartrace",
      label: "ClearTrace",
      packageAppKey: "cleartrace",
      packageRevision: 1,
      schemaRoute: "/apps/cleartrace/schema",
      sourceSchemaHash: bundledSourceSchemaHashFixtures.cleartrace,
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
