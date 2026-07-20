import {
  listResolvedAppPackages,
  type AppPackageResolver,
  type ResolvedAppPackage,
} from "./app-packages.ts";
import type { PackageAppKey } from "@dpeek/formless-installed-apps";
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

export function deployPackageAppMetadataFromResolver(
  resolver?: AppPackageResolver,
): FormlessDeployPackageAppMetadata[] {
  return listResolvedAppPackages(resolver).map(deployPackageAppMetadata);
}

function deployPackageAppMetadata(
  appPackage: Pick<ResolvedAppPackage, "packageAppKey" | "packageRevision" | "sourceSchemaHash">,
): FormlessDeployPackageAppMetadata {
  return {
    packageAppKey: appPackage.packageAppKey,
    packageRevision: appPackage.packageRevision,
    sourceSchemaHash: appPackage.sourceSchemaHash,
  };
}
