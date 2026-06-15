import type { PackageAppKey } from "./app-installs.ts";
import type { SchemaKey } from "./schema-apps.ts";

export type UpgradeMigrationId = string;
export type UpgradeMigrationOwner = string;
export type UpgradeMigrationChecksum = `sha256:${string}`;
export type SourceSchemaHash = `sha256:${string}`;
export type PackageAppRevision = number;

export const upgradeMigrationSafetyClasses = [
  "auto-safe",
  "auto-with-backup",
  "manual-approval",
] as const;

export type UpgradeMigrationSafetyClass = (typeof upgradeMigrationSafetyClasses)[number];

export type StorageUpgradeMigrationFamily = {
  kind: "storage";
  storageFamily: string;
};

export type PackageAppUpgradeMigrationFamily = {
  kind: "package-app";
  packageAppKey: PackageAppKey;
};

export type RuntimeUpgradeMigrationFamily = {
  kind: "runtime";
  runtimeFamily: string;
};

export type BrowserReplicaUpgradeMigrationFamily = {
  kind: "browser-replica";
  replicaFamily: string;
};

export type ArchiveUpgradeMigrationFamily = {
  archiveFamily: string;
  kind: "archive";
};

export type UpgradeMigrationFamily =
  | StorageUpgradeMigrationFamily
  | PackageAppUpgradeMigrationFamily
  | RuntimeUpgradeMigrationFamily
  | BrowserReplicaUpgradeMigrationFamily
  | ArchiveUpgradeMigrationFamily;

export type UpgradeMigrationApplyEvidence = {
  migrationId: UpgradeMigrationId;
  family: UpgradeMigrationFamily;
  checksum: UpgradeMigrationChecksum;
  owner: UpgradeMigrationOwner;
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  appliedAt: string;
  packageVersion?: string;
  fromPackageRevision?: PackageAppRevision;
  toPackageRevision?: PackageAppRevision;
};

export type UpgradeMigrationApplyContext = {
  dryRun: boolean;
  now: string;
};

export type UpgradeMigrationApplyResult = {
  evidence: UpgradeMigrationApplyEvidence[];
};

export type UpgradeMigrationApply = (
  context: UpgradeMigrationApplyContext,
) => Promise<UpgradeMigrationApplyResult> | UpgradeMigrationApplyResult;

export type UpgradeMigrationBase = {
  id: UpgradeMigrationId;
  owner: UpgradeMigrationOwner;
  family: UpgradeMigrationFamily;
  checksum: UpgradeMigrationChecksum;
  safety: UpgradeMigrationSafetyClass;
  summary: string;
  apply: UpgradeMigrationApply;
};

export type PackageAppUpgradeMigration = Omit<UpgradeMigrationBase, "family"> & {
  family: PackageAppUpgradeMigrationFamily;
  fromPackageRevision: PackageAppRevision;
  toPackageRevision: PackageAppRevision;
};

export type NonPackageAppUpgradeMigration = Omit<UpgradeMigrationBase, "family"> & {
  family:
    | StorageUpgradeMigrationFamily
    | RuntimeUpgradeMigrationFamily
    | BrowserReplicaUpgradeMigrationFamily
    | ArchiveUpgradeMigrationFamily;
  fromPackageRevision?: never;
  toPackageRevision?: never;
};

export type UpgradeMigrationDefinition = NonPackageAppUpgradeMigration | PackageAppUpgradeMigration;

export type UpgradeMigrationRegistry = {
  migrations: readonly UpgradeMigrationDefinition[];
};

export type UpgradeMigrationRegistryErrorCode =
  | "duplicate-migration-id"
  | "invalid-checksum"
  | "invalid-package-revision-range"
  | "invalid-safety-class";

export type UpgradeMigrationRegistryError = {
  code: UpgradeMigrationRegistryErrorCode;
  migrationId: UpgradeMigrationId;
  familyKey: string;
  field?: "checksum" | "fromPackageRevision" | "safety" | "toPackageRevision";
  message: string;
};

export type UpgradeMigrationRegistryValidationResult =
  | {
      ok: true;
      registry: UpgradeMigrationRegistry;
    }
  | {
      ok: false;
      errors: UpgradeMigrationRegistryError[];
    };

const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;

export const bundledSourceSchemaHashFixtures = {
  tasks: "sha256:a859c94790d5d96a61f7845db818dbdfe3467637e01d33a306e58c02d0397849",
  estii: "sha256:ac3758e421ae8aa3424caa5a5834fd403f568db32e4a8e41c6fa48db5b81c7cc",
  site: "sha256:abbb4fc1657238935a198402716bf737108485dacf85e754fff0f49a9c33c095",
  crm: "sha256:4e6fd52a8278a8f315beae8fd45b493e454bf3d2f553a78aeac7c651e0d8aebf",
} as const satisfies Record<SchemaKey, SourceSchemaHash>;

export function sourceSchemaCanonicalJson(schema: unknown): string {
  return JSON.stringify(stableJsonValue(schema));
}

