import {
  instanceControlPlaneStorageIdentity,
  schemaKeyStorageIdentity,
  type AppStorageIdentity,
  type InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "../shared/instance-control-plane.ts";
import { findSchemaAppDefinition, type SchemaKey } from "../shared/schema-apps.ts";

export type ClientAppSchemaKey = string;
export type ClientAppStorageIdentity = AppStorageIdentity | InstanceControlPlaneStorageIdentity;
export type ClientAppTarget = SchemaKey | ClientAppStorageIdentity;

export function appStorageIdentityForClientTarget(
  target: ClientAppTarget,
  options: { projectId?: string } = {},
): ClientAppStorageIdentity {
  return typeof target === "string"
    ? schemaKeyStorageIdentity(target, {
        projectId: options.projectId ?? clientProjectStorageId(),
      })
    : target;
}

export function clientTargetStorageName(target: ClientAppTarget): string {
  return appStorageIdentityForClientTarget(target).browserDatabaseName;
}

export function clientTargetSourceSchemaKey(target: ClientAppTarget): ClientAppSchemaKey {
  const identity = appStorageIdentityForClientTarget(target);

  return identity.kind === "instanceControlPlane" ? identity.schemaKey : identity.sourceSchemaKey;
}

export function clientTargetLabel(target: ClientAppTarget): string {
  return clientSchemaKeyLabel(clientTargetSourceSchemaKey(target));
}

export function clientSchemaKeyLabel(schemaKey: ClientAppSchemaKey): string {
  if (schemaKey === INSTANCE_CONTROL_PLANE_SCHEMA_KEY) {
    return "Instance control plane";
  }

  return findSchemaAppDefinition(schemaKey)?.label ?? schemaKey;
}

export function instanceControlPlaneClientTarget(
  options: { projectId?: string } = {},
): InstanceControlPlaneStorageIdentity {
  return instanceControlPlaneStorageIdentity({
    projectId: options.projectId ?? clientProjectStorageId(),
  });
}

export function clientTargetForSchemaKey(schemaKey: ClientAppSchemaKey): ClientAppTarget {
  if (schemaKey === INSTANCE_CONTROL_PLANE_SCHEMA_KEY) {
    return instanceControlPlaneClientTarget();
  }

  if (findSchemaAppDefinition(schemaKey)) {
    return schemaKey as SchemaKey;
  }

  throw new Error(`No bundled client target for schema key "${schemaKey}".`);
}

function clientProjectStorageId(): string | undefined {
  return stringConfigValue(import.meta.env.VITE_FORMLESS_SITE_PROJECT_ID);
}

function stringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
