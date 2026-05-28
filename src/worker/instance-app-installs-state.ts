import {
  appInstallRegistryError,
  createAppInstall,
  findAppInstall,
  findBundledAppPackage,
  listAppInstalls,
  type AppInstall,
  type CreateAppInstallResult,
} from "../shared/app-installs.ts";
import type { CreateAppInstallRequest } from "../shared/protocol.ts";
import {
  bundledSourceSchemaHashFixtures,
  isSourceSchemaHash,
  type PackageAppRevision,
  type SourceSchemaHash,
} from "../shared/upgrade-migrations.ts";
import { findWorkerSchemaAppDefinition } from "./schema-apps.ts";
import {
  createSqlStorageMigrationRegistry,
  runSqlStorageMigrations,
  storageSqlMigrationFamily,
} from "./sql-migrations.ts";

type AppInstallRow = {
  install_id: string;
  package_app_key: string;
  package_revision: number | null;
  source_schema_hash: string | null;
  label: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type TableInfoRow = {
  name: string;
};

const instanceAppInstallsSqlMigrationFamily = storageSqlMigrationFamily("instance-app-installs");
const instanceAppInstallsSqlMigrations = createSqlStorageMigrationRegistry([
  {
    id: "2026-05-28-instance-app-installs-package-facts",
    owner: "formless",
    family: instanceAppInstallsSqlMigrationFamily,
    checksum: "sha256:0d3e904259214f8c83da95033fc8be3ca8f1502b44471fb47fa6f11000102f12",
    safety: "auto-safe",
    summary: "Backfill app install package revision and source schema hash columns.",
    apply: ensureInstanceAppInstallPackageFactColumns,
  },
]);

export function ensureInstanceAppInstallTables(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS app_installs (
      install_id TEXT PRIMARY KEY,
      package_app_key TEXT NOT NULL,
      package_revision INTEGER NOT NULL DEFAULT 1,
      source_schema_hash TEXT,
      label TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status = 'installed'),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  runSqlStorageMigrations(storage, {
    family: instanceAppInstallsSqlMigrationFamily,
    migrations: instanceAppInstallsSqlMigrations,
  });
}

export function readInstanceAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  ensureInstanceAppInstallTables(storage);

  return listAppInstalls(readAppInstalls(storage));
}

export function readLegacyInstanceAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  return readInstanceAppInstalls(storage);
}

