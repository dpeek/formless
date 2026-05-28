import type { PackageAppKey } from "./app-installs.ts";
import type { PackageAppRevision, SourceSchemaHash } from "./upgrade-migrations.ts";

export const FORMLESS_DEPLOY_METADATA_PATH = "/api/formless/deploy";
export const FORMLESS_RUNTIME_PROTOCOL_VERSION = 1;
export const FORMLESS_STORAGE_MIGRATION_SET_ID = "formless-storage-migrations:v1";

export type FormlessDeployMetadata = {
  packageApps: FormlessDeployPackageAppMetadata[];
  packageVersion: string | null;
  runtimeProtocolVersion: number;
  storageMigrationSet: string;
  version: string | null;
};

export type FormlessDeployPackageAppMetadata = {
  packageAppKey: PackageAppKey;
  packageRevision: PackageAppRevision;
  sourceSchemaHash: SourceSchemaHash;
};