export async function computeSourceSchemaHash(schema: unknown): Promise<SourceSchemaHash> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sourceSchemaCanonicalJson(schema)),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export function isSourceSchemaHash(value: unknown): value is SourceSchemaHash {
  return typeof value === "string" && sha256DigestPattern.test(value);
}

export function isUpgradeMigrationChecksum(value: unknown): value is UpgradeMigrationChecksum {
  return typeof value === "string" && sha256DigestPattern.test(value);
}

export function isUpgradeMigrationSafetyClass(
  value: unknown,
): value is UpgradeMigrationSafetyClass {
  return (
    typeof value === "string" &&
    upgradeMigrationSafetyClasses.includes(value as UpgradeMigrationSafetyClass)
  );
}

export function createUpgradeMigrationRegistry(
  migrations: readonly UpgradeMigrationDefinition[],
): UpgradeMigrationRegistry {
  const result = validateUpgradeMigrationRegistry(migrations);

  if (!result.ok) {
    throw new Error(
      `Upgrade migration registry is invalid: ${result.errors
        .map((error) => error.message)
        .join(" ")}`,
    );
  }

  return result.registry;
}

export function validateUpgradeMigrationRegistry(
  migrations: readonly UpgradeMigrationDefinition[],
): UpgradeMigrationRegistryValidationResult {
  const errors: UpgradeMigrationRegistryError[] = [];
  const seenMigrationKeys = new Set<string>();

  for (const migration of migrations) {
    const familyKey = upgradeMigrationFamilyKey(migration.family);
    const registryKey = `${familyKey}:${migration.id}`;

    if (seenMigrationKeys.has(registryKey)) {
      errors.push({
        code: "duplicate-migration-id",
        migrationId: migration.id,
        familyKey,
        message: `Migration "${migration.id}" is already registered for family "${familyKey}".`,
      });
    } else {
      seenMigrationKeys.add(registryKey);
    }

    if (!isUpgradeMigrationChecksum(migration.checksum)) {
      errors.push({
        code: "invalid-checksum",
        field: "checksum",
        migrationId: migration.id,
        familyKey,
        message: `Migration "${migration.id}" checksum must use "sha256:" followed by 64 lowercase hex characters.`,
      });
    }

    if (!isUpgradeMigrationSafetyClass(migration.safety)) {
      errors.push({
        code: "invalid-safety-class",
        field: "safety",
        migrationId: migration.id,
        familyKey,
        message: `Migration "${migration.id}" safety class is invalid.`,
      });
    }

    if (isPackageAppUpgradeMigration(migration)) {
      addPackageRevisionRangeErrors(migration, familyKey, errors);
    }
  }

  return errors.length === 0
    ? {
        ok: true,
        registry: {
          migrations: [...migrations],
        },
      }
    : {
        ok: false,
        errors,
      };
}

export function listUpgradeMigrations(
  registry: UpgradeMigrationRegistry,
  family?: UpgradeMigrationFamily,
): UpgradeMigrationDefinition[] {
  if (family === undefined) {
    return [...registry.migrations];
  }

  const familyKey = upgradeMigrationFamilyKey(family);

  return registry.migrations.filter(
    (migration) => upgradeMigrationFamilyKey(migration.family) === familyKey,
  );
}

export function upgradeMigrationFamilyKey(family: UpgradeMigrationFamily): string {
  switch (family.kind) {
    case "archive":
      return `archive:${family.archiveFamily}`;
    case "browser-replica":
      return `browser-replica:${family.replicaFamily}`;
    case "package-app":
      return `package-app:${family.packageAppKey}`;
    case "runtime":
      return `runtime:${family.runtimeFamily}`;
    case "storage":
      return `storage:${family.storageFamily}`;
  }
}

function addPackageRevisionRangeErrors(
  migration: PackageAppUpgradeMigration,
  familyKey: string,
  errors: UpgradeMigrationRegistryError[],
) {
  if (!isPackageAppRevision(migration.fromPackageRevision)) {
    errors.push({
      code: "invalid-package-revision-range",
      field: "fromPackageRevision",
      migrationId: migration.id,
      familyKey,
      message: `Migration "${migration.id}" fromPackageRevision must be a positive integer.`,
    });
  }

  if (!isPackageAppRevision(migration.toPackageRevision)) {
    errors.push({
      code: "invalid-package-revision-range",
      field: "toPackageRevision",
      migrationId: migration.id,
      familyKey,
      message: `Migration "${migration.id}" toPackageRevision must be a positive integer.`,
    });
  }

  if (
    isPackageAppRevision(migration.fromPackageRevision) &&
    isPackageAppRevision(migration.toPackageRevision) &&
    migration.fromPackageRevision >= migration.toPackageRevision
  ) {
    errors.push({
      code: "invalid-package-revision-range",
      field: "toPackageRevision",
      migrationId: migration.id,
      familyKey,
      message: `Migration "${migration.id}" toPackageRevision must be greater than fromPackageRevision.`,
    });
  }
}

function isPackageAppUpgradeMigration(
  migration: UpgradeMigrationDefinition,
): migration is PackageAppUpgradeMigration {
  return migration.family.kind === "package-app";
}

function isPackageAppRevision(value: unknown): value is PackageAppRevision {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJsonValue(child)]),
  );
}