export function createInstanceAppInstall(
  storage: DurableObjectStorage,
  input: CreateAppInstallRequest & { now: string },
): CreateAppInstallResult {
  ensureInstanceAppInstallTables(storage);

  return storage.transactionSync(() => {
    const result = createAppInstall({
      existingInstalls: readAppInstalls(storage),
      installId: input.installId,
      label: input.label,
      now: input.now,
      packageAppKey: input.packageAppKey,
      validateInitialSource: ({ initialization }) => {
        const source = findWorkerSchemaAppDefinition(initialization.sourceSchemaKey);
        const seed = findWorkerSchemaAppDefinition(initialization.seedRecordsKey);

        if (!source || !seed) {
          return appInstallRegistryError(
            "source-validation-failed",
            "source",
            `Package app "${initialization.packageAppKey}" source is unavailable.`,
          );
        }

        return undefined;
      },
    });

    if (!result.ok) {
      return result;
    }

    storage.sql.exec(
      `
        INSERT INTO app_installs (
          install_id,
          package_app_key,
          package_revision,
          source_schema_hash,
          label,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      result.install.installId,
      result.install.packageAppKey,
      result.install.packageRevision,
      result.install.sourceSchemaHash,
      result.install.label,
      result.install.status,
      result.install.createdAt,
      result.install.updatedAt,
    );

    return {
      ...result,
      installs: readInstanceAppInstalls(storage),
    };
  });
}

export function restoreInstanceAppInstall(
  storage: DurableObjectStorage,
  input: { action: "create" | "replace"; install: AppInstall },
): AppInstall[] {
  ensureInstanceAppInstallTables(storage);

  return storage.transactionSync(() => {
    const existing = findAppInstall(readAppInstalls(storage), input.install.installId);

    if (input.action === "create" && existing) {
      throw new Error(`Install id "${input.install.installId}" is already installed.`);
    }

    if (input.action === "replace" && !existing) {
      throw new Error(`Install id "${input.install.installId}" is not installed.`);
    }

    if (existing && existing.packageAppKey !== input.install.packageAppKey) {
      throw new Error(
        `Install id "${input.install.installId}" uses package "${existing.packageAppKey}", not "${input.install.packageAppKey}".`,
      );
    }

    storage.sql.exec(
      `
        INSERT INTO app_installs (
          install_id,
          package_app_key,
          package_revision,
          source_schema_hash,
          label,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(install_id) DO UPDATE SET
          package_app_key = excluded.package_app_key,
          package_revision = excluded.package_revision,
          source_schema_hash = excluded.source_schema_hash,
          label = excluded.label,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      input.install.installId,
      input.install.packageAppKey,
      input.install.packageRevision,
      input.install.sourceSchemaHash,
      input.install.label,
      input.install.status,
      input.install.createdAt,
      input.install.updatedAt,
    );

    return readInstanceAppInstalls(storage);
  });
}

export function updateInstanceAppInstallPackageFacts(
  storage: DurableObjectStorage,
  input: {
    installId: string;
    packageAppKey: string;
    packageRevision: PackageAppRevision;
    sourceSchemaHash: SourceSchemaHash;
    now: string;
  },
): AppInstall[] {
  ensureInstanceAppInstallTables(storage);

  return storage.transactionSync(() => {
    const existing = findAppInstall(readAppInstalls(storage), input.installId);

    if (!existing) {
      throw new Error(`Install id "${input.installId}" is not installed.`);
    }

    if (existing.packageAppKey !== input.packageAppKey) {
      throw new Error(
        `Install id "${input.installId}" uses package "${existing.packageAppKey}", not "${input.packageAppKey}".`,
      );
    }

    storage.sql.exec(
      `
        UPDATE app_installs
        SET package_revision = ?,
          source_schema_hash = ?,
          updated_at = ?
        WHERE install_id = ? AND package_app_key = ?
      `,
      input.packageRevision,
      input.sourceSchemaHash,
      input.now,
      input.installId,
      input.packageAppKey,
    );

    return readInstanceAppInstalls(storage);
  });
}

function readAppInstalls(storage: DurableObjectStorage): AppInstall[] {
  const installs: AppInstall[] = [];

  for (const row of storage.sql.exec<AppInstallRow>(
    `
      SELECT
        install_id,
        package_app_key,
        package_revision,
        source_schema_hash,
        label,
        status,
        created_at,
        updated_at
      FROM app_installs
      ORDER BY created_at ASC, install_id ASC
    `,
  )) {
    installs.push(appInstallFromRow(row));
  }

  return installs;
}

function ensureInstanceAppInstallPackageFactColumns(storage: DurableObjectStorage) {
  const columns = new Set<string>();

  for (const row of storage.sql.exec<TableInfoRow>("PRAGMA table_info(app_installs)")) {
    columns.add(row.name);
  }

  if (!columns.has("package_revision")) {
    storage.sql.exec(
      "ALTER TABLE app_installs ADD COLUMN package_revision INTEGER NOT NULL DEFAULT 1",
    );
  }

  if (!columns.has("source_schema_hash")) {
    storage.sql.exec("ALTER TABLE app_installs ADD COLUMN source_schema_hash TEXT");
  }

  storage.sql.exec(
    `
      UPDATE app_installs
      SET source_schema_hash = CASE package_app_key
        WHEN 'site' THEN ?
        WHEN 'tasks' THEN ?
        WHEN 'estii' THEN ?
        ELSE source_schema_hash
      END
      WHERE source_schema_hash IS NULL OR source_schema_hash = ''
    `,
    bundledSourceSchemaHashFixtures.site,
    bundledSourceSchemaHashFixtures.tasks,
    bundledSourceSchemaHashFixtures.estii,
  );
}

function appInstallFromRow(row: AppInstallRow): AppInstall {
  const packageApp = findBundledAppPackage(row.package_app_key);

  if (!packageApp) {
    throw new Error(`Stored app install "${row.install_id}" has unsupported package.`);
  }

  return {
    installId: row.install_id,
    packageAppKey: packageApp.packageAppKey,
    packageRevision: packageRevisionFromRow(row.package_revision, packageApp.packageRevision),
    sourceSchemaHash: sourceSchemaHashFromRow(row.source_schema_hash, packageApp.sourceSchemaHash),
    label: row.label,
    status: "installed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    adminRoute: `${packageApp.adminRouteBase}/${row.install_id}`,
    schemaRoute: `${packageApp.adminRouteBase}/${row.install_id}/schema`,
    ...(packageApp.publicRouteBase === undefined
      ? {}
      : {
          publicRoute: `${packageApp.publicRouteBase}/${row.install_id}`,
          publicRoutePrefix: `${packageApp.publicRouteBase}/${row.install_id}/`,
        }),
  };
}

function packageRevisionFromRow(
  value: number | null,
  fallback: PackageAppRevision,
): PackageAppRevision {
  return Number.isInteger(value) && value !== null && value > 0 ? value : fallback;
}

function sourceSchemaHashFromRow(
  value: string | null,
  fallback: SourceSchemaHash,
): SourceSchemaHash {
  return isSourceSchemaHash(value) ? value : fallback;
}
