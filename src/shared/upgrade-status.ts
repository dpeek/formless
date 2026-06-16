import type { AppStorageIdentity } from "./app-storage-identity.ts";
import type { PackageAppKey } from "@dpeek/formless-installed-apps";
import type {
  PackageAppRevision,
  SourceSchemaHash,
  UpgradeMigrationChecksum,
  UpgradeMigrationId,
} from "./upgrade-migrations.ts";

export const INSTANCE_UPGRADE_API_PATH = "/api/formless/upgrade";
export const INSTANCE_UPGRADE_APPLY_API_PATH = `${INSTANCE_UPGRADE_API_PATH}/apply`;
export const INSTANCE_UPGRADE_STATUS_API_PATH = `${INSTANCE_UPGRADE_API_PATH}/status`;
export const APP_STORAGE_UPGRADE_STATUS_API_PATH_SUFFIX = "/upgrade/status";

export type UpgradeInstanceStorageIdentity = {
  authorityName: string;
  kind: "instance";
};

export type UpgradeStorageIdentity = AppStorageIdentity | UpgradeInstanceStorageIdentity;

export type UpgradeSqlMigrationAppliedState = {
  appliedAt: string;
  checksum: UpgradeMigrationChecksum;
  migrationId: UpgradeMigrationId;
  packageVersion: string | null;
  storageFamily: string;
};

export type UpgradePackageAppMigrationAppliedState = {
  appliedAt: string;
  checksum: UpgradeMigrationChecksum;
  fromPackageRevision: PackageAppRevision;
  migrationId: UpgradeMigrationId;
  packageAppKey: PackageAppKey;
  sourceSchemaHash: SourceSchemaHash;
  toPackageRevision: PackageAppRevision;
};

export type UpgradePackageAppMigrationState = {
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
  updatedAt: string;
};

export type UpgradePackageAppMigrationEvidence = {
  applied: UpgradePackageAppMigrationAppliedState[];
  state: UpgradePackageAppMigrationState | null;
};

export type UpgradeStorageIdentityStatus = {
  identity: UpgradeStorageIdentity;
  packageAppMigrations?: UpgradePackageAppMigrationEvidence;
  sqlMigrations: UpgradeSqlMigrationAppliedState[];
};

export type InstanceUpgradeStatusResponse = {
  storageIdentities: UpgradeStorageIdentityStatus[];
};

export type InstanceUpgradeApplyResponse = InstanceUpgradeStatusResponse;
