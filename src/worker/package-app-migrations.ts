import type { PackageAppKey } from "../shared/app-installs.ts";
import {
  createUpgradeMigrationRegistry,
  upgradeMigrationFamilyKey,
  type PackageAppRevision,
  type PackageAppUpgradeMigrationFamily,
  type SourceSchemaHash,
  type UpgradeMigrationChecksum,
  type UpgradeMigrationDefinition,
  type UpgradeMigrationId,
  type UpgradeMigrationOwner,
  type UpgradeMigrationSafetyClass,
} from "../shared/upgrade-migrations.ts";
import type { RecordValues, StoredRecord } from "../shared/protocol.ts";
import type { AppSchema } from "../shared/schema.ts";

export type PackageAppMigrationContext = {
  currentSchema: AppSchema;
  fromPackageRevision: PackageAppRevision;
  packageAppKey: PackageAppKey;
  records: StoredRecord[];
  sourceSchemaHash: SourceSchemaHash;
  toPackageRevision: PackageAppRevision;
};

export type PackageAppMigrationRecordCreate = {
  entity: string;
  values: RecordValues;
  createdAt?: string;
  recordId?: string;
};

export type PackageAppMigrationRecordPatch = {
  entity: string;
  recordId: string;
  values?: Partial<RecordValues>;
  unsetValues?: string[];
};

export type PackageAppMigrationRecordTombstone = {
  entity: string;
  recordId: string;
};

export type PackageAppMigrationPlan = {
  schema?: AppSchema;
  creates?: PackageAppMigrationRecordCreate[];
  patches?: PackageAppMigrationRecordPatch[];
  tombstones?: PackageAppMigrationRecordTombstone[];
};

export type AuthorityPackageAppMigration = {
  id: UpgradeMigrationId;
  owner: UpgradeMigrationOwner;
  family: PackageAppUpgradeMigrationFamily;
  checksum: UpgradeMigrationChecksum;
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  fromPackageRevision: PackageAppRevision;
  toPackageRevision: PackageAppRevision;
  migrate: (context: PackageAppMigrationContext) => PackageAppMigrationPlan;
};

export type PackageAppMigrationRegistry = {
  migrations: readonly AuthorityPackageAppMigration[];
};

export const packageAppMigrationRegistry = createPackageAppMigrationRegistry([]);

export function createPackageAppMigrationRegistry(
  migrations: readonly AuthorityPackageAppMigration[],
): PackageAppMigrationRegistry {
  createUpgradeMigrationRegistry(migrations.map(upgradeMigrationDefinitionFromPackageMigration));

  return {
    migrations: [...migrations],
  };
}

export function packageAppMigrationFamily(
  packageAppKey: PackageAppKey,
): PackageAppUpgradeMigrationFamily {
  return {
    kind: "package-app",
    packageAppKey,
  };
}

export function listPackageAppMigrations(
  registry: PackageAppMigrationRegistry,
  family?: PackageAppUpgradeMigrationFamily,
): AuthorityPackageAppMigration[] {
  if (family === undefined) {
    return [...registry.migrations];
  }

  const familyKey = upgradeMigrationFamilyKey(family);

  return registry.migrations.filter(
    (migration) => upgradeMigrationFamilyKey(migration.family) === familyKey,
  );
}

export function selectPackageAppMigrationChain(
  registry: PackageAppMigrationRegistry,
  input: {
    fromPackageRevision: PackageAppRevision;
    packageAppKey: PackageAppKey;
    toPackageRevision: PackageAppRevision;
  },
): AuthorityPackageAppMigration[] {
  const available = listPackageAppMigrations(
    registry,
    packageAppMigrationFamily(input.packageAppKey),
  ).sort((left, right) => {
    const fromOrder = left.fromPackageRevision - right.fromPackageRevision;

    return fromOrder === 0 ? left.toPackageRevision - right.toPackageRevision : fromOrder;
  });
  const selected: AuthorityPackageAppMigration[] = [];
  let revision = input.fromPackageRevision;

  while (revision < input.toPackageRevision) {
    const next = available.find((migration) => migration.fromPackageRevision === revision);

    if (!next || next.toPackageRevision > input.toPackageRevision) {
      throw new Error(
        `Missing package app migration for "${input.packageAppKey}" from revision ${revision} to ${input.toPackageRevision}.`,
      );
    }

    selected.push(next);
    revision = next.toPackageRevision;
  }

  return selected;
}

function upgradeMigrationDefinitionFromPackageMigration(
  migration: AuthorityPackageAppMigration,
): UpgradeMigrationDefinition {
  return {
    ...migration,
    apply: () => ({
      evidence: [],
    }),
  };
}
