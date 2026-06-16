import {
  instanceControlPlaneStorageIdentity,
  schemaKeyStorageIdentity,
  type AppStorageIdentity,
  type InstanceControlPlaneStorageIdentity,
} from "../shared/app-storage-identity.ts";
import { INSTANCE_CONTROL_PLANE_SCHEMA_KEY } from "@dpeek/formless-instance-control-plane";
import { findSchemaAppDefinition, type SchemaKey } from "../shared/schema-apps.ts";

export type ClientAppSchemaKey = string;
export type ClientAppStorageIdentity = AppStorageIdentity | InstanceControlPlaneStorageIdentity;
export type ClientAppTarget = SchemaKey | ClientAppStorageIdentity;

export function appStorageIdentityForClientTarget(
  target: ClientAppTarget,
): ClientAppStorageIdentity {
  return typeof target === "string" ? schemaKeyStorageIdentity(target) : target;
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

export function instanceControlPlaneClientTarget(): InstanceControlPlaneStorageIdentity {
  return instanceControlPlaneStorageIdentity();
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
