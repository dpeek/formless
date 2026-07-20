import { nowIsoString } from "../shared/clock.ts";
import {
  createUpgradeMigrationRegistry,
  upgradeMigrationFamilyKey,
  type StorageUpgradeMigrationFamily,
  type UpgradeMigrationChecksum,
  type UpgradeMigrationDefinition,
  type UpgradeMigrationId,
  type UpgradeMigrationOwner,
  type UpgradeMigrationSafetyClass,
} from "../shared/upgrade-migrations.ts";

export const appliedSqlMigrationsTableName = "formless_applied_sql_migrations";

export type DurableObjectSqlMigration = {
  id: UpgradeMigrationId;
  owner: UpgradeMigrationOwner;
  family: StorageUpgradeMigrationFamily;
  checksum: UpgradeMigrationChecksum;
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  apply: (storage: DurableObjectStorage) => void;
};

export type DurableObjectSqlMigrationRegistry = {
  migrations: readonly DurableObjectSqlMigration[];
};

export type AppliedSqlMigration = {
  storageFamily: string;
  migrationId: UpgradeMigrationId;
  checksum: UpgradeMigrationChecksum;
  packageVersion: string | null;
  appliedAt: string;
};

export type RunSqlStorageMigrationsResult = {
  applied: AppliedSqlMigration[];
  skipped: AppliedSqlMigration[];
};

type AppliedSqlMigrationRow = {
  storage_family: string;
  migration_id: string;
  checksum: UpgradeMigrationChecksum;
  package_version: string | null;
  applied_at: string;
};

export function createSqlStorageMigrationRegistry(
  migrations: readonly DurableObjectSqlMigration[],
): DurableObjectSqlMigrationRegistry {
  createUpgradeMigrationRegistry(migrations.map(upgradeMigrationDefinitionFromSqlMigration));

  return {
    migrations: [...migrations],
  };
}

export function storageSqlMigrationFamily(storageFamily: string): StorageUpgradeMigrationFamily {
  return {
    kind: "storage",
    storageFamily,
  };
}

export function ensureAppliedSqlMigrationsTable(storage: DurableObjectStorage) {
  storage.sql.exec(`
    CREATE TABLE IF NOT EXISTS ${appliedSqlMigrationsTableName} (
      storage_family TEXT NOT NULL,
      migration_id TEXT NOT NULL,
      checksum TEXT NOT NULL CHECK (length(checksum) = 71 AND checksum LIKE 'sha256:%'),
      package_version TEXT,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (storage_family, migration_id)
    )
  `);
}

export function readAppliedSqlMigrations(
  storage: DurableObjectStorage,
  family: StorageUpgradeMigrationFamily,
): AppliedSqlMigration[] {
  ensureAppliedSqlMigrationsTable(storage);

  return storage.sql
    .exec<AppliedSqlMigrationRow>(
      `
        SELECT storage_family, migration_id, checksum, package_version, applied_at
        FROM ${appliedSqlMigrationsTableName}
        WHERE storage_family = ?
        ORDER BY applied_at ASC, migration_id ASC
      `,
      family.storageFamily,
    )
    .toArray()
    .map(appliedSqlMigrationFromRow);
}

export function readAllAppliedSqlMigrations(storage: DurableObjectStorage): AppliedSqlMigration[] {
  ensureAppliedSqlMigrationsTable(storage);

  return storage.sql
    .exec<AppliedSqlMigrationRow>(
      `
        SELECT storage_family, migration_id, checksum, package_version, applied_at
        FROM ${appliedSqlMigrationsTableName}
        ORDER BY storage_family ASC, applied_at ASC, migration_id ASC
      `,
    )
    .toArray()
    .map(appliedSqlMigrationFromRow);
}

export function recordAppliedSqlMigration(
  storage: DurableObjectStorage,
  migration: AppliedSqlMigration,
) {
  ensureAppliedSqlMigrationsTable(storage);
  storage.sql.exec(
    `
      INSERT INTO ${appliedSqlMigrationsTableName} (
        storage_family,
        migration_id,
        checksum,
        package_version,
        applied_at
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    migration.storageFamily,
    migration.migrationId,
    migration.checksum,
    migration.packageVersion,
    migration.appliedAt,
  );
}

export function runSqlStorageMigrations(
  storage: DurableObjectStorage,
  input: {
    family: StorageUpgradeMigrationFamily;
    migrations: DurableObjectSqlMigrationRegistry;
    now?: string;
    packageVersion?: string | null;
  },
): RunSqlStorageMigrationsResult {
  return storage.transactionSync(() => {
    ensureAppliedSqlMigrationsTable(storage);

    const appliedById = new Map(
      readAppliedSqlMigrations(storage, input.family).map((migration) => [
        migration.migrationId,
        migration,
      ]),
    );
    const applied: AppliedSqlMigration[] = [];
    const skipped: AppliedSqlMigration[] = [];

    for (const migration of input.migrations.migrations) {
      if (!sameStorageMigrationFamily(migration.family, input.family)) {
        continue;
      }

      const existing = appliedById.get(migration.id);

      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Applied SQL migration "${migration.id}" for storage family "${input.family.storageFamily}" has checksum "${existing.checksum}", expected "${migration.checksum}".`,
          );
        }

        skipped.push(existing);
        continue;
      }

      migration.apply(storage);

      const appliedMigration = {
        appliedAt: input.now ?? nowIsoString(),
        checksum: migration.checksum,
        migrationId: migration.id,
        packageVersion: input.packageVersion ?? null,
        storageFamily: input.family.storageFamily,
      } satisfies AppliedSqlMigration;

      recordAppliedSqlMigration(storage, appliedMigration);
      appliedById.set(migration.id, appliedMigration);
      applied.push(appliedMigration);
    }

    return {
      applied,
      skipped,
    };
  });
}

function upgradeMigrationDefinitionFromSqlMigration(
  migration: DurableObjectSqlMigration,
): UpgradeMigrationDefinition {
  return {
    ...migration,
    apply: () => ({
      evidence: [],
    }),
  };
}

function sameStorageMigrationFamily(
  left: StorageUpgradeMigrationFamily,
  right: StorageUpgradeMigrationFamily,
) {
  return upgradeMigrationFamilyKey(left) === upgradeMigrationFamilyKey(right);
}

function appliedSqlMigrationFromRow(row: AppliedSqlMigrationRow): AppliedSqlMigration {
  return {
    appliedAt: row.applied_at,
    checksum: row.checksum,
    migrationId: row.migration_id,
    packageVersion: row.package_version,
    storageFamily: row.storage_family,
  };
}
