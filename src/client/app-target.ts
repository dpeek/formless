import {
  schemaKeyStorageIdentity,
  type AppStorageIdentity,
} from "../shared/app-storage-identity.ts";
import type { SchemaKey } from "../shared/schema-apps.ts";

export type ClientAppTarget = SchemaKey | AppStorageIdentity;

export function appStorageIdentityForClientTarget(
  target: ClientAppTarget,
  options: { projectId?: string } = {},
): AppStorageIdentity {
  return typeof target === "string"
    ? schemaKeyStorageIdentity(target, {
        projectId: options.projectId ?? clientProjectStorageId(),
      })
    : target;
}

export function clientTargetStorageName(target: ClientAppTarget): string {
  return appStorageIdentityForClientTarget(target).browserDatabaseName;
}

export function clientTargetSourceSchemaKey(target: ClientAppTarget): SchemaKey {
  return appStorageIdentityForClientTarget(target).sourceSchemaKey;
}

function clientProjectStorageId(): string | undefined {
  return stringConfigValue(import.meta.env.VITE_FORMLESS_SITE_PROJECT_ID);
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
